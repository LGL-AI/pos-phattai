import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {applyCurrentSchema} from './helpers/schema.mjs';
import worker from '../src/worker.js';

const MAIN=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java',import.meta.url),'utf8');
const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
const LAN=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/LanKitchenPrinter.java',import.meta.url),'utf8');
const GRADLE=readFileSync(new URL('../android/app/build.gradle.kts',import.meta.url),'utf8');

function fixture(){
 const db=new DatabaseSync(':memory:');applyCurrentSchema(db);
 const stats={prepares:0};
 const DB={prepare(sql){stats.prepares++;let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},_run(){return db.prepare(sql).run(...args)}}},async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s._run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,ASSETS:{fetch:async()=>new Response('not found',{status:404})},ORDERING_ENABLED:'true',ALLOW_UNVERIFIED_MEMBER_VOUCHERS:'true',SESSION_SECRET:'phattai-test-secret-012345678901234567890123',POS_STAFF_PASSWORD:'phattai-test-password'};
 const call=async(path,method='GET',body=null,headers={})=>{const h={Origin:'https://pos-phattai.test',...headers};if(body!==null&&!('Content-Type' in h))h['Content-Type']='application/json';const r=await worker.fetch(new Request('https://pos-phattai.test'+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)}),env);const ct=r.headers.get('content-type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text()}};
 return {db,env,call,stats};
}
async function owner(fx){const r=await fx.call('/api/staff/login','POST',{username:'huang',password:'phattai-test-password'});assert.equal(r.status,200);return {Authorization:'Bearer '+r.data.token};}

test('BRIDGE supports GET POST PUT PATCH DELETE',()=>{for(const method of ['GET','POST','PUT','PATCH','DELETE'])assert.match(MAIN,new RegExp('"'+method+'"\\.equals\\(method\\)'));});
test('BRIDGE forwards JSON bodies for POST PUT PATCH',()=>{assert.match(MAIN,/boolean sendsJsonBody="POST"\.equals\(method\)\|\|"PUT"\.equals\(method\)\|\|"PATCH"\.equals\(method\)/);assert.match(MAIN,/conn\.setRequestProperty\("Content-Type","application\/json; charset=utf-8"\)/);});
test('BRIDGE store payload ceiling matches large logo\/config API',()=>assert.match(MAIN,/maxRaw="\/api\/staff\/store"\.equals\(path\)\?500000:20000/));
test('BRIDGE remains pinned to PHAT TAI HTTPS Worker',()=>assert.match(MAIN,/DEFAULT_CLOUD = "https:\/\/pos-phattai\.lgl247-ai\.workers\.dev"/));
test('APK keeps same package and LAN kitchen preferences',()=>{assert.match(GRADLE,/applicationId = "vn\.lotusai\.pos\.phattaiapp"/);assert.match(LAN,/getSharedPreferences\("lotus_kitchen_lan",0\)/);assert.match(MAIN,/InnerPrinterManager\.getInstance\(\)\.bindService/);});
test('Staff UI uses bridge verbs PUT PATCH DELETE and reports non-JSON status\/path',()=>{assert.match(STAFF,/api\('PUT','\/api\/staff\/store'/);assert.match(STAFF,/api\('PATCH','\/api\/staff\/customers\//);assert.match(STAFF,/api\('DELETE','\/api\/staff\/display\//);assert.match(STAFF,/Worker trả về HTTP \$\{code\|\|'không xác định'\} thay vì JSON tại \$\{path\}/);});

test('D1 PUT store persists then SELECT returns new values',async()=>{const fx=fixture(),h=await owner(fx),before=await fx.call('/api/staff/store','GET',null,h);assert.equal(before.status,200);const b=before.data.store;const update={version:b.version,storeName:'PHAT TAI QA',storeNameCn:'發財燒臘 QA',address:'QA',taxNumber:'',tableCount:b.tableCount,bankLabel:b.bankLabel,bankBin:b.bankBin,bankAccount:b.bankAccount,bankName:b.bankName,transferPrefix:b.transferPrefix,taxMode:b.taxMode,taxRate:b.taxRate,githubUrl:b.githubUrl||'',feedbackUrl:b.feedbackUrl||'',logoPng:''};const put=await fx.call('/api/staff/store','PUT',update,h);assert.equal(put.status,200);const after=await fx.call('/api/staff/store','GET',null,h);assert.equal(after.data.store.name,'PHAT TAI QA');assert.equal(after.data.store.nameCn,'發財燒臘 QA');fx.db.close();});
test('D1 PATCH customer persists and version increments',async()=>{const fx=fixture(),h=await owner(fx);const created=await fx.call('/api/staff/customers','POST',{name:'QA Customer',phone:'0912345678',email:'',birthday:'',note:'first',tierOverride:''},h);assert.equal(created.status,201);const c=created.data.customer;const patched=await fx.call('/api/staff/customers/'+c.id,'PATCH',{name:'QA Customer 2',phone:c.phone,email:'qa@example.com',birthday:'',note:'updated',tierOverride:'Gold',version:c.version},h);assert.equal(patched.status,200);assert.equal(patched.data.customer.version,c.version+1);const selected=await fx.call('/api/staff/customers/'+c.id,'GET',null,h);assert.equal(selected.data.customer.name,'QA Customer 2');assert.equal(selected.data.customer.note,'updated');assert.equal(selected.data.customer.tierOverride,'Gold');fx.db.close();});
test('D1 display PUT then DELETE round-trip works',async()=>{const fx=fixture(),h=await owner(fx),pair=await fx.call('/api/staff/display','POST',{},h);assert.equal(pair.status,201);const put=await fx.call('/api/staff/display/'+pair.data.id,'PUT',{revision:1,table:'T01',items:[]},h);assert.equal(put.status,200);const del=await fx.call('/api/staff/display/'+pair.data.id,'DELETE',{},h);assert.equal(del.status,200);const pub=await fx.call('/api/display/'+pair.data.id,'GET',null,{'X-Display-Token':pair.data.token});assert.equal(pub.status,403);fx.db.close();});

test('D1 positive readiness cache removes repeated schema probes on same binding',async()=>{const fx=fixture(),h=await owner(fx);fx.stats.prepares=0;const a=await fx.call('/api/staff/me','GET',null,h),b=await fx.call('/api/staff/me','GET',null,h),c=await fx.call('/api/staff/me','GET',null,h);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(c.status,200);assert.ok(fx.stats.prepares<=6,`expected only auth SELECTs after warm cache, got ${fx.stats.prepares} prepares`);fx.db.close();});
test('readiness cache is isolated per D1 binding',async()=>{const fx=fixture();await fx.call('/api/health');const broken={DB:{prepare(){throw Error('D1 down')}},ASSETS:{fetch:async()=>new Response('x')},ORDERING_ENABLED:'true',SESSION_SECRET:'phattai-test-secret-012345678901234567890123'};const r=await worker.fetch(new Request('https://pos-phattai.test/api/health'),broken),data=await r.json();assert.equal(data.d1,'unavailable');fx.db.close();});
test('release versions are v1.5.6 / 2.6.0-phattai.8',()=>{assert.match(GRADLE,/versionCode = 156/);assert.match(GRADLE,/versionName = "1\.5\.6"/);assert.match(MAIN,/LotusPOSPhatTai\/1\.5\.6/);});
