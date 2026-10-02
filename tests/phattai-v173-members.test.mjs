import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyCurrentSchema} from './helpers/schema.mjs';
import worker from '../src/worker.js';

function fixture(){
 const db=new DatabaseSync(':memory:');applyCurrentSchema(db);
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},_run(){return db.prepare(sql).run(...args)}}},async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s._run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,ASSETS:{fetch:async()=>new Response('not found',{status:404})},ORDERING_ENABLED:'true',SESSION_SECRET:'phattai-test-secret-012345678901234567890123',POS_STAFF_PASSWORD:'phattai-test-password'};
 const call=async(path,method='GET',body=null,headers={})=>{const h={Origin:'https://pos-phattai.test','CF-Connecting-IP':'203.0.113.7',...headers};if(body!==null&&!('Content-Type' in h))h['Content-Type']='application/json';const r=await worker.fetch(new Request('https://pos-phattai.test'+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)}),env);const ct=r.headers.get('content-type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]}};
 return {db,env,call};
}
async function owner(fx,ip){const r=await fx.call('/api/staff/login','POST',{username:'huang',password:'phattai-test-password'},ip?{'CF-Connecting-IP':ip}:{});assert.equal(r.status,200,JSON.stringify(r.data));return {Authorization:'Bearer '+r.data.token}}
const item=pid=>({productId:pid,qty:1,mods:{size:'中',spice:'中',note:''}});

