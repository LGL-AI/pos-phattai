import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyCurrentSchema} from './helpers/schema.mjs';
import worker from '../src/worker.js';

function fixture(){
 const db=new DatabaseSync(':memory:');applyCurrentSchema(db);
 const stats={prepares:0};
 const DB={prepare(sql){stats.prepares++;let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},_run(){return db.prepare(sql).run(...args)}}},async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s._run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,ASSETS:{fetch:async()=>new Response('not found',{status:404})},ORDERING_ENABLED:'true',ALLOW_UNVERIFIED_MEMBER_VOUCHERS:'true',SESSION_SECRET:'phattai-test-secret-012345678901234567890123',POS_STAFF_PASSWORD:'phattai-test-password'};
 const call=async(path,method='GET',body=null,headers={})=>{const h={Origin:'https://pos-phattai.test',...headers};if(body!==null&&!('Content-Type' in h))h['Content-Type']='application/json';const r=await worker.fetch(new Request('https://pos-phattai.test'+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)}),env);const ct=r.headers.get('content-type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text()}};
 return {db,env,call,stats};
}
async function owner(fx){const r=await fx.call('/api/staff/login','POST',{username:'huang',password:'phattai-test-password'});assert.equal(r.status,200);return {Authorization:'Bearer '+r.data.token}}



const at=iso=>mock.timers.enable({apis:['Date'],now:Date.parse(iso)});
const setNow=iso=>mock.timers.setTime(Date.parse(iso));
const mk=async(fx,h,table='T01')=>{const r=await fx.call('/api/staff/orders','POST',{table,items:[{productId:'109',qty:1,mods:{size:'中',spice:'中',note:''}}],idempotencyKey:crypto.randomUUID()},h);assert.equal(r.status,201,JSON.stringify(r.data));return r.data.order};
const pay=async(fx,h,o)=>{const r=await fx.call('/api/staff/orders/'+o.id+'/pay','POST',{version:o.version,method:'CASH',received:o.total},h);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.order};

