import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyCurrentSchema} from './helpers/schema.mjs';
import worker from '../src/worker.js';

const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
const CSS=readFileSync(new URL('../public/staff/staff.css',import.meta.url),'utf8');
const QR=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const MAIN=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java',import.meta.url),'utf8');
const TICKET=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/TicketBitmap.java',import.meta.url),'utf8');
const MANIFEST=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
const MIGRATION=readFileSync(new URL('../migrations/0017_shift_reports_mb_bank.sql',import.meta.url),'utf8');

function fixture(){
 const db=new DatabaseSync(':memory:');applyCurrentSchema(db);
 db.exec('UPDATE pos_product_inventory SET stock=100; UPDATE pos_ingredients SET stock=100000;');
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},_run(){return db.prepare(sql).run(...args)}}},async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s._run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,ASSETS:{fetch:async()=>new Response('not found',{status:404})},ORDERING_ENABLED:'true',ALLOW_UNVERIFIED_MEMBER_VOUCHERS:'true',SESSION_SECRET:'phattai-test-secret-012345678901234567890123',POS_STAFF_PASSWORD:'phattai-test-password'};
 const call=async(path,method='GET',body=null,headers={})=>{const h={Origin:'https://pos-phattai.test',...headers};if(body!==null&&!('Content-Type' in h))h['Content-Type']='application/json';const r=await worker.fetch(new Request('https://pos-phattai.test'+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)}),env);const ct=r.headers.get('content-type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text()}};
 return {db,env,call};
}
const sha=x=>createHash('sha256').update(x).digest('hex');
async function owner(fx){const r=await fx.call('/api/staff/login','POST',{username:'huang',password:'phattai-test-password'});assert.equal(r.status,200);return {headers:{Authorization:'Bearer '+r.data.token},id:'OWNER'}}
function cashier(fx,name){const id=crypto.randomUUID(),token=('tok_'+id.replaceAll('-','')).slice(0,70),at=new Date().toISOString();fx.db.prepare('INSERT INTO pos_staff_users(id,username,display_name,role_id,password_salt,password_hash,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'qa_'+id.slice(0,8),name,'CASHIER','dummy','dummy',1,at,at);fx.db.prepare('INSERT INTO pos_staff_sessions(token_hash,expires_at,staff_id) VALUES(?,?,?)').run(sha(token),Date.now()+3600000,id);return {id,headers:{Authorization:'Bearer '+token}}}
async function paidOrder(fx,actor,paidAt,table){const create=await fx.call('/api/orders','POST',{table,idempotencyKey:'v157_'+crypto.randomUUID().replaceAll('-',''),items:[{productId:'101',qty:1,mods:{size:'中',spice:'中',note:''}}]});assert.equal(create.status,201);const d=await fx.call('/api/staff/orders/'+create.data.order.id,'GET',null,actor.headers);const pay=await fx.call('/api/staff/orders/'+create.data.order.id+'/pay','POST',{version:d.data.order.version,method:'CASH',received:999999},actor.headers);assert.equal(pay.status,200);fx.db.prepare('UPDATE qr_orders SET paid_at=?,updated_at=? WHERE id=?').run(paidAt,paidAt,create.data.order.id);return create.data.order.id}

// 1. Startup directly to login/MainActivity; Worker config remains reachable only from Settings bridge.
test('APK launcher is MainActivity, not CloudConnectivityActivity',()=>{assert.match(MANIFEST,/<activity\s+android:name="vn\.lotusai\.pos\.phattaiapp\.MainActivity"[\s\S]*?android:exported="true"[\s\S]*?<action android:name="android\.intent\.action\.MAIN"/);const cloud=MANIFEST.match(/<activity\s+android:name="vn\.lotusai\.pos\.phattaiapp\.CloudConnectivityActivity"[\s\S]*?<\/activity>|<activity\s+android:name="vn\.lotusai\.pos\.phattaiapp\.CloudConnectivityActivity"[^>]*\/>/)?.[0]||'';assert.doesNotMatch(cloud,/android\.intent\.action\.MAIN/);assert.match(cloud,/android:exported="false"/)});
test('APK removes startup cloud banner and keeps Settings bridge',()=>{assert.doesNotMatch(MAIN,/Cloud riêng · Chạm để cấu hình/);assert.match(MAIN,/setContentView\(webView\)/);assert.match(MAIN,/openCloudConnectivity/);assert.match(STAFF,/data-action="cloud-config"/)});

// 2. Receipt modifiers are human-readable instead of JSONObject text.
test('Receipt payload converts modifier object to readable text',()=>{assert.match(STAFF,/items:\(x\.items\|\|\[\]\)\.map\(item=>\(\{\.\.\.item,mods:modifiersText\(/);assert.match(STAFF,/中:'Tô thường \/ 中碗'/);assert.match(STAFF,/大:'Tô lớn \/ 大碗'/);assert.match(STAFF,/中:'Cay vừa \/ 中辣'/)});
test('QR/customer labels use bowl terminology consistently',()=>{assert.match(QR,/regular:'Tô thường',large:'Tô lớn'/);assert.match(QR,/regular:'中碗',large:'大碗'/)});

// 3. Barcode gets a dedicated vertical region and order code baseline below it.
test('Receipt barcode cannot overlap order code',()=>{assert.match(TICKET,/barcode==null\?0:150/);assert.match(TICKET,/y\+82/);assert.match(TICKET,/y\+116/);assert.match(TICKET,/y\+=138/)});

// 4. Modifier popup CSS avoids newer shorthand/functions that froze older SUNMI WebView.
test('Handheld item popup uses legacy-safe fixed flex layout',()=>{assert.match(CSS,/\.item-overlay\{position:fixed;top:0;right:0;bottom:0;left:0/);assert.doesNotMatch(CSS,/\.item-overlay\{[^}]*inset:0/);assert.match(CSS,/\.item-chooser\{width:100%;max-width:620px/);assert.doesNotMatch(CSS,/width:min\(620px,100%\)/);assert.match(CSS,/-webkit-overflow-scrolling:touch/)});
test('Product tap still creates item draft and renders chooser',()=>{assert.match(STAFF,/if\(b\.dataset\.add\)\{const product=[\s\S]*?st\.itemDraft=[\s\S]*?render\(\);return\}/);assert.match(STAFF,/function itemChooser\(\)/)});

// 5. Bank account is changed to the MB account printed on the supplied merchant QR.
test('Migration installs MB receiving account',()=>{assert.match(MIGRATION,/bank_label='MB'/);assert.match(MIGRATION,/bank_bin='970422'/);assert.match(MIGRATION,/bank_account='00706885602'/);assert.match(MIGRATION,/bank_name='HO KINH DOANH COM GIO HEO'/)});
test('Current schema resolves MB receiving account after all migrations',()=>{const fx=fixture();const row=fx.db.prepare('SELECT bank_label,bank_bin,bank_account,bank_name FROM pos_store_config WHERE id=1').get();assert.deepEqual({...row},{bank_label:'MB',bank_bin:'970422',bank_account:'00706885602',bank_name:'HO KINH DOANH COM GIO HEO'});fx.db.close()});

// 6. One named shift may contain multiple employees and has its own sales report.
test('Bulk schedule stores one named shift for multiple employees',async()=>{const fx=fixture(),o=await owner(fx),a=cashier(fx,'Nhân viên A'),b=cashier(fx,'Nhân viên B'),day='2099-01-01';const r=await fx.call('/api/staff/schedules/bulk','POST',{shiftName:'Ca sáng',staffIds:[a.id,b.id],workDate:day,startTime:'08:00',endTime:'12:00',note:'Bàn giao QA'},o.headers);assert.equal(r.status,201);const rows=fx.db.prepare('SELECT staff_id,shift_name,start_time,end_time FROM pos_shift_schedules WHERE work_date=? ORDER BY staff_id').all(day);assert.equal(rows.length,2);assert.ok(rows.every(x=>x.shift_name==='Ca sáng'&&x.start_time==='08:00'&&x.end_time==='12:00'));fx.db.close()});
test('Shift report includes only payments inside shift window and lists scheduled staff',async()=>{const fx=fixture(),o=await owner(fx),a=cashier(fx,'Nhân viên A'),b=cashier(fx,'Nhân viên B'),day='2099-01-01';await fx.call('/api/staff/schedules/bulk','POST',{shiftName:'Ca sáng',staffIds:[a.id,b.id],workDate:day,startTime:'08:00',endTime:'12:00',note:''},o.headers);const inside=await paidOrder(fx,o,'2099-01-01T02:30:00.000Z','T01');await paidOrder(fx,o,'2099-01-01T10:30:00.000Z','T02');const r=await fx.call('/api/staff/reports/shift?date=2099-01-01&start=08%3A00&end=12%3A00&name=Ca%20s%C3%A1ng','GET',null,o.headers);assert.equal(r.status,200);assert.equal(r.data.report.reportType,'SHIFT');assert.equal(r.data.report.payments.length,1);assert.equal(r.data.report.payments[0].orderId,inside);assert.equal(r.data.report.shift.name,'Ca sáng');assert.deepEqual(r.data.report.shift.staff.map(x=>x.name).sort(),['Nhân viên A','Nhân viên B']);fx.db.close()});
test('Handheld report UI offers all-day, named shift or staff export/print',()=>{assert.match(STAFF,/Theo ca \/ 按班次/);assert.match(STAFF,/Theo nhân viên \/ 按员工/);assert.match(STAFF,/\/api\/staff\/reports\/shift\?/);assert.match(STAFF,/BÁO CÁO CA \/ 班次报表/);assert.match(STAFF,/Nhân viên \/ 员工/)});
