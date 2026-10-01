import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {applyCurrentSchema} from './helpers/schema.mjs';
import worker from '../src/worker.js';
import {parseReportShifts} from '../src/reports.js';

const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
function fixture(){
 const db=new DatabaseSync(':memory:');applyCurrentSchema(db);
 const stats={prepares:0};
 const DB={prepare(sql){stats.prepares++;let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},_run(){return db.prepare(sql).run(...args)}}},async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s._run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,ASSETS:{fetch:async()=>new Response('not found',{status:404})},ORDERING_ENABLED:'true',ALLOW_UNVERIFIED_MEMBER_VOUCHERS:'true',SESSION_SECRET:'phattai-test-secret-012345678901234567890123',POS_STAFF_PASSWORD:'phattai-test-password'};
 const call=async(path,method='GET',body=null,headers={})=>{const h={Origin:'https://pos-phattai.test',...headers};if(body!==null&&!('Content-Type' in h))h['Content-Type']='application/json';const r=await worker.fetch(new Request('https://pos-phattai.test'+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)}),env);const ct=r.headers.get('content-type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text()}};
 return {db,env,call,stats};
}
async function owner(fx){const r=await fx.call('/api/staff/login','POST',{username:'huang',password:'phattai-test-password'});assert.equal(r.status,200);return {Authorization:'Bearer '+r.data.token}}


async function paidOrderAt(fx,h,paidAtIso){
 const created=await fx.call('/api/staff/orders','POST',{table:'T01',items:[{productId:'109',qty:1,mods:{size:'中',spice:'中',note:''}}],idempotencyKey:crypto.randomUUID()},h);
 assert.equal(created.status,201,JSON.stringify(created.data));const o=created.data.order;
 const paid=await fx.call('/api/staff/orders/'+o.id+'/pay','POST',{version:o.version,method:'CASH',received:o.total},h);
 assert.equal(paid.status,200,JSON.stringify(paid.data));
 fx.db.prepare('UPDATE qr_orders SET paid_at=? WHERE id=?').run(paidAtIso,o.id);return paid.data.order;
}

