import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {applyCurrentSchema} from './helpers/schema.mjs';
import worker from '../src/worker.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 applyCurrentSchema(db);
 db.exec('UPDATE pos_product_inventory SET stock=100; UPDATE pos_ingredients SET stock=100000;');
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},_run(){return db.prepare(sql).run(...args)}}},async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s._run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,ASSETS:{fetch:async()=>new Response('not found',{status:404})},ORDERING_ENABLED:'true',ALLOW_UNVERIFIED_MEMBER_VOUCHERS:'true',SESSION_SECRET:'phattai-test-secret-012345678901234567890123',POS_STAFF_PASSWORD:'phattai-test-password'};
 const call=async(path,method='GET',body=null,headers={})=>{const h={Origin:'https://pos-phattai.test',...headers};if(body!==null)h['Content-Type']='application/json';const r=await worker.fetch(new Request('https://pos-phattai.test'+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)}),env);const ct=r.headers.get('content-type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text()}};
 return {db,env,call};
}
async function login(call){const r=await call('/api/staff/login','POST',{username:'huang',password:'phattai-test-password'});assert.equal(r.status,200,JSON.stringify(r.data));return {Authorization:'Bearer '+r.data.token}}
const guestBase=/^\d{8}-\d{4}-000000$/;

 test('PHAT TAI D1 seed is isolated from Echo catalog', async()=>{
 const {db,call}=fixture();
 const store=db.prepare('SELECT store_name,store_name_cn,transfer_prefix FROM pos_store_config WHERE id=1').get();
 assert.equal(store.store_name,'TIỆM SÍU LẬP PHÁT TÀI');
 assert.equal(store.store_name_cn,'發財燒臘');
 assert.equal(store.transfer_prefix,'PT');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM pos_products WHERE sku LIKE 'PT%' AND active=1").get().n,13);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM pos_products WHERE sku LIKE 'EC_%'").get().n,0);
 const health=await call('/api/health');
 assert.equal(health.status,200);assert.equal(health.data.d1,'ok');assert.equal(health.data.storeReady,true);assert.equal(health.data.acceptingOrders,true);assert.equal(health.data.version,'2.7.0-phattai.3');
 const catalog=await call('/api/catalog');
 assert.equal(catalog.status,200);assert.equal(catalog.data.catalog.store.name,'TIỆM SÍU LẬP PHÁT TÀI');assert.equal(catalog.data.catalog.products.length,13);assert.ok(catalog.data.catalog.products.every(p=>String(p.sku).startsWith('PT')));
 db.close();
});

test('customer chooses table and finalizes an UNPAID order; D1 creates kitchen job immediately',async()=>{
 const {db,call}=fixture();
 const payload={table:'T03',idempotencyKey:'phattai_order_first_00000001',items:[{productId:'101',qty:1,mods:{size:'中',spice:'不辣',note:''}}],note:'order first pay later'};
 const r=await call('/api/orders','POST',payload);
 assert.equal(r.status,201,JSON.stringify(r.data));
 assert.match(r.data.order.code,guestBase);
 assert.equal(r.data.order.table,'T03');
 assert.equal(r.data.order.status,'ACCEPTED');
 assert.equal(r.data.order.paymentStatus,'UNPAID');
 assert.equal('bankPayment' in r.data.order,false,'customer response must not expose payment QR');
 assert.equal(r.data.order.total,130000);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM qr_orders').get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM pos_kitchen_jobs WHERE order_id=? AND status='PENDING'").get(r.data.order.id).n,1,'kitchen job must exist immediately after order commit');
 const old=await call('/api/orders/'+r.data.order.id+'/payment-reported','POST',{}, {'x-order-token':r.data.orderToken});
 assert.equal(old.status,404,'customer payment-report endpoint is removed');
 db.close();
});

