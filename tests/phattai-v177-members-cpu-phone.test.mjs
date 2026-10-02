import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {applyCurrentSchema} from './helpers/schema.mjs';
import worker,{phone} from '../src/worker.js';
import {hashPassword,verifyPassword} from '../src/password.js';

// Production: every member registration failed with "Thao tác hội viên không thành công". PBKDF2 at
// 120,000 rounds needs 50-90 ms of CPU; the Workers Free plan allows 10 ms, so Cloudflare answered with
// its own error page (1102) instead of the Worker's JSON. Local tests had no CPU limit and passed.
function fixture(){
 const db=new DatabaseSync(':memory:');applyCurrentSchema(db);
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},_run(){return db.prepare(sql).run(...args)}}},async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s._run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,ASSETS:{fetch:async()=>new Response('not found',{status:404})},ORDERING_ENABLED:'true',SESSION_SECRET:'phattai-test-secret-012345678901234567890123',POS_STAFF_PASSWORD:'phattai-test-password'};
 const call=async(path,method='GET',body=null,headers={})=>{const h={Origin:'https://pos-phattai.test','CF-Connecting-IP':'203.0.113.7',...headers};if(body!==null&&!('Content-Type' in h))h['Content-Type']='application/json';const r=await worker.fetch(new Request('https://pos-phattai.test'+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)}),env);const ct=r.headers.get('content-type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]}};
 return {db,env,call};
}
async function owner(fx){const r=await fx.call('/api/staff/login','POST',{username:'huang',password:'phattai-test-password'});assert.equal(r.status,200);return {Authorization:'Bearer '+r.data.token}}

// Count PBKDF2 work while a block runs: none may happen for new members or staff accounts.
async function pbkdf2Calls(run){
 const subtle=globalThis.crypto.subtle,original=subtle.deriveBits;let calls=0;
 subtle.deriveBits=function(...args){calls++;return original.apply(this,args)};
 try{await run()}finally{subtle.deriveBits=original}
 return calls;
}

test('CPU registering, signing in and changing a member password does no PBKDF2 and stays far under 10 ms',async()=>{
 const fx=fixture();let reg,login;
 const calls=await pbkdf2Calls(async()=>{
  reg=await fx.call('/api/member/register','POST',{phone:'0933444555',name:'Hoa'});
  login=await fx.call('/api/member/login','POST',{phone:'0933444555',password:'0933444555'});
  const change=await fx.call('/api/member/password','POST',{currentPassword:'0933444555',newPassword:'Hoa12345'},{Cookie:login.cookie});
  assert.equal(change.status,200,JSON.stringify(change.data));
 });
 assert.equal(reg.status,201,JSON.stringify(reg.data));assert.equal(login.status,200);
 assert.equal(calls,0,'no PBKDF2 for members created now');
 const row=fx.db.prepare('SELECT password_hash,hash_iterations FROM members WHERE phone=?').get('0933444555');
 assert.match(row.password_hash,/^k1:[0-9a-f]{64}$/);assert.equal(row.hash_iterations,0);
 const env={SESSION_SECRET:'phattai-test-secret-012345678901234567890123'},t=performance.now();
 for(let i=0;i<50;i++)await hashPassword(env,'0933444555','c2FsdHNhbHRzYWx0c2FsdA==');
 assert.ok((performance.now()-t)/50<2,'a password hash costs well under the 10 ms budget');
 fx.db.close();
});

test('CPU members and staff made before still sign in with their PBKDF2 hash (where CPU allows)',async()=>{
 const fx=fixture(),salt='c2FsdHNhbHRzYWx0c2FsdA==',te=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',te.encode('0977000111'),'PBKDF2',false,['deriveBits']);
 const legacy=Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Buffer.from(salt,'base64'),iterations:120000,hash:'SHA-256'},key,256)).toString('hex');
 const at=new Date().toISOString();
 fx.db.prepare('INSERT INTO members(id,phone,display_name,password_salt,password_hash,hash_iterations,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('legacy-member','0977000111','Cũ',salt,legacy,120000,at,at);
 assert.equal((await fx.call('/api/member/login','POST',{phone:'0977000111',password:'0977000111'})).status,200);
 assert.equal((await fx.call('/api/member/login','POST',{phone:'0977000111',password:'0977000112'})).status,401);
 assert.equal(await verifyPassword({},'0977000111',salt,legacy,120000),true,'legacy check needs no server key');
 fx.db.close();
});

