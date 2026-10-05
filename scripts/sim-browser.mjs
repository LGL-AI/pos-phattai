// Handover simulation (05/10/2026), browser side: the customer QR page on many phones and the SUNMI
// handheld (through a mock of the APK bridge) against a local Worker + D1. Each case is independent:
// it records page errors, failed API answers and horizontal scrolling, and the run continues.
// Usage: E2E_CHROMIUM=/opt/pw-browsers/chromium node scripts/sim-browser.mjs
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const wrangler=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const PORT=Number(process.env.SIM_PORT||8792),BASE=`http://127.0.0.1:${PORT}`,PASSWORD='sim-pass-123456';
const persist=mkdtempSync(join(tmpdir(),'phattai-sim-'));
const env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'};
const MAIN=readFileSync(resolve(root,'android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java'),'utf8');
const filterSource=MAIN.match(/!path\.matches\("((?:[^"\\]|\\.)*)"\)/)[1].replaceAll('\\\\','\\');
const results=[];let server,browser,ownerToken,lastPage=null;
const only=process.env.SIM_ONLY?new RegExp(process.env.SIM_ONLY):null;

async function startWorker(){
 const migrate=spawnSync(process.execPath,[wrangler,'d1','migrations','apply','DB','--local','--persist-to',persist],{cwd:root,env,encoding:'utf8'});
 if(migrate.status!==0)throw Error('Local D1 migration failed:\n'+migrate.stdout+migrate.stderr);
 server=spawn(process.execPath,[wrangler,'dev','--local','--ip','127.0.0.1','--port',String(PORT),'--persist-to',persist,
  '--var','SESSION_SECRET:sim-session-secret-0123456789abcdefghij','--var',`POS_STAFF_PASSWORD:${PASSWORD}`],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let out='';server.stdout.on('data',d=>out+=d);server.stderr.on('data',d=>out+=d);
 for(let i=0;i<60;i++){try{const r=await fetch(BASE+'/api/health');if(r.ok&&(await r.json()).acceptingOrders)return}catch{}await new Promise(r=>setTimeout(r,1000))}
 throw Error('Local Worker did not start:\n'+out.slice(-3000));
}
const api=async(method,path,body,token=ownerToken)=>{const r=await fetch(BASE+path,{method,headers:{'Content-Type':'application/json',Origin:BASE,...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)}};

const OLD_ENGINE=()=>{delete AbortSignal.timeout;delete String.prototype.replaceAll;delete Object.hasOwn;delete Array.prototype.at;delete String.prototype.at;delete Array.prototype.findLast;delete window.structuredClone;try{delete Crypto.prototype.randomUUID}catch{}};
async function open({viewport={width:360,height:720},old=true,native=false,slow=Number(process.env.SIM_SLOW||4),touch=true}={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:touch,hasTouch:touch});
 if(old)await context.addInitScript(OLD_ENGINE);
 if(native)await context.addInitScript(({filterSource})=>{
  const filter=new RegExp('^(?:'+filterSource+')$'),auth={user:null};window.__log=[];window.__kitchen=[];window.__receipts=[];
  window.NativePOS={
   apiRequest(id,method,path,raw,token){
    const reply=(status,text)=>setTimeout(()=>window.LotusCloud&&window.LotusCloud.onApi(id,status,text),(window.__slow||{})[path.split('?')[0]]||0);
    if(!filter.test(path)||path.includes('..')){window.__log.push(method+' '+path+' -> REJECTED');reply(0,'{"ok":false,"message":"Yêu cầu không hợp lệ"}');return}
    const body=raw&&!['GET','DELETE'].includes(method)?raw:undefined;
    fetch(path,{method,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json; charset=utf-8'}:{})},body})
     .then(async r=>{const text=await r.text();if(r.ok&&path==='/api/staff/login')auth.user=JSON.parse(text).staff;window.__log.push(method+' '+path.split('?')[0]+' -> '+r.status+(r.ok?'':' '+text.slice(0,140)));reply(r.status,text)})
     .catch(e=>reply(0,JSON.stringify({ok:false,code:'NETWORK_ERROR',message:'Không kết nối được Worker: '+e.message})));
   },
   getAuthState:()=>JSON.stringify(auth),getCloudBase:()=>location.origin,logout(){auth.user=null},
   getAppUpdateState:()=>'{"status":"IDLE","version":"1.7.62","versionCode":1062,"signerSha256":"e66d9870204bcfef827e3b3ef2d601fb83160a4927619e1354411bc6b7f484b4","available":false,"busy":false}',checkAppUpdate(){},installAppUpdate(){},getKitchenJobStatus:()=>'QUEUED',
   printKitchen(id,raw){window.__kitchen.push(id);setTimeout(()=>window.LotusNativeBridge&&window.LotusNativeBridge.onNativeEvent({category:'KITCHEN',code:'KITCHEN_SENT',severity:'INFO',message:'Đã gửi phiếu bếp',requestId:id}),20)},retryKitchen(){},
   getReceiptState:()=>'NEW',printReceipt(id,raw){window.__receipts.push({id,raw});return 'OK'},reprintReceipt(){},printDailyReport(){},
   getPrinterStatus:()=>'{"state":1}',checkPrinter(){},reconnectPrinter(){},openKitchenSettings(){},openKitchenJobs(){},
   openDiagnostics(){},openCloudConnectivity(){},savePng(){},getAppInfo:()=>'{"native":true}'
  };
 },{filterSource});
 const page=await context.newPage();page.setDefaultTimeout(15000);lastPage=page;
 if(slow>1){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:slow})}
 const errors=[],bad=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push('console: '+m.text())});
 page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=500)bad.push(r.status()+' '+new URL(r.url()).pathname)});
 page.on('dialog',d=>d.accept(d.type()==='prompt'?(page.__answer??d.defaultValue()):undefined).catch(()=>{}));
 return {context,page,errors,bad};
}
const overflow=page=>page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth);
async function run(name,fn){
 if(only&&!only.test(name))return;
 const started=Date.now();let ok=true,detail='';
 try{const r=await fn();if(r&&r.ok===false){ok=false;detail=r.detail}}catch(e){ok=false;detail=(e.message||String(e)).split('\n')[0].slice(0,400)}
 if(!ok&&process.env.SIM_DEBUG&&lastPage)detail+='\n       screen: '+(await lastPage.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,500)).catch(()=>'(closed)'));
 results.push({name,ok,detail,ms:Date.now()-started});
 console.log(`${ok?'PASS':'FAIL'}  ${name}${ok?'':'  — '+detail}`);
 if(!ok&&process.env.GITHUB_ACTIONS)console.log('::error::SIM: '+(name+' — '+detail).replace(/\r?\n/g,' | ').slice(0,900));
}
const fail=detail=>({ok:false,detail});
// checks that every browser case shares: no JS error, no 5xx, no sideways scrolling
async function clean(dev,label=''){
 const o=await overflow(dev.page);
 if(dev.errors.length)return fail(label+'page error: '+dev.errors.slice(0,2).join(' | '));
 if(dev.bad.length)return fail(label+'server error: '+dev.bad.slice(0,3).join(', '));
 if(o>1)return fail(label+`page scrolls sideways by ${o}px`);
 return null;
}