test('MEMBER staff registers a customer; lookup finds them; bad input and duplicates are refused',async()=>{
 const fx=fixture(),h=await owner(fx);
 const ok=await fx.call('/api/staff/members/register','POST',{phone:'0909123456',name:'  Nguyễn Văn A  '},h);
 assert.equal(ok.status,201,JSON.stringify(ok.data));assert.equal(ok.data.member.displayName,'Nguyễn Văn A');assert.equal(ok.data.member.phone,'0909123456');
 const found=await fx.call('/api/staff/members?phone=0909123456','GET',null,h);assert.equal(found.data.member.name,'Nguyễn Văn A');assert.equal(found.data.member.points,0);
 assert.equal((await fx.call('/api/staff/members/register','POST',{phone:'0909123456',name:'Khác'},h)).status,409);
 for(const [phone,name] of [['123','An'],['0909abc123','An'],['090912345678901','An'],['','An'],['0911222333','A'],['0911222333',''],['0911222334',' ']])
  assert.equal((await fx.call('/api/staff/members/register','POST',{phone,name},h)).status,400,phone+'|'+name.length);
 const long=await fx.call('/api/staff/members/register','POST',{phone:'0911222335',name:'x'.repeat(81)},h);assert.equal(long.status,201);assert.equal(long.data.member.displayName.length,80,'over-long names are cut, not rejected');
 // formats customers actually type
 const intl=await fx.call('/api/staff/members/register','POST',{phone:'+84 912-345-678',name:'Lan'},h);assert.equal(intl.status,201);assert.equal(intl.data.member.phone,'0912345678');
 assert.equal((await fx.call('/api/staff/members/register','POST',{phone:'84912345678',name:'Lan 2'},h)).status,409,'same number in another format is a duplicate');
 assert.equal((await fx.call('/api/staff/members/register','POST',{phone:'0909123456',name:'x'})).status,401,'staff route needs a staff login');
 fx.db.close();
});
test('MEMBER customer self-registers from the QR page, stays signed in, logs out and back in, changes password',async()=>{
 const fx=fixture();
 const reg=await fx.call('/api/member/register','POST',{phone:'0933444555',name:'Hoa'});assert.equal(reg.status,201,JSON.stringify(reg.data));assert.ok(reg.cookie.includes('='));
 const me=await fx.call('/api/member/me','GET',null,{Cookie:reg.cookie});assert.equal(me.data.member.displayName,'Hoa');
 assert.equal((await fx.call('/api/member/logout','POST',{},{Cookie:reg.cookie})).status,200);
 assert.equal((await fx.call('/api/member/login','POST',{phone:'0933444555',password:'wrong'})).status,401);
 const login=await fx.call('/api/member/login','POST',{phone:'0933444555',password:'0933444555'});assert.equal(login.status,200);
 const change=await fx.call('/api/member/password','POST',{currentPassword:'0933444555',newPassword:'MoiMoi12345'},{Cookie:login.cookie});
 assert.ok([200,204].includes(change.status),change.status+JSON.stringify(change.data));
 assert.equal((await fx.call('/api/member/login','POST',{phone:'0933444555',password:'0933444555'})).status,401,'old password no longer works');
 assert.equal((await fx.call('/api/member/login','POST',{phone:'0933444555',password:'MoiMoi12345'})).status,200);
 fx.db.close();
});
test('MEMBER an order tied to a member earns points and shows in their record after payment',async()=>{
 const fx=fixture(),h=await owner(fx);
 const m=(await fx.call('/api/staff/members/register','POST',{phone:'0977111222',name:'Minh'},h)).data.member;
 const made=await fx.call('/api/staff/orders','POST',{table:'T01',items:[item('109'),item('101')],memberId:m.id,idempotencyKey:crypto.randomUUID()},h);assert.equal(made.status,201,JSON.stringify(made.data));
 const o=made.data.order;assert.equal(o.total,215000);
 const paid=await fx.call('/api/staff/orders/'+o.id+'/pay','POST',{version:o.version,method:'CASH',received:o.total},h);assert.equal(paid.status,200,JSON.stringify(paid.data));
 const after=(await fx.call('/api/staff/members?phone=0977111222','GET',null,h)).data.member;
 assert.equal(after.orders,1);assert.equal(after.spend,215000);assert.ok(after.points>0,'points earned: '+after.points);
 assert.equal((await fx.call('/api/staff/orders','POST',{table:'T02',items:[item('109')],memberId:'no-such-member',idempotencyKey:crypto.randomUUID()},h)).status,400);
 fx.db.close();
});
test('MEMBER a busy shop behind one Wi-Fi address can register and log in more than a handful of customers per 15 minutes',async()=>{
 const fx=fixture(),h=await owner(fx);
 // one shop IP: counter staff register 12 walk-in customers within minutes
 for(let i=0;i<12;i++){const r=await fx.call('/api/staff/members/register','POST',{phone:'09010000'+String(10+i),name:'Khách '+i},h);assert.equal(r.status,201,'staff registration #'+(i+1)+' → '+r.status)}
 // staff log customers in at the counter
 for(let i=0;i<12;i++){const r=await fx.call('/api/staff/members/login','POST',{phone:'09010000'+String(10+i),password:'09010000'+String(10+i)},h);assert.equal(r.status,200,'staff member login #'+(i+1)+' → '+r.status)}
 // the owner signing in on several devices is not locked out by successful logins
 for(let i=0;i<12;i++)await owner(fx);
 fx.db.close();
});
test('MEMBER guessing is still stopped: wrong passwords from one address are limited',async()=>{
 const fx=fixture();await fx.call('/api/member/register','POST',{phone:'0944555666',name:'K'},{'CF-Connecting-IP':'198.51.100.1'});
 let blocked=0;for(let i=0;i<14;i++){const r=await fx.call('/api/member/login','POST',{phone:'0944555666',password:'x'+i},{'CF-Connecting-IP':'198.51.100.9'});if(r.status===429)blocked++}
 assert.ok(blocked>0,'brute force must hit the limit');
 const wrongStaff=[];for(let i=0;i<14;i++)wrongStaff.push((await fx.call('/api/staff/login','POST',{username:'huang',password:'nope'+i},{'CF-Connecting-IP':'198.51.100.10'})).status);
 assert.ok(wrongStaff.includes(429),'staff password guessing must hit the limit');
 fx.db.close();
});