test('CPU staff accounts: created and signed in with the keyed hash, no PBKDF2',async()=>{
 const fx=fixture(),h=await owner(fx);let made,login;
 const calls=await pbkdf2Calls(async()=>{
  made=await fx.call('/api/staff/accounts','POST',{username:'thungan1',name:'Thu ngân 1',role:'CASHIER',password:'thungan-123456'},h);
  login=await fx.call('/api/staff/login','POST',{username:'thungan1',password:'thungan-123456'});
 });
 assert.equal(made.status,201,JSON.stringify(made.data));assert.equal(login.status,200,JSON.stringify(login.data));assert.equal(calls,0);
 assert.match(fx.db.prepare('SELECT password_hash FROM pos_staff_users WHERE username=?').get('thungan1').password_hash,/^k1:/);
 assert.equal((await fx.call('/api/staff/login','POST',{username:'thungan1',password:'thungan-1234567'})).status,401);
 fx.db.close();
});

test('CPU keyed hashes depend on the server key: a leaked table alone cannot be checked',async()=>{
 const salt='c2FsdA==',a=await hashPassword({SESSION_SECRET:'x'.repeat(32)},'0912345678',salt),b=await hashPassword({SESSION_SECRET:'y'.repeat(32)},'0912345678',salt);
 assert.notEqual(a,b);
 assert.notEqual(await hashPassword({SESSION_SECRET:'x'.repeat(32),PASSWORD_PEPPER:'p'.repeat(32)},'0912345678',salt),a,'PASSWORD_PEPPER takes precedence when set');
 await assert.rejects(()=>hashPassword({},'0912345678',salt),/PASSWORD_KEY_MISSING/);
});