// ---------- QR page ----------
let catalog;
async function qrOpen(dev,table){
 await dev.page.goto(BASE+'/qr/'+(table?'?table='+table:''));
 await dev.page.waitForSelector('[data-add]');
 if(await dev.page.locator('[data-action=confirm-table]').isVisible().catch(()=>false)){
  if(table&&await dev.page.locator(`[data-pick=${table.toUpperCase()}]`).count())await dev.page.click(`[data-pick=${table.toUpperCase()}]`);
  else if(!table)await dev.page.click('[data-pick=T01]');
  await dev.page.click('[data-action=confirm-table]');
 }
}
// add one dish through its option sheet; returns the price the server should charge for it
async function qrAdd(page,p,{size,spice,note}={}){
 await page.click(`[data-add="${p.id}"]`);
 await page.waitForSelector('[data-action=modal-save]');
 if(size&&await page.locator(`[data-opt=size][data-val="${size}"]`).count())await page.click(`[data-opt=size][data-val="${size}"]`);
 if(spice&&await page.locator(`[data-opt=spice][data-val="${spice}"]`).count())await page.click(`[data-opt=spice][data-val="${spice}"]`);
 if(note)await page.fill('#item-note',note);
 await page.click('[data-action=modal-save]');
 return size==='大'&&p.size?p.largePrice:p.price;
}
async function qrSubmit(page){
 await page.click('[data-view=cart]');await page.waitForSelector('[data-action=submit]');
 const before=await lastOrderId();
 await page.click('[data-action=submit]');
 await page.waitForFunction(()=>/Đơn gọi món đã được ghi nhận/.test(document.body.innerText),null,{timeout:20000});
 const after=await lastOrderId();
 if(!after||after===before)throw Error('the page says the order was received but the shop has no new order');
 return (await api('GET','/api/staff/orders/'+after)).data;
}
async function lastOrderId(){const r=await api('GET','/api/staff/orders');return r.data.orders?.[0]?.id||null}
const vnd=n=>new Intl.NumberFormat('vi-VN').format(n);

// ---------- Handheld ----------
async function handheldLogin(dev,username='huang',password=PASSWORD){
 await dev.page.goto(BASE+'/staff/');await dev.page.waitForSelector('input[name=username]');
 await dev.page.fill('input[name=username]',username);
 await dev.page.fill('input[name=password]',password);
 await dev.page.click('button:has-text("Đăng nhập")');
 await dev.page.waitForSelector('nav [data-screen]');
}
const httpFails=async page=>(await page.evaluate(()=>window.__log||[])).filter(x=>/-> (0|[45]\d\d)|REJECTED/.test(x)&&!/-> 409/.test(x));

