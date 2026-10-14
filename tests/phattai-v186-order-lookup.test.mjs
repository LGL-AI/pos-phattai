// Owner's request 14/10/2026: the order list shows today only (earlier unpaid orders stay visible); older orders are
// looked up in Quản trị → Tra cứu đơn hàng by day, shift and cashier; each order row is one fact per line.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {currentFixture} from './helpers/current-fixture.mjs';

const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
const ANDROID=readFileSync(new URL('../android/app/src/main/assets/staff/staff.js',import.meta.url),'utf8');

async function ordersAt(f,a,times){const ids=[];for(const at of times){const o=(await f.order(a)).data.order;f.db.prepare('UPDATE qr_orders SET created_at=? WHERE id=?').run(at,o.id);ids.push(o.id)}return ids}
const lookup=(f,a,q)=>f.call('/api/staff/orders?'+new URLSearchParams(q).toString(),'GET',null,a.headers);

test('LOOKUP one Vietnam day is 00:00–24:00 at UTC+7, by order time', async()=>{
 const f=currentFixture(),a=f.actor('OWNER');try{
  const [d13,start14,mid14,end14,d15]=await ordersAt(f,a,['2026-10-13T16:59:59.000Z','2026-10-13T17:00:00.000Z','2026-10-14T03:30:00.000Z','2026-10-14T16:59:59.999Z','2026-10-14T17:00:00.000Z']);
  const r=await lookup(f,a,{day:'2026-10-14'});
  assert.equal(r.status,200);
  assert.deepEqual(r.data.orders.map(x=>x.id),[end14,mid14,start14],'newest first, both edges of the day in');
  assert.equal(r.data.truncated,false);
  assert.ok(!r.data.orders.some(x=>[d13,d15].includes(x.id)));
  assert.ok(f.queries.some(sql=>/created_at>=\? AND created_at<\?/.test(sql)),'a plain range on created_at (idx_qr_orders_recent), no date() on the column');
 }finally{f.db.close()}
});

test('LOOKUP a shift narrows the day; a shift past midnight runs into the next day', async()=>{
 const f=currentFixture(),a=f.actor('OWNER');try{
  const [late13,early14,mid14]=await ordersAt(f,a,['2026-10-13T16:00:00.000Z','2026-10-13T18:30:00.000Z','2026-10-14T03:30:00.000Z']);// 23:00 13/10, 01:30 14/10, 10:30 14/10 VN
  assert.deepEqual((await lookup(f,a,{day:'2026-10-14',start:'10:00',end:'14:00'})).data.orders.map(x=>x.id),[mid14]);
  assert.deepEqual((await lookup(f,a,{day:'2026-10-13',start:'22:00',end:'02:00'})).data.orders.map(x=>x.id),[early14,late13]);
  assert.deepEqual((await lookup(f,a,{day:'2026-10-14',start:'14:00',end:'17:00'})).data.orders,[]);
 }finally{f.db.close()}
});

test('LOOKUP rejects a bad day or shift instead of guessing', async()=>{
 const f=currentFixture(),a=f.actor('OWNER');try{
  for(const q of [{day:'2026-02-30'},{day:'14/10/2026'},{day:'2026-10-14',start:'10:00'},{day:'2026-10-14',start:'10:00',end:'10:00'},{day:'2026-10-14',start:'25:00',end:'02:00'}]){
   const r=await lookup(f,a,q);assert.equal(r.status,400,JSON.stringify(q));assert.equal(r.data.code,'INVALID_DAY')}
  assert.equal((await lookup(f,f.actor('KITCHEN'),{day:'2026-10-14'})).status,200);
 }finally{f.db.close()}
});

test('LOOKUP carries the cashier and refunds; the kitchen still sees no money and no paid order', async()=>{
 const f=currentFixture(),owner=f.actor('OWNER');try{
  const o=(await f.order(owner)).data.order,day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const pay=await f.call('/api/staff/orders/'+o.id+'/pay','POST',{version:o.version,method:'CASH',received:o.total},owner.headers);assert.equal(pay.status,200);
  const row=(await lookup(f,owner,{day})).data.orders.find(x=>x.id===o.id);
  assert.ok(row&&'paidByName' in row&&'refundedAmount' in row);
  const kitchen=(await lookup(f,f.actor('KITCHEN'),{day})).data.orders;
  assert.ok(kitchen.every(x=>!('refundedAmount' in x)&&!('total' in x)));
  assert.ok(!kitchen.some(x=>x.id===o.id));
 }finally{f.db.close()}
});

test('LOOKUP stops at 500 orders and says so', async()=>{
 const f=currentFixture(),a=f.actor('OWNER');try{
  const [id]=await ordersAt(f,a,['2026-10-14T03:00:00.000Z']);const row=f.db.prepare('SELECT * FROM qr_orders WHERE id=?').get(id),cols=Object.keys(row);
  const insert=f.db.prepare(`INSERT INTO qr_orders(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`);
  for(let i=0;i<501;i++)insert.run(...cols.map(c=>c==='id'?crypto.randomUUID():c==='idem_key'?'lookup_'+i:c==='code'?'14102026-9'+String(i).padStart(3,'0')+'-000000':row[c]));
  const r=await lookup(f,a,{day:'2026-10-14'});
  assert.equal(r.data.orders.length,500);assert.equal(r.data.truncated,true);
 }finally{f.db.close()}
});