test('QR table -> kitchen first -> staff verifies table -> BANK payment appends CK without duplicate kitchen job',async()=>{
 const {db,call}=fixture();
 const created=await call('/api/orders','POST',{table:'T07',idempotencyKey:'phattai_qr_pay_later_bank_01',items:[{productId:'101',qty:1,mods:{size:'中',spice:'不辣',note:'T07'}}],note:'T07'});
 assert.equal(created.status,201,JSON.stringify(created.data));
 assert.match(created.data.order.code,guestBase);
 assert.equal(created.data.order.table,'T07');
 assert.equal(created.data.order.paymentStatus,'UNPAID');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM pos_kitchen_jobs WHERE order_id=?').get(created.data.order.id).n,1);

 const auth=await login(call);
 const detail=await call('/api/staff/orders/'+created.data.order.id,'GET',null,auth);
 assert.equal(detail.status,200,JSON.stringify(detail.data));
 assert.equal(detail.data.order.table,'T07');
 assert.equal(detail.data.order.paymentStatus,'UNPAID');
 assert.ok(detail.data.order.bankPayment?.payload,'bank QR data is staff-only');

 const queue=await call('/api/staff/paid-labels','GET',null,auth);
 assert.equal(queue.status,200,JSON.stringify(queue.data));
 const job=queue.data.jobs.find(x=>x.order.id===created.data.order.id);
 assert.ok(job,'kitchen queue must expose unpaid accepted order');
 assert.equal(job.status,'PENDING');
 const claim=await call('/api/staff/jobs/'+encodeURIComponent(job.id)+'/claim','POST',{},auth);
 assert.equal(claim.status,200,JSON.stringify(claim.data));
 assert.equal(claim.data.status,'CLAIMED','printer device can claim job before payment');

 const paid=await call('/api/staff/orders/'+created.data.order.id+'/pay','POST',{version:detail.data.order.version,method:'BANK'},auth);
 assert.equal(paid.status,200,JSON.stringify(paid.data));
 assert.equal(paid.data.order.status,'PAID');
 assert.equal(paid.data.order.paymentStatus,'PAID');
 assert.equal(paid.data.order.paymentMethod,'BANK');
 assert.match(paid.data.order.code,/^\d{8}-\d{4}-000000-CK$/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM pos_kitchen_jobs WHERE order_id=?').get(created.data.order.id).n,1,'payment must not create a second kitchen ticket');
 const afterPayQueue=await call('/api/staff/paid-labels','GET',null,auth);
 assert.equal(afterPayQueue.status,200,JSON.stringify(afterPayQueue.data));
 assert.equal(afterPayQueue.data.jobs.some(x=>x.order.id===created.data.order.id),false,'paid order must leave the automatic kitchen print queue');
 db.prepare("UPDATE pos_kitchen_jobs SET status='PENDING' WHERE id=?").run(job.id);
 const claimAfterPay=await call('/api/staff/jobs/'+encodeURIComponent(job.id)+'/claim','POST',{},auth);
 assert.equal(claimAfterPay.status,409,'backend must refuse a kitchen claim after payment even if a stale client sees PENDING');
 db.close();
});

test('staff CASH payment appends TM and records change after meal',async()=>{
 const {db,call}=fixture();
 const created=await call('/api/orders','POST',{table:'T08',idempotencyKey:'phattai_qr_pay_later_cash_01',items:[{productId:'101',qty:1,mods:{size:'中',spice:'不辣',note:''}}],note:'cash later'});
 assert.equal(created.status,201,JSON.stringify(created.data));
 const auth=await login(call);
 const detail=await call('/api/staff/orders/'+created.data.order.id,'GET',null,auth);
 const total=detail.data.order.total;
 const paid=await call('/api/staff/orders/'+created.data.order.id+'/pay','POST',{version:detail.data.order.version,method:'CASH',received:total+20000},auth);
 assert.equal(paid.status,200,JSON.stringify(paid.data));
 assert.equal(paid.data.order.paymentMethod,'CASH');
 assert.equal(paid.data.order.cashReceived,total+20000);
 assert.equal(paid.data.order.cashChange,20000);
 assert.match(paid.data.order.code,/^\d{8}-\d{4}-000000-TM$/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM pos_kitchen_jobs WHERE order_id=?').get(created.data.order.id).n,1);
 db.close();
});

test('customer UI requires table selection and contains no customer payment flow; handheld has staged staff payment + auto kitchen print',()=>{
 const customer=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
 assert.match(customer,/tablePicker:true/);
 assert.match(customer,/state\.tablePicker=true;render\(\);refreshHealth\(\)/);
 assert.match(customer,/Chốt order; hệ thống lưu D1 và gửi phiếu bếp ngay/);
 assert.match(customer,/Khách không thanh toán trên UI này/);
 assert.doesNotMatch(customer,/payment-reported/);
 assert.doesNotMatch(customer,/paymentChoice/);
 assert.doesNotMatch(customer,/data-action="payment-reported"/);
 const staff=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
 assert.match(staff,/data-start-pay=/);
 assert.match(staff,/data-choose-pay="CASH"/);
 assert.match(staff,/data-choose-pay="BANK"/);
 assert.match(staff,/ĐỐI CHIẾU BÀN/);
 assert.match(staff,/async function nativeKitchenAuto/);
 assert.match(staff,/async function pollAutoPrint/);
 assert.match(staff,/print:\{base:3000/);
 assert.match(staff,/printReceipt\(r\.order,paidBill\)/);
 assert.match(staff,/Đã gửi HÓA ĐƠN tới máy in SUNMI \/ 已发送收据至 SUNMI；phiếu bếp không in lại \/ 厨房单不会重复打印/);
 assert.match(staff,/o\.payment_status='UNPAID'|paymentStatus==='PAID'/);
 assert.match(staff,/Báo cáo ngày/);
 assert.match(staff,/IP \/ cổng máy in bếp \+ in thử/);
 assert.match(staff,/Kiểm tra toàn bộ phần cứng/);
 assert.match(staff,/Tài khoản & quyền/);
 assert.match(staff,/Thông tin tiệm & ngân hàng/);
 assert.doesNotMatch(staff,/printJob\([^\n]*paid/i,'payment callback must not create/reprint kitchen ticket');
});


test('owner handheld admin is OWNER-only and native receipt path stays separate from kitchen path', async()=>{
 const {call}=fixture();
 const auth=await login(call);
 const me=await call('/api/staff/me','GET',null,auth);
 assert.equal(me.data.staff.role,'OWNER');
 const staff=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/staff.js',import.meta.url),'utf8');
 const ops=readFileSync(new URL('../src/ops.js',import.meta.url),'utf8');
 const management=readFileSync(new URL('../src/management.js',import.meta.url),'utf8');
 const nativeMain=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java',import.meta.url),'utf8');
 assert.match(server,/o\.payment_status='UNPAID'/,'automatic kitchen queue must exclude already-paid orders');
 assert.match(server,/reports\/(?:daily|analytics)[\s\S]{0,500}actor\.role!==['"]OWNER['"]/,'daily/analytics reports must be OWNER-only');
 assert.match(ops,/api\/staff\/accounts[\s\S]{0,180}actor\.role!==['"]OWNER['"]/);
 assert.match(ops,/api\/staff\/roles[\s\S]{0,180}actor\.role!==['"]OWNER['"]/);
 assert.match(management,/api\/staff\/vouchers[\s\S]{0,180}actor\.role!==['"]OWNER['"]/);
 assert.match(nativeMain,/printReceipt\(String id,String payload\)[\s\S]{0,80}submitPrint\(id,"RECEIPT",payload\)/);
 assert.match(nativeMain,/printKitchen\(String id,String payload\)[\s\S]{0,100}kitchen\.submit\(id,payload\)/);
});