test('SHIFTS owner saves the shop shift list and it persists in D1',async()=>{
 const fx=fixture(),h=await owner(fx);
 assert.deepEqual((await fx.call('/api/staff/report-shifts','GET',null,h)).data.shifts,[]);
 const shifts=[{name:'Ca sáng',start:'06:00',end:'14:00'},{name:'Ca tối',start:'18:00',end:'02:00'}];
 const put=await fx.call('/api/staff/report-shifts','PUT',{shifts},h);assert.equal(put.status,200);assert.deepEqual(put.data.shifts,shifts);
 assert.deepEqual((await fx.call('/api/staff/report-shifts','GET',null,h)).data.shifts,shifts);
 fx.db.close();
});
test('SHIFTS invalid lists are refused and nothing changes',async()=>{
 const fx=fixture(),h=await owner(fx),good=[{name:'Ca 1',start:'07:00',end:'15:00'}];
 await fx.call('/api/staff/report-shifts','PUT',{shifts:good},h);
 for(const shifts of [[{name:'',start:'07:00',end:'15:00'}],[{name:'A',start:'07:00',end:'07:00'}],[{name:'A',start:'7:00',end:'15:00'}],[{name:'A',start:'07:00',end:'15:00'},{name:'a',start:'15:00',end:'23:00'}],Array.from({length:13},(_,i)=>({name:'C'+i,start:'07:00',end:'08:00'})),'x']){
  assert.equal((await fx.call('/api/staff/report-shifts','PUT',{shifts},h)).status,400,JSON.stringify(shifts).slice(0,60));
 }
 assert.deepEqual((await fx.call('/api/staff/report-shifts','GET',null,h)).data.shifts,good);
 assert.equal((await fx.call('/api/staff/report-shifts','GET')).status,401);
 fx.db.close();
});
test('SHIFTS report counts only payments inside the shift, including a shift that runs past midnight',async()=>{
 const fx=fixture(),h=await owner(fx);
 const morning=await paidOrderAt(fx,h,'2026-10-01T02:00:00.000Z');   // 09:00 VN, Oct 1
 const late=await paidOrderAt(fx,h,'2026-10-01T16:30:00.000Z');      // 23:30 VN, Oct 1
 const afterMidnight=await paidOrderAt(fx,h,'2026-10-01T18:00:00.000Z'); // 01:00 VN, Oct 2
 const q=(start,end)=>fx.call('/api/staff/reports/shift?'+new URLSearchParams({date:'2026-10-01',start,end,name:'x'}),'GET',null,h);
 const day=(await q('06:00','14:00')).data.report;
 assert.deepEqual(day.payments.map(p=>p.orderId),[morning.id]);assert.equal(day.cash,morning.total);
 const night=(await q('18:00','02:00')).data.report;
 assert.deepEqual(night.payments.map(p=>p.orderId).sort(),[late.id,afterMidnight.id].sort());assert.equal(night.gross,late.total+afterMidnight.total);
 assert.equal((await q('10:00','10:00')).status,400);
 fx.db.close();
});
test('STAFF report covers the hours a person clocked in, falls back to the schedule, and caps a forgotten clock-out',async()=>{
 const fx=fixture(),h=await owner(fx);
 const before=await paidOrderAt(fx,h,'2026-10-01T00:30:00.000Z');  // 07:30 VN
 const first=await paidOrderAt(fx,h,'2026-10-01T02:00:00.000Z');   // 09:00 VN
 const gap=await paidOrderAt(fx,h,'2026-10-01T05:30:00.000Z');     // 12:30 VN
 const second=await paidOrderAt(fx,h,'2026-10-01T08:00:00.000Z');  // 15:00 VN
 const now=Date.parse('2026-10-01T20:00:00.000Z');
 fx.db.prepare("INSERT INTO pos_staff_users(id,username,display_name,role_id,password_salt,password_hash,active,created_at,updated_at) VALUES('u-lan','lan','Lan','MANAGER','s','h',1,'x','x'),('u-minh','minh','Minh','MANAGER','s','h',1,'x','x'),('u-ha','ha','Hà','MANAGER','s','h',1,'x','x')").run();
 // Lan: two clock-ins 08:00–12:00 and 14:00–16:00 VN, plus a schedule that must be ignored because she clocked in.
 fx.db.prepare("INSERT INTO pos_attendance(id,staff_id,work_date,clock_in,clock_out,status) VALUES('a1','u-lan','2026-10-01','2026-10-01T01:00:00.000Z','2026-10-01T05:00:00.000Z','CLOSED'),('a2','u-lan','2026-10-01','2026-10-01T07:00:00.000Z','2026-10-01T09:00:00.000Z','CLOSED')").run();
 fx.db.prepare("INSERT INTO pos_shift_schedules(id,staff_id,work_date,start_time,end_time,created_by,created_at) VALUES('s1','u-lan','2026-10-01','06:00','22:00','OWNER','x'),('s2','u-minh','2026-10-01','12:00','13:00','OWNER','x')").run();
 // Hà clocked in at 08:00 VN and never clocked out: counted for at most 16 hours.
 fx.db.prepare("INSERT INTO pos_attendance(id,staff_id,work_date,clock_in,status) VALUES('a3','u-ha','2026-10-01','2026-10-01T01:00:00.000Z','OPEN')").run();
 const {workedPeriods,staffReport}=await import('../src/reports.js');
 const people=await workedPeriods(fx.env,'2026-10-01',now);
 assert.deepEqual(people.map(p=>[p.name,p.source,p.periods.map(x=>x.start+'-'+x.end+(x.open?'*':''))]),[['Hà','ATTENDANCE',['08:00-00:00*']],['Lan','ATTENDANCE',['08:00-12:00','14:00-16:00']],['Minh','SCHEDULE',['12:00-13:00']]]);
 const lan=await staffReport(fx.env,'2026-10-01','u-lan',now);
 assert.deepEqual(lan.payments.map(p=>p.orderId).sort(),[first.id,second.id].sort());assert.equal(lan.gross,first.total+second.total);
 assert.deepEqual((await staffReport(fx.env,'2026-10-01','u-minh',now)).payments.map(p=>p.orderId),[gap.id]);
 assert.deepEqual((await staffReport(fx.env,'2026-10-01','u-ha',now)).payments.map(p=>p.orderId).sort(),[first.id,gap.id,second.id].sort());
 assert.ok(!(await staffReport(fx.env,'2026-10-01','u-ha',now)).payments.some(p=>p.orderId===before.id));
 const listed=await fx.call('/api/staff/reports/workers?date=2026-10-01','GET',null,h);assert.equal(listed.status,200);assert.equal(listed.data.staff.length,3);
 assert.equal((await fx.call('/api/staff/reports/staff?date=2026-10-01&staffId=u-lan','GET',null,h)).data.report.reportType,'STAFF');
 assert.equal((await fx.call('/api/staff/reports/staff?date=2026-10-01&staffId=nobody','GET',null,h)).status,404);
 assert.equal((await fx.call('/api/staff/reports/staff?date=bad&staffId=u-lan','GET',null,h)).status,400);
 fx.db.close();
});
test('SHIFTS parser keeps names and times exactly, max 12, case-insensitive unique names',()=>{
 assert.deepEqual(parseReportShifts([{name:' Ca trưa ',start:'11:00',end:'16:00'}]),[{name:'Ca trưa',start:'11:00',end:'16:00'}]);
 assert.equal(parseReportShifts(null),null);assert.equal(parseReportShifts([{name:'X',start:'24:00',end:'01:00'}]),null);
});
test('SHIFTS Staff UI: day → one tap on a shift or a staff member; custom hours stay optional',()=>{
 assert.match(STAFF,/api\('GET','\/api\/staff\/report-shifts'\)/);
 assert.match(STAFF,/api\('PUT','\/api\/staff\/report-shifts',\{shifts\}\)/);
 assert.match(STAFF,/api\('GET','\/api\/staff\/reports\/workers\?date='/);
 assert.match(STAFF,/if\(b\.dataset\.reportShift!==undefined\)\{[^}]*await loadReport\(\)/);
 assert.match(STAFF,/if\(b\.dataset\.reportStaff!==undefined\)\{[^}]*await loadReport\(\)/);
 assert.match(STAFF,/<details class="report-custom"/);
 // Chip and remove buttons carry no data-action, so they must be handled before the action guard.
 const guard=STAFF.indexOf('const action=b.dataset.action;if(!action)return;');
 for(const key of ['b.dataset.reportMode','b.dataset.reportShift!==','b.dataset.reportStaff!==','b.dataset.tplRemove!=='])assert.ok(STAFF.indexOf('if('+key)>0&&STAFF.indexOf('if('+key)<guard,key);
 assert.match(STAFF,/\$\{reportShiftEditor\(\)\}/);
});