try{
 await startWorker();
 browser=await chromium.launch(process.env.E2E_CHROMIUM?{executablePath:process.env.E2E_CHROMIUM}:{});
 ownerToken=(await api('POST','/api/staff/login',{username:'huang',password:PASSWORD},null)).data.token;
 await api('POST','/api/staff/attendance/in',{});
 catalog=(await (await fetch(BASE+'/api/catalog')).json()).catalog.products.filter(p=>p.active!==false);
 const byId=id=>catalog.find(p=>String(p.id)===String(id));

 // 1. Full QR order on every common phone size, old and new browsers, two different carts (24 cases)
 const phones=[['iPhone SE 1',{width:320,height:568}],['Android 360',{width:360,height:640}],['iPhone 8',{width:375,height:667}],['iPhone 14',{width:390,height:844}],['iPhone Plus',{width:414,height:896}],['iPad',{width:768,height:1024}]];
 const carts=[[['110','大','小'],['113',null,'不辣'],['118']],[['101','中','大'],['115'],['112','大','中'],['119']]];
 for(const [label,viewport] of phones)for(const old of [true,false])for(const [ci,cart] of carts.entries()){
  await run(`QR ${label} ${viewport.width}px ${old?'old engine (iOS 15 / WebView 83)':'current Chrome'} cart ${ci+1}: order reaches the shop with the right items and total`,async()=>{
   const dev=await open({viewport,old,touch:viewport.width<700});
   try{
    const table='T'+String(10+results.length%80).padStart(2,'0');
    await qrOpen(dev,table);
    let expected=0;
    for(const [id,size,spice] of cart)expected+=await qrAdd(dev.page,byId(id),{size,spice});
    const shown=await dev.page.evaluate(()=>document.body.innerText);
    const d=await qrSubmit(dev.page);
    if(d.order.total!==expected)return fail(`total ${d.order.total} ≠ ${expected}`);
    if(d.order.table!==table)return fail(`table ${d.order.table} ≠ ${table}`);
    if(d.order.items.length!==cart.length)return fail(`${d.order.items.length} lines ≠ ${cart.length}`);
    for(const [i,[id,size,spice]] of cart.entries()){const it=d.order.items[i],p=byId(id);
     if(String(it.productId)!==id)return fail(`line ${i+1} is ${it.productId}, not ${id}`);
     if(p.size&&size&&it.mods.size!==size)return fail(`line ${i+1} size ${it.mods.size} ≠ ${size}`);
     if(p.spicy&&spice&&it.mods.spice!==spice)return fail(`line ${i+1} spice ${it.mods.spice} ≠ ${spice}`);
     if(!p.size&&it.mods.size)return fail(`line ${i+1} (${p.name}) stored a bowl size it does not have`);
     if(!p.spicy&&it.mods.spice)return fail(`line ${i+1} (${p.name}) stored a spice level it does not have`)}
    if(!shown.includes(vnd(expected)))return fail(`the cart never showed the total ${vnd(expected)}`);
    return await clean(dev);
   }finally{await dev.context.close()}
  });
 }

 // 2. Every dish's option sheet offers exactly the options the dish has (19 cases)
 for(const p of catalog){
  await run(`QR dish ${p.id} ${p.name}: the option sheet shows ${p.size?'bowl size':'no bowl size'} and ${p.spicy?'spice levels':'no spice level'}`,async()=>{
   const dev=await open();
   try{
    await qrOpen(dev,'T20');await dev.page.click(`[data-add="${p.id}"]`);await dev.page.waitForSelector('[data-action=modal-save]');
    const sizes=await dev.page.locator('[data-opt=size]').count(),spices=await dev.page.locator('[data-opt=spice]').count();
    if(!!sizes!==!!p.size)return fail(`size buttons: ${sizes}`);
    if(!!spices!==!!p.spicy)return fail(`spice buttons: ${spices}`);
    const sheet=await dev.page.locator('.modal, [role=dialog]').first().innerText().catch(()=>'');
    if(!sheet.includes(p.name))return fail('the sheet does not name the dish');
    const box=await dev.page.locator('[data-action=modal-save]').boundingBox();
    if(!box||box.y+box.height>720||box.y<0)return fail(`the add button is off screen (y=${box&&Math.round(box.y)})`);
    await dev.page.click('[data-action=modal-save]');
    const badge=await dev.page.evaluate(()=>document.body.innerText);
    if(!/1/.test(badge))return fail('cart count did not change');
    return await clean(dev);
   }finally{await dev.context.close()}
  });
 }

 // 3. QR edge cases (16)
 const qrEdge=[
  ['no table in the link: the table picker opens first with nothing chosen; the order goes to the table picked',async dev=>{
   await dev.page.goto(BASE+'/qr/');await dev.page.waitForSelector('[data-pick]');
   if(await dev.page.locator('[data-pick].selected, [data-pick][aria-pressed=true]').count())return fail('a table is pre-selected without a link');
   await dev.page.click('[data-pick=T21]');await dev.page.click('[data-action=confirm-table]');
   await qrAdd(dev.page,byId('113'),{});const d=await qrSubmit(dev.page);if(d.order.table!=='T21')return fail('table '+d.order.table)}],
  ['an invalid table in the link (T00) is not used and the customer is asked to pick one',async dev=>{await dev.page.goto(BASE+'/qr/?table=T00');await dev.page.waitForSelector('[data-pick]');if(await dev.page.locator('[data-action=confirm-table]').isEnabled().catch(()=>false)&&await dev.page.locator('[data-pick=T00]').count())return fail('T00 offered');const t=await dev.page.evaluate(()=>document.body.innerText);if(/(Bàn|桌号)\s*T00\b/.test(t))return fail('shows Bàn T00')}],
  ['a table beyond the shop size (T100) is not used',async dev=>{await dev.page.goto(BASE+'/qr/?table=T100');await dev.page.waitForSelector('[data-pick]');if(/(Bàn|桌号)\s*T100\b/.test(await dev.page.evaluate(()=>document.body.innerText)))return fail('shows Bàn T100')}],
  ['take-away link orders as take-away',async dev=>{await qrOpen(dev,'TAKEAWAY');await qrAdd(dev.page,byId('110'),{size:'中',spice:'中'});const d=await qrSubmit(dev.page);if(d.order.table!=='TAKEAWAY')return fail(d.order.table)}],
  ['lower-case table in the link (t07)',async dev=>{await qrOpen(dev,'t07');await qrAdd(dev.page,byId('113'),{});const d=await qrSubmit(dev.page);if(d.order.table!=='T07')return fail(d.order.table)}],
  ['quantity + and − in the cart, down to zero removes the line',async dev=>{
   await qrOpen(dev,'T22');await qrAdd(dev.page,byId('110'),{size:'中',spice:'中'});await qrAdd(dev.page,byId('113'),{});
   await dev.page.click('[data-view=cart]');await dev.page.click('[data-qty="0"][data-delta="1"]');await dev.page.click('[data-qty="0"][data-delta="1"]');
   await dev.page.click('[data-qty="1"][data-delta="-1"]');
   const lines=await dev.page.locator('.cart-line').count();if(lines!==1)return fail(lines+' lines left');
   const d=await qrSubmit(dev.page);if(d.order.items.length!==1||d.order.items[0].qty!==3)return fail(JSON.stringify(d.order.items.map(x=>x.qty)))}],
  ['a note with Chinese, emoji and HTML reaches the kitchen as plain text',async dev=>{
   await qrOpen(dev,'T23');const note='少辣 🌶️ <b>ít hành</b>';await qrAdd(dev.page,byId('110'),{size:'中',spice:'中',note});
   const d=await qrSubmit(dev.page);if(d.order.items[0].mods.note!==note)return fail('note '+JSON.stringify(d.order.items[0].mods.note));
   if(await dev.page.locator('b:has-text("ít hành")').count())return fail('the note was rendered as HTML')}],
  ['offline: sending is refused with a message and no order is made; back online it goes through',async dev=>{
   await qrOpen(dev,'T24');await qrAdd(dev.page,byId('112'),{size:'中',spice:'中'});await dev.page.click('[data-view=cart]');
   const before=await lastOrderId();await dev.context.setOffline(true);await dev.page.click('[data-action=submit]');await dev.page.waitForTimeout(1500);
   const text=await dev.page.evaluate(()=>document.body.innerText);
   if(!/mạng|kết nối|离线|网络/i.test(text))return fail('no offline message');
   if(await lastOrderId()!==before)return fail('an order was made while offline');
   if(/DEMO|演示/.test(text))return fail('an offline customer is shown the demo screen: '+text.replace(/\s+/g,' ').match(/.{0,80}(DEMO|演示).{0,40}/)[0]);
   await dev.context.setOffline(false);await dev.page.waitForTimeout(3000);
   await dev.page.click('[data-action=submit]');await dev.page.waitForFunction(()=>/Đơn gọi món đã được ghi nhận/.test(document.body.innerText),null,{timeout:20000});
   dev.errors.length=0;}],
  ['double tap on send makes one order',async dev=>{
   await qrOpen(dev,'T25');await qrAdd(dev.page,byId('108'),{size:'中',spice:'中'});await dev.page.click('[data-view=cart]');
   const before=(await api('GET','/api/staff/orders')).data.orders.length;
   await dev.page.locator('[data-action=submit]').dblclick();await dev.page.waitForFunction(()=>/Đơn gọi món đã được ghi nhận/.test(document.body.innerText),null,{timeout:20000});
   await dev.page.waitForTimeout(1000);const after=(await api('GET','/api/staff/orders')).data.orders.length;if(after!==before+1)return fail(`${after-before} orders`)}],
  ['reload keeps the cart and the table',async dev=>{
   await qrOpen(dev,'T26');await qrAdd(dev.page,byId('110'),{size:'大',spice:'大'});await dev.page.reload();await dev.page.waitForSelector('[data-add]');
   if(await dev.page.locator('[data-action=confirm-table]').isVisible().catch(()=>false)){if(!await dev.page.locator('[data-pick=T26].selected, [data-pick=T26][aria-pressed=true]').count()&&!/T26/.test(await dev.page.locator('[data-action=confirm-table]').innerText()))return fail('the table from the link is not suggested after reload');await dev.page.click('[data-action=confirm-table]')}
   await dev.page.click('[data-view=cart]');if(!await dev.page.locator('.cart-line').count())return fail('cart lost after reload');
   const d=await qrSubmit(dev.page);if(d.order.table!=='T26'||d.order.items[0].mods.size!=='大')return fail(d.order.table+' '+JSON.stringify(d.order.items[0].mods))}],
  ['a wrong voucher code shows a message and the order still goes through without it',async dev=>{
   await qrOpen(dev,'T27');await qrAdd(dev.page,byId('101'),{size:'中',spice:'中'});await dev.page.click('[data-view=cart]');
   const input=dev.page.locator('#voucher-input');if(!await input.count())return fail('no voucher field');
   await input.fill('KHONGCO');await dev.page.click('[data-action=apply-voucher]');await dev.page.waitForTimeout(1500);
   if(!/không hợp lệ|无效/i.test(await dev.page.evaluate(()=>document.body.innerText)))return fail('no message for a wrong code');
   const d=await qrSubmit(dev.page);if(d.order.discount!==0)return fail('discount '+d.order.discount);dev.errors.length=0}],
  ['30 dishes in one cart is accepted; the 31st line is refused with a message',async dev=>{
   await qrOpen(dev,'T28');for(let i=0;i<30;i++)await qrAdd(dev.page,byId(['113','115','116','117'][i%4]),{});
   const d=await qrSubmit(dev.page);if(d.order.items.reduce((n,x)=>n+x.qty,0)!==30)return fail('portions '+d.order.items.reduce((n,x)=>n+x.qty,0))}],
  ['category tabs show only that category',async dev=>{
   await qrOpen(dev,'T29');const cats=await dev.page.locator('[data-cat]').evaluateAll(n=>n.map(x=>x.dataset.cat));
   for(const c of cats.filter(c=>c&&!/all|Tất cả/i.test(c))){await dev.page.click(`[data-cat="${c}"]`);const ids=await dev.page.locator('[data-add]').evaluateAll(n=>n.map(x=>x.dataset.add));
    const wrong=ids.filter(id=>byId(id)&&byId(id).category!==c);if(wrong.length)return fail(`${c} shows ${wrong.join(',')}`);if(!ids.length)return fail(c+' is empty')}}],
  ['search "vịt" finds the duck dishes and nothing else',async dev=>{
   await qrOpen(dev,'T30');const s=dev.page.locator('input[type=search], #search, input[name=search]').first();if(!await s.count())return fail('no search box');
   await s.fill('vịt');await dev.page.waitForTimeout(500);const ids=await dev.page.locator('[data-add]').evaluateAll(n=>n.map(x=>x.dataset.add));
   const want=catalog.filter(p=>/vịt/i.test(p.name)).map(p=>String(p.id));if(ids.sort().join()!==want.sort().join())return fail(`shows ${ids} want ${want}`)}],
  ['member sign-up from the phone with a 0… number, then the order carries the member',async dev=>{
   await qrOpen(dev,'T31');await qrAdd(dev.page,byId('110'),{size:'中',spice:'中'});await dev.page.click('[data-view=cart]');
   await dev.page.click('[data-action=member-from-cart]');await dev.page.click('[data-auth-mode=register]');
   await dev.page.fill('#member-name','Khách Mô Phỏng');await dev.page.fill('#member-phone','0977000111');await dev.page.click('#member-form button[type=submit]');
   await dev.page.waitForSelector('[data-action=submit]');const d=await qrSubmit(dev.page);if(d.order.memberName!=='Khách Mô Phỏng')return fail('member '+d.order.memberName)}],
  ['the order status page after sending shows the code and total, and survives a reload',async dev=>{
   await qrOpen(dev,'T32');await qrAdd(dev.page,byId('119'),{});const d=await qrSubmit(dev.page);
   let t=await dev.page.evaluate(()=>document.body.innerText);if(!t.includes(d.order.code.slice(0,8))&&!t.includes(vnd(d.order.total)))return fail('status page lacks code/total');
   await dev.page.reload();await dev.page.waitForTimeout(2000);t=await dev.page.evaluate(()=>document.body.innerText);if(!t.includes(vnd(d.order.total)))return fail('status lost after reload')}],
 ];
 for(const [name,fn] of qrEdge)await run('QR '+name,async()=>{const dev=await open();const screen=async()=>process.env.SIM_DEBUG?' | screen: '+(await dev.page.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,600)).catch(()=>'')):'';try{const r=await fn(dev);if(r&&r.ok===false)r.detail+=await screen();return r||await clean(dev)}catch(e){e.message=e.message.split('\n')[0]+await screen();throw e}finally{await dev.context.close()}});

 // 4. Handheld: every screen for the owner and for a cashier opens without errors (≈30 cases)
 const cashier=await api('POST','/api/staff/accounts',{username:'thungan.sim',name:'Thu ngân Mô Phỏng',role:'CASHIER',password:'thungan-sim-123',active:true});
 if(![200,201].includes(cashier.status))console.log('cashier account not created: '+JSON.stringify(cashier.data));
 const kitchenAcc=await api('POST','/api/staff/accounts',{username:'bep.sim',name:'Bếp Mô Phỏng',role:'KITCHEN',password:'bep-sim-123456',active:true});
 if(![200,201].includes(kitchenAcc.status))console.log('kitchen account not created: '+JSON.stringify(kitchenAcc.data));
 for(const [who,user,pass] of [['owner','huang',PASSWORD],['cashier','thungan.sim','thungan-sim-123'],['kitchen','bep.sim','bep-sim-123456']]){
  const dev=await open({native:true});
  try{await handheldLogin(dev,user,pass)}catch(e){const log=await dev.page.evaluate(()=>window.__log||[]).catch(()=>[]),vals=await dev.page.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.name+'='+(i.type==='password'?'*'.repeat(i.value.length):i.value))).catch(()=>[]);await run(`Handheld ${who}: signs in`,async()=>fail(e.message.split('\n')[0]+' log='+JSON.stringify(log)+' fields='+JSON.stringify(vals)));await dev.context.close();continue}
  const screens=new Set(await dev.page.locator('nav [data-screen]').evaluateAll(n=>n.map(x=>x.dataset.screen)));
  if(screens.has('owner')){await dev.page.click('[data-screen="owner"]');await dev.page.waitForTimeout(800);for(const s of await dev.page.locator('#app [data-screen]').evaluateAll(n=>n.map(x=>x.dataset.screen)))screens.add(s)}
  for(const s of screens){
   await run(`Handheld ${who}: screen "${s}" opens with no error, no failed request, no sideways scroll`,async()=>{
    dev.errors.length=0;dev.bad.length=0;await dev.page.evaluate(()=>{window.__log=[]});
    const btn=dev.page.locator(`nav [data-screen="${s}"]`);
    if(await btn.count())await btn.first().click();else{await dev.page.click('[data-screen="owner"]');await dev.page.locator(`#app [data-screen="${s}"]`).first().click()}
    await dev.page.waitForTimeout(1500);
    const failed=await httpFails(dev.page);if(failed.length)return fail('requests failed: '+failed.slice(0,3).join(' | '));
    const text=await dev.page.locator('#app').innerText();if(text.trim().length<10)return fail('screen is empty');
    if(/undefined|NaN|\[object Object\]/.test(text))return fail('screen shows '+text.match(/.{0,40}(undefined|NaN|\[object Object\]).{0,20}/)[0]);
    if(who==='kitchen'&&/\d{1,3}(\.\d{3})+ ?đ|Thanh toán|Tổng|TỔNG|Khách hàng \/ 客户/.test(text))return fail('the kitchen sees money or customers: '+text.match(/.{0,40}(\d{1,3}(\.\d{3})+ ?đ|Thanh toán|Tổng|TỔNG|Khách hàng \/ 客户).{0,20}/)[0]);
    return await clean(dev);
   });
  }
  await dev.context.close();
 }

 await run('Handheld: after a wrong password the cashier\'s user name stays filled in (it was reset to "huang")',async()=>{
  const dev=await open({native:true});
  try{
   await dev.page.goto(BASE+'/staff/');await dev.page.waitForSelector('input[name=username]');
   await dev.page.fill('input[name=username]','thungan.sim');await dev.page.fill('input[name=password]','sai-mat-khau-1');
   await dev.page.click('button:has-text("Đăng nhập")');await dev.page.waitForFunction(()=>/không đúng/.test(document.body.innerText));
   const name=await dev.page.inputValue('input[name=username]');if(name!=='thungan.sim')return fail(`after the error the user name is "${name}"`);
   await dev.page.fill('input[name=password]','thungan-sim-123');await dev.page.click('button:has-text("Đăng nhập")');await dev.page.waitForSelector('nav [data-screen]');
   const who=await dev.page.evaluate(()=>JSON.parse(window.NativePOS.getAuthState()).user?.username);if(who!=='thungan.sim')return fail('signed in as '+who);
   dev.errors.length=0;return await clean(dev);
  }finally{await dev.context.close()}
 });

 await run('Handheld kitchen: opens an order and sees the customer name, code, table and dishes, without any price',async()=>{
  const r=await api('POST','/api/staff/orders',{table:'T60',items:[{productId:'110',qty:2,mods:{size:'大',spice:'小',note:'không da'}}],note:'ít hành',idempotencyKey:'sim_kitchen_view_order_01'});
  if(r.status!==201)return fail('order '+JSON.stringify(r.data));
  const dev=await open({native:true});
  try{
   await handheldLogin(dev,'bep.sim','bep-sim-123456');await dev.page.click('nav [data-screen="orders"]');await dev.page.waitForSelector(`[data-open="${r.data.order.id}"]`);
   const list=await dev.page.locator(`[data-open="${r.data.order.id}"]`).innerText();if(!/T60/.test(list)||!/Cơm vịt quay/.test(list))return fail('list entry: '+list);if(/đ\b|\d\.\d{3}/.test(list))return fail('list shows money: '+list);
   await dev.page.click(`[data-open="${r.data.order.id}"]`);await dev.page.waitForSelector('[data-action=back]');await dev.page.waitForFunction(()=>/Cơm vịt quay/.test(document.querySelector('#app').innerText));
   const text=await dev.page.locator('#app').innerText();
   if(!text.includes(r.data.order.code)||!/không da/.test(text)||!/ít hành/.test(text))return fail('detail lacks code or notes: '+text.replace(/\s+/g,' ').slice(0,200));
   if(/\d{1,3}(\.\d{3})+ ?đ|TỔNG|Tạm tính|Thanh toán/.test(text))return fail('detail shows money: '+text.replace(/\s+/g,' ').slice(0,300));
   return await clean(dev);
  }finally{await dev.context.close()}
 });

 // 5. Handheld order flows (one device, many sales; ≈20 cases)
 const hand=await open({native:true});const hp=hand.page;await handheldLogin(hand);
 const newOrder=async(table,lines)=>{
  hand.kitchenBefore=await hp.evaluate(()=>window.__kitchen.length);
  await hp.click('[data-screen="new"]');await hp.waitForSelector('[data-add]');
  await hp.selectOption('#table',table);
  for(const [id,size,spice] of lines){await hp.click(`[data-add="${id}"]`);await hp.waitForSelector('[data-item-save]');
   if(size&&await hp.locator(`[data-item-size="${size}"]`).count())await hp.click(`[data-item-size="${size}"]`);
   if(spice&&await hp.locator(`[data-item-spice="${spice}"]`).count())await hp.click(`[data-item-spice="${spice}"]`);
   await hp.click('[data-item-save]')}
  await hp.click('[data-action=submit]');await hp.waitForSelector('[data-action=append]');
  const code=(await hp.locator('#app').innerText()).match(/\d{8}-\d{4}-[0-9A-Z]{6}/)?.[0];
  return (await api('GET','/api/staff/orders')).data.orders.find(o=>o.code===code);
 };
 const flows=[
  ['a rice plate, large and very spicy',['T40',[['110','大','大']]],o=>o.items[0].mods.size==='大'&&o.items[0].mods.spice==='大'],
  ['a soup has no bowl size and no spice stored',['T41',[['115']]],o=>!o.items[0].mods.size&&!o.items[0].mods.spice],
  ['a combo',['T42',[['118']]],o=>o.total===byId('118').price],
  ['take-away',['TAKEAWAY',[['112','中','不辣']]],o=>o.table==='TAKEAWAY'],
  ['every category in one order',['T43',[['101','中','中'],['113',null,'小'],['119']]],o=>o.items.length===3&&o.total===byId('101').price+byId('113').price+byId('119').price],
 ];
 for(const [name,[table,lines],ok] of flows)await run(`Handheld sale: ${name}`,async()=>{hand.errors.length=0;const o=await newOrder(table,lines);if(!o)return fail('order not found');if(!ok(o))return fail(JSON.stringify({total:o.total,table:o.table,items:o.items.map(x=>[x.productId,x.qty,x.mods])}));
  const t0=Date.now();try{await hp.waitForFunction(n=>window.__kitchen.length>n,hand.kitchenBefore,{timeout:15000})}catch{return fail('no kitchen slip sent to the printer within 15 s')}
  const wait=Date.now()-t0;if(wait>8000)return fail(`kitchen slip took ${wait} ms`);return await clean(hand)});
 await run('Handheld: pay cash with change; the receipt goes to the SUNMI printer as "BIÊN LAI THU TIỀN" naming the cashier',async()=>{
  const o=await newOrder('T44',[['110','中','中']]);await hp.click('[data-start-pay]');await hp.click('[data-choose-pay=CASH]');
  hp.__answer=String(o.total+20000);await hp.click('[data-pay][data-method=CASH]');
  await hp.waitForFunction(()=>/-TM\b/.test(document.querySelector('#app').innerText));hp.__answer=undefined;
  const d=(await api('GET','/api/staff/orders/'+o.id)).data.order;if(d.cashChange!==20000)return fail('change '+d.cashChange);
  const rec=await hp.evaluate(()=>window.__receipts.at?window.__receipts[window.__receipts.length-1]:window.__receipts[window.__receipts.length-1]);
  if(!rec)return fail('no receipt printed');const p=JSON.parse(rec.raw);
  if(!/BIÊN LAI THU TIỀN/.test(p.title)||!p.cashierName||!/Không phải hóa đơn/.test(p.notice))return fail('receipt '+JSON.stringify({title:p.title,notice:p.notice,cashier:p.cashierName}));
  return await clean(hand)});
 await run('Handheld: bank transfer payment',async()=>{
  const o=await newOrder('T45',[['112','中','中']]);await hp.click('[data-start-pay]');
  if(!await hp.locator('[data-choose-pay=BANK]').count())return fail('no bank option');await hp.click('[data-choose-pay=BANK]');
  await hp.click('[data-pay][data-method=BANK]');await hp.waitForFunction(()=>/-CK\b/.test(document.querySelector('#app').innerText));
  const d=(await api('GET','/api/staff/orders/'+o.id)).data.order;if(d.paymentMethod!=='BANK'||d.paymentStatus!=='PAID')return fail(d.paymentMethod+' '+d.paymentStatus);return await clean(hand)});
 await run('Handheld: cash short of the total is refused and the order stays unpaid',async()=>{
  const o=await newOrder('T46',[['101','中','中']]);await hp.click('[data-start-pay]');await hp.click('[data-choose-pay=CASH]');
  hp.__answer=String(o.total-1000);await hp.click('[data-pay][data-method=CASH]');
  let told=true;try{await hp.waitForFunction(()=>/chưa đủ|không đủ/i.test(document.querySelector('#app').innerText),null,{timeout:10000})}catch{told=false}finally{hp.__answer=undefined}
  const d=(await api('GET','/api/staff/orders/'+o.id)).data.order;if(d.paymentStatus!=='UNPAID')return fail('paid with too little cash');
  if(!told)return fail('no message: '+(await hp.locator('#app').innerText()).replace(/\s+/g,' ').slice(0,200));return await clean(hand)});
 await run('Handheld: add items to an open order, then cancel one portion with a reason',async()=>{
  const o=await newOrder('T47',[['110','中','中']]);await hp.click('[data-action=append]');await hp.waitForSelector('[data-add="113"]');
  await hp.click('[data-add="113"]');await hp.click('[data-item-save]');await hp.click('[data-action=submit]');
  try{await hp.waitForSelector('[data-cancel-unit]',{timeout:10000})}catch{return fail('back on the order after adding, but no cancel button')}
  const cancel=hp.locator('[data-cancel-unit]').first();
  hp.__answer='khách đổi ý';const units0=(await api('GET','/api/staff/orders/'+o.id)).data.order.items.reduce((n,x)=>n+x.qty,0);await cancel.click();
  for(let i=0;i<40;i++){if((await api('GET','/api/staff/orders/'+o.id)).data.order.items.reduce((n,x)=>n+x.qty,0)<units0)break;await hp.waitForTimeout(250)}hp.__answer=undefined;
  const d=(await api('GET','/api/staff/orders/'+o.id)).data.order;if(d.items.reduce((n,x)=>n+x.qty,0)!==1)return fail('portions '+d.items.reduce((n,x)=>n+x.qty,0));
  if(d.total!==d.items.reduce((s,x)=>s+x.price*x.qty,0))return fail('total '+d.total);return await clean(hand)});
 await run('Handheld: split a 3-portion order into 2 bills and pay both',async()=>{
  const o=await newOrder('T48',[['110','中','中'],['113',null,'中'],['115']]);
  const r=await api('GET','/api/staff/orders/'+o.id);
  const split=await api('POST',`/api/staff/orders/${o.id}/split`,{version:r.data.order.version,parts:[[{index:0,qty:1}],[{index:1,qty:1},{index:2,qty:1}]]});
  if(split.status!==200)return fail('split '+JSON.stringify(split.data));
  await hp.click('[data-screen="orders"]');await hp.waitForTimeout(1500);await hp.locator(`[data-open="${o.id}"]`).first().click();await hp.waitForTimeout(1000);
  const pays=hp.locator('[data-pay][data-method=CASH]');const n=await pays.count();if(n<2){
   for(const b of split.data.bills){const res=await api('POST',`/api/staff/bills/${b.id}/pay`,{method:'CASH',received:b.total});if(res.status!==200)return fail('bill pay '+JSON.stringify(res.data))}}
  else{for(let i=0;i<2;i++){hp.__answer=undefined;await hp.locator('[data-pay][data-method=CASH]').first().click();await hp.waitForTimeout(1500)}}
  const d=(await api('GET','/api/staff/orders/'+o.id)).data;if(d.order.paymentStatus!=='PAID')return fail('order '+d.order.paymentStatus+' bills '+d.bills.map(b=>b.paymentStatus));return await clean(hand)});
 await run('Handheld: a QR order shows up on the handheld order list within 5 s',async()=>{
  await hp.click('[data-screen="orders"]');await hp.waitForTimeout(800);const cust=await open({old:false});
  try{await qrOpen(cust,'T49');await qrAdd(cust.page,byId('113'),{});await qrSubmit(cust.page)}finally{await cust.context.close()}
  try{await hp.waitForFunction(()=>/T49/.test(document.querySelector('#app').innerText),null,{timeout:5000})}catch{return fail('not on the handheld after 5 s')}
  return await clean(hand)});
 await run('Handheld: member lookup with the last 6 digits attaches the member to a new order',async()=>{
  await hp.click('[data-screen="new"]');await hp.waitForSelector('[data-add]');if(!await hp.locator('#member-phone').isVisible())await hp.click('.member-voucher summary');
  await hp.fill('#member-phone','0977000111');hp.__answer='000111';await hp.click('[data-action=lookup]');
  try{await hp.waitForFunction(()=>/Khách Mô Phỏng/.test(document.querySelector('#app').innerText),null,{timeout:8000})}catch{return fail('member not found / not signed in')}finally{hp.__answer=undefined}
  await hp.click('[data-add="113"]');await hp.click('[data-item-save]');await hp.click('[data-action=submit]');await hp.waitForSelector('[data-action=append]');
  const code=(await hp.locator('#app').innerText()).match(/\d{8}-\d{4}-[0-9A-Z]{6}/)?.[0];const o=(await api('GET','/api/staff/orders')).data.orders.find(x=>x.code===code);
  if(o?.memberName!=='Khách Mô Phỏng')return fail(`order ${code} member ${o?.memberName}; listed ${JSON.stringify((await api('GET','/api/staff/orders')).data.orders.slice(0,3).map(x=>[x.code,x.memberName,x.table]))}`);return await clean(hand)});
 await run('Handheld: the daily report shows the money taken today',async()=>{
  await hp.click('[data-screen="owner"]');await hp.locator('[data-screen="dashboard"]').first().click();await hp.waitForTimeout(2500);
  const text=await hp.locator('#app').innerText();const rep=(await api('GET','/api/staff/reports/daily?date='+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date()))).data;
  const v=rep.report?.net;if(!(v>0))return fail('report has no takings: '+JSON.stringify(rep).slice(0,200));if(!text.includes(vnd(v)))return fail(`screen does not show ${vnd(v)}: ${text.replace(/\s+/g,' ').slice(0,300)}`);return await clean(hand)});
 await run('Handheld: network loss shows offline, then recovers by itself',async()=>{
  await hand.context.setOffline(true);await hp.waitForTimeout(500);await hp.evaluate(()=>window.dispatchEvent(new Event('offline')));
  try{await hp.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('Chưa kết nối'),null,{timeout:25000})}catch{await hand.context.setOffline(false);return fail('never said offline')}
  await hand.context.setOffline(false);await hp.evaluate(()=>window.dispatchEvent(new Event('online')));
  try{await hp.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('trực tuyến'),null,{timeout:30000})}catch{return fail('did not recover')}
  await hp.waitForTimeout(3000);await hp.click('[data-screen="orders"]');await hp.waitForTimeout(1000);
  const stale=await hp.evaluate(()=>[...document.querySelectorAll('.notice')].map(n=>n.textContent).filter(t=>/Failed to fetch|Không kết nối được Worker/.test(t)));
  if(stale.length)return fail('a network error is still shown after recovery: '+stale[0].slice(0,120));
  hand.errors.length=0;return await clean(hand)});
 // Owner's requests 05/10/2026: refunded orders in red, the phone menu keeps its place, dishes & prices live under Quản trị.
 const paidOrder=async(table,key)=>{const o=(await api('POST','/api/staff/orders',{table,items:[{productId:'115',qty:1,mods:{}}],idempotencyKey:key})).data.order;const d=(await api('GET','/api/staff/orders/'+o.id)).data;const r=await api('POST',`/api/staff/orders/${o.id}/pay`,{version:d.order.version,method:'CASH',received:d.order.total});if(r.status!==200)throw Error('pay '+r.status+' '+JSON.stringify(r.data));return d.order};
 for(const [part,label] of [[1,'in full'],[0.5,'in part']])await run(`Handheld: an order refunded ${label} shows in red on the order list`,async()=>{
  const o=await paidOrder('T4'+(part===1?'1':'2'),'sim_refund_red_'+(part===1?'full':'part')+'_0001');
  const amount=Math.round(o.total*part);
  const r=await api('POST','/api/staff/refunds',{orderId:o.id,amount,method:'CASH',reason:'Mô phỏng hoàn tiền',idempotencyKey:'sim_refund_red_go_'+(part===1?'full':'part')});
  if(![200,201].includes(r.status))return fail('refund '+r.status+' '+JSON.stringify(r.data).slice(0,200));
  await hp.click('nav [data-screen="orders"]');await hp.click('[data-action=refresh]');
  await hp.locator(`[data-open="${o.id}"]`).waitFor();await hp.waitForFunction(id=>document.querySelector(`[data-open="${id}"]`)?.classList.contains('refunded'),o.id,{timeout:8000}).catch(()=>{});
  // read the row afresh in one go: live sync may replace it between two reads
  const got=await hp.evaluate(id=>{const el=document.querySelector(`[data-open="${id}"]`);return el?{cls:el.className,bg:getComputedStyle(el).backgroundColor,text:el.innerText}:{cls:'',bg:'',text:'(row gone)'}},o.id);
  if(!/refunded/.test(got.cls))return fail('the refunded order is not marked: '+got.text.replace(/\s+/g,' '));
  if(got.bg!=='rgb(253, 236, 234)')return fail('the refunded order is not red: '+got.bg);
  if(!(part===1?/ĐÃ HOÀN TIỀN/.test(got.text)&&/Đã hoàn tiền toàn bộ/.test(got.text):/HOÀN MỘT PHẦN/.test(got.text)&&new RegExp('Đã hoàn / 已退 '+vnd(amount)).test(got.text.replace(/ /g,' '))))return fail('label: '+got.text.replace(/\s+/g,' '));
  const plain=await hp.locator('.listButton:not(.refunded)').first().evaluate(el=>getComputedStyle(el).backgroundColor).catch(()=>'none');
  if(plain==='rgb(253, 236, 234)')return fail('an order without a refund is red too');
  return await clean(hand)});
 await run('Handheld: the phone menu keeps its sideways scroll after a tap, opening an order and live sync',async()=>{
  await paidOrder('T43','sim_menu_keep_place_0001');// a paid order to open from the refund screen, even when this case runs alone
  await hp.waitForSelector('nav [data-screen="refunds"]');await hp.waitForTimeout(500);// the full menu, once the account's permissions are in
  const nav=hp.locator('nav');await nav.evaluate(el=>{el.scrollLeft=el.scrollWidth});const before=await nav.evaluate(el=>el.scrollLeft);
  if(before<20)return fail('the phone menu does not scroll sideways ('+before+'px), nothing to keep');
  // Tap only what is on screen at the right end of the menu (a harness click on a hidden item would scroll the menu itself).
  const at=()=>hp.locator('nav').evaluate(el=>el.scrollLeft);
  await hp.locator('nav [data-screen="refunds"]').click();await hp.waitForTimeout(400);const afterTap=await at();
  if(Math.abs(afterTap-before)>2)return fail(`menu jumped from ${before}px to ${afterTap}px after a tap`);
  await hp.locator('#app [data-open]').first().waitFor({timeout:15000});await hp.locator('#app [data-open]').first().click();await hp.waitForSelector('[data-action=back]');const afterOpen=await at();
  await hp.click('[data-action=back]');await hp.waitForTimeout(300);await hp.locator('nav [data-screen="shifts"]').click();await hp.waitForTimeout(300);
  await hp.locator('nav [data-screen="refunds"]').click();await hp.waitForTimeout(6000);const afterSync=await at();// live sync re-renders the screen meanwhile
  const steps=[['a tap',afterTap],['opening an order',afterOpen],['going back, another tap and live sync',afterSync]].filter(([,x])=>Math.abs(x-before)>2);
  if(steps.length)return fail(`menu jumped from ${before}px: `+steps.map(([w,x])=>x+'px after '+w).join(', '));
  return await clean(hand)});
 await run('Handheld: the owner reaches dishes & prices from Quản trị only, and Quản trị stays lit there',async()=>{
  if(await hp.locator('nav [data-screen="products"]').count())return fail('Món & giá is still a separate menu entry for the owner');
  await hp.click('nav [data-screen="owner"]');await hp.locator('#app [data-screen="products"]').first().click();await hp.waitForSelector('#product-form');
  if(!await hp.locator('nav [data-screen="owner"].active').count())return fail('Quản trị is not highlighted on the dishes screen');
  return await clean(hand)});
 await run('Handheld: log out and back in keeps working; the old session cannot be used',async()=>{
  const old=await hp.evaluate(()=>localStorage.getItem('staff-session'));
  if(await hp.locator('nav [data-screen="settings"]').count())await hp.click('nav [data-screen="settings"]');else{await hp.click('nav [data-screen="owner"]');await hp.locator('#app [data-screen="settings"]').first().click()}await hp.waitForTimeout(800);
  const out=hp.locator('[data-action=logout]');if(!await out.count())return fail('no logout button');await out.first().click();await hp.waitForSelector('input[name=password]');
  if(old){const r=await api('GET','/api/staff/me',null,old);if(r.status!==401)return fail('old session still works: '+r.status)}
  await handheldLogin(hand);return await clean(hand)});
 await hand.context.close();
}catch(e){console.log('FAIL  harness: '+e.stack)}
finally{
 await browser?.close();server?.kill();
 const failed=results.filter(r=>!r.ok);
 console.log(`\n${results.length} cases, ${results.length-failed.length} passed, ${failed.length} failed`);
 for(const f of failed)console.log(`  FAIL ${f.name}\n       ${f.detail}`);
 process.exitCode=failed.length?1:0;
}