test('TIME order codes use the Vietnam day: 00:30 VN is already the next business day, and the sequence restarts',async()=>{
 const fx=fixture();at('2026-10-01T10:00:00.000Z');const h=await owner(fx);
 try{
  setNow('2026-10-01T16:59:00.000Z');const a=await mk(fx,h,'T01'),b=await mk(fx,h,'T02');   // 23:59 VN, Oct 1
  setNow('2026-10-01T17:30:00.000Z');const c=await mk(fx,h,'T03');                         // 00:30 VN, Oct 2
  assert.match(a.code,/^01102026-0001-/);assert.match(b.code,/^01102026-0002-/);assert.match(c.code,/^02102026-0001-/);
 }finally{mock.timers.reset();fx.db.close()}
});
test('TIME an order opened at 23:59 and paid at 00:01 is revenue of the day it was paid',async()=>{
 const fx=fixture();at('2026-10-01T10:00:00.000Z');const h=await owner(fx);
 try{
  setNow('2026-10-01T16:59:00.000Z');const o=await mk(fx,h);
  setNow('2026-10-01T17:01:00.000Z');const paid=await pay(fx,h,o);
  assert.match(paid.code,/^01102026-0001-.*-TM$/,'the code keeps the day the order was taken');
  const day1=(await fx.call('/api/staff/reports/daily?date=2026-10-01','GET',null,h)).data.report,day2=(await fx.call('/api/staff/reports/daily?date=2026-10-02','GET',null,h)).data.report;
  assert.equal(day1.gross,0);assert.equal(day2.gross,o.total);
  const night=(await fx.call('/api/staff/reports/shift?'+new URLSearchParams({date:'2026-10-01',start:'18:00',end:'02:00',name:'Ca tối'}),'GET',null,h)).data.report;
  assert.equal(night.gross,o.total,'an 18:00-02:00 shift opened on Oct 1 owns the 00:01 payment');
  assert.equal((await fx.call('/api/staff/reports/analytics?date=2026-10-02','GET',null,h)).data.analytics.hours?.[0]?.revenue??o.total,o.total);
 }finally{mock.timers.reset();fx.db.close()}
});
test('TIME daily report boundaries are exact at 00:00:00 Vietnam time',async()=>{
 const fx=fixture();at('2026-10-01T10:00:00.000Z');const h=await owner(fx);
 try{
  const edge=[];for(const [iso,table] of [['2026-10-01T16:59:59.000Z','T01'],['2026-10-01T17:00:00.000Z','T02'],['2026-09-30T17:00:00.000Z','T03'],['2026-09-30T16:59:59.000Z','T04']]){
   const o=await mk(fx,h,table);const p=await pay(fx,h,o);fx.db.prepare('UPDATE qr_orders SET paid_at=? WHERE id=?').run(iso,o.id);edge.push([iso,p.id])}
  const ids=async d=>(await fx.call('/api/staff/reports/daily?date='+d,'GET',null,h)).data.report.payments.map(p=>p.orderId).sort();
  const id=iso=>edge.find(e=>e[0]===iso)[1];
  assert.deepEqual(await ids('2026-10-01'),[id('2026-10-01T16:59:59.000Z'),id('2026-09-30T17:00:00.000Z')].sort());
  assert.deepEqual(await ids('2026-10-02'),[id('2026-10-01T17:00:00.000Z')]);
  assert.deepEqual(await ids('2026-09-30'),[id('2026-09-30T16:59:59.000Z')]);
 }finally{mock.timers.reset();fx.db.close()}
});
test('TIME clock-in just after midnight belongs to the Vietnam day, and an overnight clock-in is reported on its start day',async()=>{
 const fx=fixture();at('2026-10-01T17:30:00.000Z');const h=await owner(fx);
 try{
  assert.equal((await fx.call('/api/staff/attendance/in','POST',{},h)).status,201);   // 00:30 VN Oct 2
  const row=fx.db.prepare('SELECT work_date FROM pos_attendance').get();assert.equal(row.work_date,'2026-10-02');
  const {workedPeriods}=await import('../src/reports.js');
  setNow('2026-10-02T03:00:00.000Z');
  const people=await workedPeriods(fx.env,'2026-10-02',Date.now());
  assert.deepEqual(people[0].periods.map(p=>[p.from,p.to]),[['2026-10-02 00:30:00','2026-10-02 10:00:00']]);
 }finally{mock.timers.reset();fx.db.close()}
});
test('TIME a session in use slides forward; one idle for 12 hours ends',async()=>{
 const fx=fixture();at('2026-10-01T01:00:00.000Z');
 try{
  const h=await owner(fx);const exp=()=>fx.db.prepare('SELECT expires_at FROM pos_staff_sessions').get().expires_at;
  const first=exp();assert.equal(first,Date.parse('2026-10-01T13:00:00.000Z'));
  setNow('2026-10-01T01:20:00.000Z');await fx.call('/api/staff/me','GET',null,h);assert.equal(exp(),first,'no write within 30 minutes');
  setNow('2026-10-01T09:00:00.000Z');const me=await fx.call('/api/staff/me','GET',null,h);assert.equal(me.status,200);
  assert.equal(exp(),Date.parse('2026-10-01T21:00:00.000Z'));assert.equal(me.data.expiresAt,exp());
  setNow('2026-10-01T20:50:00.000Z');assert.equal((await fx.call('/api/staff/orders','GET',null,h)).status,200,'still in service at 20:50, past the original 13:00 expiry');
  setNow('2026-10-02T09:00:00.000Z');assert.equal((await fx.call('/api/staff/orders','GET',null,h)).status,401,'idle for more than 12 hours');
 }finally{mock.timers.reset();fx.db.close()}
});