const CASES=[
 ['0912345678','0912345678'],['01234567890','01234567890'],['0912 345 678','0912345678'],['0912-345.678','0912345678'],
 ['+84912345678','0912345678'],['+84 0912 345 678','0912345678'],['84912345678','0912345678'],['+841234567890','01234567890'],
 ['+886912345678','+886912345678'],['+11234567890','+11234567890'],['+44 7911 123456','+447911123456'],
 ['091234567',''],['+8491234567',''],['+8613812345678',''],['+0123456789012',''],['+886 9123 4567 89',''],['abc',''],['','']
];
test('PHONE local 0 + 9-10 digits, or +country code with 12-13 characters; Vietnamese numbers stored as 0...',()=>{
 for(const [raw,stored] of CASES)assert.equal(phone(raw),stored,raw);
 for(const [raw,stored] of CASES)if(stored.startsWith('+'))assert.ok(stored.length>=12&&stored.length<=13,stored);
});
test('PHONE the QR page and the staff app apply exactly the Worker rule',()=>{
 for(const file of ['public/assets/app.js','public/staff/staff.js']){
  const line=readFileSync(new URL('../'+file,import.meta.url),'utf8').match(/const memberPhone=[^\n]*/)[0];
  const memberPhone=vm.runInNewContext(line+';memberPhone');
  for(const [raw,stored] of CASES)assert.equal(memberPhone(raw),stored,file+' '+raw);
 }
 assert.equal(readFileSync(new URL('../android/app/src/main/assets/staff/staff.js',import.meta.url),'utf8'),readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8'));
 const qr=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
 const box=qr.match(/<input id="member-phone"[^>]*>/)[0];
 assert.doesNotMatch(box,/pattern=|maxlength="11"/,'the phone box accepts +country codes');assert.match(box,/maxlength="20"/);
});
test('PHONE international members register, sign in with the phone as first password, and are found by staff',async()=>{
 const fx=fixture(),h=await owner(fx);
 const tw=await fx.call('/api/member/register','POST',{phone:'+886 912 345 678',name:'Chen'});
 assert.equal(tw.status,201,JSON.stringify(tw.data));assert.equal(tw.data.member.phone,'+886912345678');
 assert.equal((await fx.call('/api/member/login','POST',{phone:'+886912345678',password:'+886912345678'})).status,200);
 assert.equal((await fx.call('/api/member/login','POST',{phone:'+886 912-345-678',password:'+886 912 345 678'})).status,200,'typed with spaces');
 const vn=await fx.call('/api/member/register','POST',{phone:'+84 912 345 678',name:'Lan'});assert.equal(vn.data.member.phone,'0912345678');
 assert.equal((await fx.call('/api/member/login','POST',{phone:'0912345678',password:'+84912345678'})).status,200,'first password in +84 form');
 assert.equal((await fx.call('/api/member/register','POST',{phone:'+8613812345678',name:'Wang'})).status,400,'14 characters is too long');
 const found=await fx.call('/api/staff/members?phone='+encodeURIComponent('+886912345678'),'GET',null,h);assert.equal(found.data.member.name,'Chen');
 assert.equal((await fx.call('/api/staff/members?phone='+encodeURIComponent('+84912345678'),'GET',null,h)).data.member.name,'Lan');
 const bad=await fx.call('/api/staff/members?phone=123','GET',null,h);assert.equal(bad.status,400);assert.match(bad.data.message,/12–13 ký tự/);
 const customer=await fx.call('/api/staff/customers','POST',{name:'Khách Mỹ',phone:'+1 123 456 7890'},h);
 assert.equal(customer.status,201,JSON.stringify(customer.data));assert.equal(customer.data.customer.phone,'+11234567890');
 fx.db.close();
});
test('PHONE a scanned +country number is treated as a member',()=>{
 const code=readFileSync(new URL('../public/staff/scanner.js',import.meta.url),'utf8');
 assert.match(code,/\^\\\+\[1-9\]\\d\{10,11\}\$/);
});

test('FIRST PASSWORD is the last 6 digits of the phone, whatever format the phone was typed in',async()=>{
 const fx=fixture(),h=await owner(fx);
 assert.equal((await fx.call('/api/member/register','POST',{phone:'0933 444 555',name:'Hoa'})).status,201);
 const login=(phone,password)=>fx.call('/api/member/login','POST',{phone,password}).then(r=>r.status);
 assert.equal(await login('0933444555','444555'),200);
 assert.equal(await login('+84933444555','444555'),200,'phone in +84 form, password still the last 6');
 assert.equal(await login('0933444555','444556'),401);
 assert.equal(await login('0933444555','0933444555'),200,'typing the whole number is also accepted');
 assert.equal((await fx.call('/api/member/register','POST',{phone:'+886 912 345 678',name:'Chen'})).status,201);
 assert.equal(await login('+886912345678','345678'),200);
 const row=fx.db.prepare('SELECT password_salt,password_hash FROM members WHERE phone=?').get('+886912345678');
 assert.equal(await verifyPassword(fx.env,'345678',row.password_salt,row.password_hash),true,'stored hash is of the 6 digits');
 assert.equal((await fx.call('/api/staff/customers','POST',{name:'Khách quầy',phone:'0988 111 222'},h)).status,201);
 assert.equal(await login('0988111222','111222'),200,'customers added at the counter get the same first password');
 const r=await fx.call('/api/staff/members/register','POST',{phone:'0909123456',name:'Tại quầy'},h);assert.equal(r.status,201);
 assert.equal((await fx.call('/api/staff/members/login','POST',{phone:'0909123456',password:'123456'},h)).status,200,'staff sign-in at the counter with the 6 digits');
 fx.db.close();
});
test('FIRST PASSWORD members registered earlier with the whole number can use its last 6 digits; changed passwords are not loosened',async()=>{
 const fx=fixture(),salt='c2FsdHNhbHRzYWx0c2FsdA==',at=new Date().toISOString();
 fx.db.prepare('INSERT INTO members(id,phone,display_name,password_salt,password_hash,hash_iterations,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('early','0977000222','Sớm',salt,await hashPassword(fx.env,'0977000222',salt),0,at,at);
 const login=password=>fx.call('/api/member/login','POST',{phone:'0977000222',password}).then(r=>r);
 assert.equal((await login('000222')).status,200);assert.equal((await login('0977000222')).status,200);
 const signed=await login('000222');
 const change=await fx.call('/api/member/password','POST',{currentPassword:'000222',newPassword:'BiMat99'},{Cookie:signed.cookie});assert.equal(change.status,200,JSON.stringify(change.data));
 assert.equal((await login('000222')).status,401,'after a change the default no longer works');
 assert.equal((await login('BiMat99')).status,200);
 fx.db.close();
});
test('FIRST PASSWORD both apps tell the customer and the cashier about the 6 digits',()=>{
 const qr=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8'),staff=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
 assert.match(qr,/initialPassword:'Mật khẩu ban đầu là 6 số cuối của số điện thoại/);assert.match(qr,/initialPassword:'初始密码为手机号后 6 位/);
 assert.match(staff,/message\('Đã đăng ký\. Mật khẩu ban đầu là 6 số cuối của số điện thoại/);
 assert.match(staff,/ask\('Khách nhập mật khẩu hội viên \(mặc định: 6 số cuối số điện thoại\)'\)/);
});