// ---- the screens, rendered from the shipped code ----
function screens(state,{owner=true,kitchen=false}={}){
 const start=STAFF.indexOf("// Owner's request 14/10/2026: the order list"),end=STAFF.indexOf('\nasync function loadLookup',start);
 const context={st:state,counter:false,isOwner:()=>owner,kitchenOnly:()=>kitchen,overnight:x=>x.end<=x.start?' (qua đêm)':'',
  esc:x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]),fmt:x=>new Intl.NumberFormat('vi-VN').format(Number(x)||0)+' đ',
  vnToday:()=>'2026-10-14',Intl,Date};
 vm.runInNewContext(STAFF.slice(start,end)+';globalThis.orderList=orderList;globalThis.orderLookup=orderLookup',context);return context;
}
const order=(id,at,extra={})=>({id,code:'14102026-'+id+'-000000',table:'T05',source:'QR',status:'ACCEPTED',paymentStatus:'UNPAID',total:80000,createdAt:at,memberName:null,refundedAmount:0,...extra});

test('ORDER LIST shows today, keeps earlier unpaid orders on top, hides earlier paid ones', ()=>{
 const st={screen:'orders',orders:[order('0001','2026-10-14T03:30:00.000Z'),order('0002','2026-10-13T05:00:00.000Z',{paymentStatus:'PAID',status:'PAID'}),order('0003','2026-10-13T06:00:00.000Z'),order('0004','2026-10-13T16:59:00.000Z',{paymentStatus:'PAID',status:'PAID'})]};
 const html=screens(st).orderList();
 assert.match(html,/data-open="0001"/);
 assert.match(html,/data-open="0003"/,'yesterday unpaid stays visible');
 assert.ok(!/data-open="0002"/.test(html)&&!/data-open="0004"/.test(html),'yesterday paid is hidden (23:59 VN counts as yesterday)');
 assert.ok(html.indexOf('data-open="0003"')<html.indexOf('data-open="0001"'),'earlier unpaid listed first');
 assert.match(html,/Chưa thanh toán từ ngày trước \/ 往日未付款 \(1\)/);
 assert.match(html,/data-screen="orderlookup"/,'the owner gets the way to older orders');
 assert.match(html,/13\/10\/2026 · 13:00/,'an earlier order shows its day');
 assert.match(html,/<span class="kv"><span class="k">Giờ \/ 时间<\/span><span class="v">10:30<\/span><\/span>/,'today shows the time only');
 assert.ok(!/data-screen="orderlookup"/.test(screens(st,{owner:false}).orderList()));
});

test('ORDER ROW one fact per line: code, time, customer, total, payment, cashier', ()=>{
 const st={screen:'orders',orders:[order('0001','2026-10-14T03:30:00.000Z',{paymentStatus:'PAID',status:'PAID',paymentMethod:'CASH',paidByName:'Linh',memberName:'Khách E2E'})]};
 const html=screens(st).orderList(),labels=[...html.matchAll(/<span class="k">([^<]+)<\/span>/g)].map(m=>m[1]);
 assert.deepEqual(labels,['Mã đơn / 单号','Giờ / 时间','Khách / 客人','Tổng / 合计','Thanh toán / 付款','Thu ngân / 收银']);
 assert.match(html,/Đã thu \/ 已收 · Tiền mặt \/ 现金/);
 assert.match(html,/<span class="badge">QR · Hoàn tất \/ 完成<\/span>/);
 const kitchen=screens({screen:'orders',orders:[order('0005','2026-10-14T03:30:00.000Z',{items:[{qty:2,name:'Canh'}]})]},{owner:false,kitchen:true}).orderList();
 assert.ok(!/money|Tổng|Thu ngân/.test(kitchen),'the kitchen row shows no money');
 assert.match(kitchen,/2 × Canh/);
});

test('ORDER LOOKUP filters by cashier and sums what was collected', ()=>{
 const st={screen:'orderlookup',lookup:{day:'2026-10-13',shift:'',cashier:'Linh',shifts:[{key:'k',name:'Ca sáng',start:'10:00',end:'14:00'}],truncated:false,
  orders:[order('0001','2026-10-13T03:30:00.000Z',{paymentStatus:'PAID',paidByName:'Linh',total:100000,refundedAmount:20000}),order('0002','2026-10-13T04:30:00.000Z',{paymentStatus:'PAID',paidByName:'Thao'}),order('0003','2026-10-13T05:30:00.000Z')]}};
 const html=screens(st).orderLookup();
 assert.match(html,/data-open="0001"/);assert.ok(!/data-open="000[23]"/.test(html));
 assert.match(html,/<b>1 đơn \/ 单<\/b> · Đã thu \/ 已收 <strong class="money">80\.000 đ<\/strong>/);
 assert.match(html,/<option selected>Linh<\/option><option>Thao<\/option>/);
 assert.match(html,/Ca sáng · 10:00–14:00/);
 assert.match(screens({...st,lookup:{...st.lookup,orders:null}}).orderLookup(),/Chọn ngày rồi bấm Tra cứu/);
 assert.match(screens(st,{owner:false}).orderLookup(),/Chỉ chủ tiệm/);
});

test('ORDER LOOKUP is an owner tile, owner-only, and comes back to the lookup after opening an order', ()=>{
 assert.match(STAFF,/\['orderlookup','Tra cứu đơn hàng','订单查询'/);
 assert.match(STAFF,/\['license','store','owner','orderlookup'\]\.includes\(st\.screen\)&&st\.staff\.role!=='OWNER'/);
 assert.match(STAFF,/st\.backTo=st\.screen==='orderlookup'\?'orderlookup':null/);
 assert.match(STAFF,/st\.screen=action==='back'&&st\.backTo\|\|'orders'/);
 assert.match(STAFF,/if\(e\.target\.id==='lookup-cashier'\)\{st\.lookup\.cashier=e\.target\.value;render\(\)\}/,'filters survive a render; the cashier filter needs no request');
 assert.equal(ANDROID,STAFF,'npm run sync:android');
});