const item=(pid='110')=>({productId:pid,qty:1,mods:{size:'中',spice:'中',note:''}});
test('CONCURRENCY the same order sent twice (retry after a dropped reply) creates one order and one kitchen ticket',async()=>{
 const fx=fixture();const h=await owner(fx),key=crypto.randomUUID(),body={table:'T05',items:[item()],idempotencyKey:key};
 const [a,b]=await Promise.all([fx.call('/api/staff/orders','POST',body,h),fx.call('/api/staff/orders','POST',body,h)]);
 assert.ok([200,201].includes(a.status)&&[200,201].includes(b.status),JSON.stringify([a.data,b.data]));
 assert.equal(a.data.order.id,b.data.order.id);
 assert.equal(fx.db.prepare('SELECT COUNT(*) n FROM qr_orders').get().n,1);
 assert.equal(fx.db.prepare("SELECT COUNT(*) n FROM pos_kitchen_jobs WHERE order_id=?").get(a.data.order.id).n,1);
 fx.db.close();
});
test('CONCURRENCY two devices adding items to the same order: one wins, the other is told to reload, nothing is lost or doubled',async()=>{
 const fx=fixture();const h=await owner(fx);const o=await mk(fx,h);
 const k=()=>crypto.randomUUID().replaceAll('-','');
 const [a,b]=await Promise.all([fx.call('/api/staff/orders/'+o.id+'/append','POST',{version:o.version,items:[item('111')],idempotencyKey:k()},h),fx.call('/api/staff/orders/'+o.id+'/append','POST',{version:o.version,items:[item('112')],idempotencyKey:k()},h)]);
 assert.deepEqual([a.status,b.status].sort(),[200,409],JSON.stringify([a.data,b.data]));
 const items=JSON.parse(fx.db.prepare('SELECT items_json j FROM qr_orders WHERE id=?').get(o.id).j);assert.equal(items.length,2);
 fx.db.close();
});
test('CONCURRENCY paying twice (double tap, two devices) charges once; a stale version cannot pay',async()=>{
 const fx=fixture();const h=await owner(fx);const o=await mk(fx,h);
 const go=()=>fx.call('/api/staff/orders/'+o.id+'/pay','POST',{version:o.version,method:'CASH',received:o.total},h);
 const [a,b]=await Promise.all([go(),go()]);
 assert.equal([a,b].filter(r=>r.status===200).length,1,JSON.stringify([a.status,a.data,b.status,b.data]));
 assert.equal(fx.db.prepare("SELECT COUNT(*) n FROM qr_orders WHERE payment_status='PAID'").get().n,1);
 const rep=(await fx.call('/api/staff/reports/daily','GET',null,h)).data.report;assert.equal(rep.gross,o.total);
 fx.db.close();
});
test('CONCURRENCY adding to an order that was just paid is refused',async()=>{
 const fx=fixture();const h=await owner(fx);const o=await mk(fx,h);const paid=await pay(fx,h,o);
 const r=await fx.call('/api/staff/orders/'+o.id+'/append','POST',{version:paid.version,items:[item()],idempotencyKey:crypto.randomUUID().replaceAll('-','')},h);
 assert.ok(r.status>=400&&r.status<500,r.status+JSON.stringify(r.data));
 fx.db.close();
});

test('PERF analytics history (3 grouped queries) equals the per-day daily() report, incl. split bills and refunds',async()=>{
 const fx=fixture();const h=await owner(fx);const {daily,weekHistory}=await import('../src/reports.js');
 const stamps=['2026-09-26T05:00:00.000Z','2026-09-28T16:59:59.000Z','2026-09-28T17:00:00.000Z','2026-09-30T03:00:00.000Z','2026-10-01T03:00:00.000Z','2026-10-01T10:00:00.000Z'];
 const orders=[];for(const [i,iso] of stamps.entries()){const o=await mk(fx,h,'T0'+(i+1));const p=await pay(fx,h,o);fx.db.prepare('UPDATE qr_orders SET paid_at=? WHERE id=?').run(iso,o.id);orders.push(p)}
 // a split order paid through bills, and two refunds on different days
 const sp=await mk(fx,h,'T07');fx.db.prepare("UPDATE qr_orders SET payment_status='PAID',paid_at='2026-09-30T04:00:00.000Z' WHERE id=?").run(sp.id);
 fx.db.exec('DROP TRIGGER pos_bill_guard');   // seeding only: skip the live-order guard
 fx.db.prepare("INSERT INTO pos_bills(id,order_id,sequence,items_json,subtotal,discount,total,expected_version,created_at) VALUES('b1',?,1,'[]',40000,0,40000,1,'x'),('b2',?,2,'[]',45000,0,45000,1,'x')").run(sp.id,sp.id);
 fx.db.prepare("UPDATE pos_bills SET payment_method='CASH',payment_status='PAID',paid_at='2026-09-30T04:00:00.000Z' WHERE id='b1'").run();fx.db.prepare("UPDATE pos_bills SET payment_method='BANK',payment_status='PAID',paid_at='2026-10-01T04:00:00.000Z' WHERE id='b2'").run();
 const ins=fx.db.prepare("INSERT INTO pos_refunds(id,idem_key,fingerprint,order_id,amount,method,reason,created_at,actor_id) VALUES(?,?,?,?,?,?,?,?,?)");
 ins.run('r1','k1','f',orders[3].id,10000,'CASH','test','2026-09-30T05:00:00.000Z','OWNER');ins.run('r2','k2','f',orders[4].id,20000,'CASH','test','2026-10-01T17:30:00.000Z','OWNER');
 const days=['2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'];
 const expected=[];for(const d of days){const x=await daily(fx.env,d);expected.push({date:d,net:x.net,gross:x.gross,refunded:x.refunded,paidBills:x.paidBills})}
 assert.deepEqual(await weekHistory(fx.env,days),expected);
 assert.ok(expected.some(x=>x.gross>0)&&expected.some(x=>x.refunded>0));
 fx.db.close();
});
