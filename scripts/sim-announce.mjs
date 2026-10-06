// Cross-check simulation of the new-order speaker (PT-48/PT-49, owner's requests 06/10/2026), against a local Worker + D1:
// SUNMI handhelds through a mock of the APK bridge (Bluetooth speaker present or not, Chinese voice present or not,
// kitchen printer recorded) and plain browsers (the owner tests with an ordinary speaker before the shop does).
// Off = nothing is announced and the kitchen printer prints as before; on = announced through a connected speaker.
// Usage: E2E_CHROMIUM=/opt/pw-browsers/chromium node scripts/sim-announce.mjs   (SIM_ONLY=<regex> to pick cases)
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const wrangler=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const PORT=Number(process.env.SIM_PORT||8794),BASE=`http://127.0.0.1:${PORT}`,PASSWORD='sim-pass-123456';
const persist=mkdtempSync(join(tmpdir(),'phattai-announce-'));
const env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'};
const MAIN=readFileSync(resolve(root,'android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java'),'utf8');
const filterSource=MAIN.match(/!path\.matches\("((?:[^"\\]|\\.)*)"\)/)[1].replaceAll('\\\\','\\');
const only=process.env.SIM_ONLY?new RegExp(process.env.SIM_ONLY):null;
const results=[];let server,browser,ownerToken,keyN=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function startWorker(){
 const migrate=spawnSync(process.execPath,[wrangler,'d1','migrations','apply','DB','--local','--persist-to',persist],{cwd:root,env,encoding:'utf8'});
 if(migrate.status!==0)throw Error('Local D1 migration failed:\n'+migrate.stdout+migrate.stderr);
 server=spawn(process.execPath,[wrangler,'dev','--local','--ip','127.0.0.1','--port',String(PORT),'--persist-to',persist,
  '--var','SESSION_SECRET:sim-session-secret-0123456789abcdefghij','--var',`POS_STAFF_PASSWORD:${PASSWORD}`],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let out='';server.stdout.on('data',d=>out+=d);server.stderr.on('data',d=>out+=d);
 for(let i=0;i<60;i++){try{const r=await fetch(BASE+'/api/health');if(r.ok&&(await r.json()).acceptingOrders)return}catch{}await sleep(1000)}
 throw Error('Local Worker did not start:\n'+out.slice(-3000));
}
const api=async(method,path,body,token=ownerToken,headers={})=>{const r=await fetch(BASE+path,{method,headers:{'Content-Type':'application/json',Origin:BASE,...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body?JSON.stringify(body):undefined});let data=null;try{data=await r.json()}catch{}return {status:r.status,data}};
const key=p=>`${p}_${Date.now().toString(36)}_${++keyN}`.padEnd(20,'x');
// a customer order the way the QR page sends it
const qrOrder=async(table,productId='115',qty=1)=>{const r=await api('POST','/api/orders',{table,items:[{productId,qty,mods:{}}],note:'',voucherCode:'',idempotencyKey:key('qr')},null);if(r.status!==201&&r.status!==200)throw Error('QR order '+r.status+' '+JSON.stringify(r.data).slice(0,200));return r.data};
const staffOrder=async(table,token=ownerToken)=>{const r=await api('POST','/api/staff/orders',{table,items:[{productId:'115',qty:1,mods:{}}],idempotencyKey:key('staff')},token);if(r.status!==201)throw Error('staff order '+r.status);return r.data.order};

const OLD_ENGINE=()=>{delete AbortSignal.timeout;delete String.prototype.replaceAll;delete Object.hasOwn;delete Array.prototype.at;delete String.prototype.at;delete Array.prototype.findLast;delete window.structuredClone;try{delete Crypto.prototype.randomUUID}catch{}};
// A handheld: the APK bridge with a controllable speaker and voice. A browser: no bridge; a fake Chinese voice optional.
async function device({native=true,old=native,viewport=native?{width:360,height:720}:{width:1280,height:800},speaker='bluetooth',tts='READY',zhVoice=true,hidden=false}={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:native?2:1,isMobile:native,hasTouch:native});
 if(old)await context.addInitScript(OLD_ENGINE);
 if(native)await context.addInitScript(({filterSource,speaker,tts})=>{
  // the APK keeps the session and the kitchen print state across a reload of its page
  const filter=new RegExp('^(?:'+filterSource+')$'),auth={user:JSON.parse(localStorage.getItem('mock-auth')||'null')},jobs=JSON.parse(localStorage.getItem('mock-jobs')||'{}');
  Object.assign(window,{__log:[],__kitchen:[],__receipts:[],__spoken:[],__chimes:0,__awake:false,__speaker:speaker,__tts:tts});
  window.NativePOS={
   apiRequest(id,method,path,raw,token){
    const reply=(status,text)=>setTimeout(()=>window.LotusCloud&&window.LotusCloud.onApi(id,status,text),0);
    if(!filter.test(path)||path.includes('..')){window.__log.push(method+' '+path+' -> REJECTED');reply(0,'{"ok":false,"message":"Yêu cầu không hợp lệ"}');return}
    if(window.__offline){window.__log.push(method+' '+path.split('?')[0]+' -> 0 offline');reply(0,JSON.stringify({ok:false,code:'NETWORK_ERROR',message:'Không kết nối được Worker: offline'}));return}
    const body=raw&&!['GET','DELETE'].includes(method)?raw:undefined;
    fetch(path,{method,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json; charset=utf-8'}:{})},body})
     .then(async r=>{const text=await r.text();if(r.ok&&path==='/api/staff/login'){auth.user=JSON.parse(text).staff;localStorage.setItem('mock-auth',JSON.stringify(auth.user))}window.__log.push(method+' '+path.split('?')[0]+' -> '+r.status);reply(r.status,text)})
     .catch(e=>reply(0,JSON.stringify({ok:false,code:'NETWORK_ERROR',message:'Không kết nối được Worker: '+e.message})));
   },
   getAuthState:()=>JSON.stringify(auth),getCloudBase:()=>location.origin,logout(){auth.user=null;localStorage.removeItem('mock-auth')},
   getAppUpdateState:()=>'{"status":"IDLE","version":"1.7.90","versionCode":1090,"signerSha256":"e66d9870204bcfef827e3b3ef2d601fb83160a4927619e1354411bc6b7f484b4","available":false,"busy":false}',checkAppUpdate(){},installAppUpdate(){},getKitchenJobStatus:id=>jobs[id]||'NEW',
   printKitchen(id,raw){window.__kitchen.push(id);jobs[id]='SENT';localStorage.setItem('mock-jobs',JSON.stringify(jobs));setTimeout(()=>window.LotusNativeBridge&&window.LotusNativeBridge.onNativeEvent({category:'KITCHEN',code:'KITCHEN_SENT',severity:'INFO',message:'Đã gửi phiếu bếp',requestId:id}),20)},retryKitchen(){},
   getReceiptState:()=>'NEW',printReceipt(id,raw){window.__receipts.push({id,raw});return 'OK'},reprintReceipt(){},printDailyReport(){},
   getPrinterStatus:()=>'{"state":1}',checkPrinter(){},reconnectPrinter(){},openKitchenSettings(){},openKitchenJobs(){},openDiagnostics(){},openCloudConnectivity(){},savePng(){},getAppInfo:()=>'{"native":true}',
   speak(t){if(window.__tts!=='READY')return window.__tts;window.__spoken.push(t);return 'OK'},chime(){window.__chimes++},ttsStatus:()=>JSON.stringify({state:window.__tts,engine:'sim'}),
   keepScreenOn(on){window.__awake=!!on},audioOutput:()=>JSON.stringify({bluetooth:window.__speaker==='bluetooth',wired:window.__speaker==='wired'})
  };
 },{filterSource,speaker,tts});
 else await context.addInitScript(({zhVoice})=>{
  // the browser's own voices: a Chinese one or none; what it is asked to say is recorded
  window.__spoken=[];window.__beeps=0;
  const voices=zhVoice?[{name:'Sim 普通话',lang:'zh-CN'},{name:'Sim English',lang:'en-US'}]:[{name:'Sim English',lang:'en-US'}];
  window.speechSynthesis={getVoices:()=>voices,speak(u){if(u.text.trim())window.__spoken.push(u.text+'|'+(u.lang||''))},addEventListener(){},cancel(){}};
  window.SpeechSynthesisUtterance=function(t){this.text=t};
  const C=window.AudioContext;if(C){const o=C.prototype.createOscillator;C.prototype.createOscillator=function(){window.__beeps++;return o.call(this)}}
 },{zhVoice});
 if(hidden)await context.addInitScript(()=>{Object.defineProperty(document,'hidden',{get:()=>!!window.__hide,configurable:true});Object.defineProperty(document,'visibilityState',{get:()=>window.__hide?'hidden':'visible',configurable:true})});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[],bad=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|WebSocket/.test(m.text()))errors.push('console: '+m.text())});
 page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=500)bad.push(r.status()+' '+new URL(r.url()).pathname)});
 page.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined).catch(()=>{}));
 return {context,page,errors,bad,native};
}
async function login(dev,username='huang',password=PASSWORD){
 await dev.page.goto(BASE+'/staff/');await dev.page.waitForSelector('input[name=username]');
 await dev.page.fill('input[name=username]',username);await dev.page.fill('input[name=password]',password);
 await dev.page.click('button:has-text("Đăng nhập")');await dev.page.waitForSelector('nav [data-screen]');await sleep(800);
}
async function go(dev,screen){
 const p=dev.page;if(screen==='settings'){if(await p.locator('nav [data-screen="settings"]').count())await p.click('nav [data-screen="settings"]');else{await p.click('nav [data-screen="owner"]');await p.locator('#app [data-screen="settings"]').first().click()}await p.waitForSelector('[data-action=announce-toggle]');return}
 if(await p.locator(`nav [data-screen="${screen}"]`).count())await p.click(`nav [data-screen="${screen}"]`);else{await p.click('nav [data-screen="owner"]');await p.locator(`#app [data-screen="${screen}"]`).first().click()}await sleep(400);
}
const isOn=dev=>dev.page.locator('[data-action=announce-test]:not([disabled])').count().then(n=>n>0);
async function speaker(dev,on){const back=await dev.page.evaluate(()=>document.querySelector('nav .active')?.dataset.screen||'');await go(dev,'settings');if(await isOn(dev)!==on){await dev.page.click('[data-action=announce-toggle]');await dev.page.waitForSelector(on?'[data-action=announce-test]:not([disabled])':'[data-action=announce-test][disabled]')}await sleep(1500);return back}
const spoken=dev=>dev.page.evaluate(()=>window.__spoken.slice());
const kitchen=dev=>dev.page.evaluate(()=>(window.__kitchen||[]).slice());
async function heard(dev,from,text,ms=15000){try{await dev.page.waitForFunction(([n,t])=>window.__spoken.slice(n).some(x=>x.split('|')[0]===t),[from,text],{timeout:ms});return true}catch{return false}}
const said=(dev,from)=>spoken(dev).then(x=>x.slice(from));
const overflow=page=>page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth);
async function clean(dev){const o=await overflow(dev.page);if(dev.errors.length)return fail('page error: '+dev.errors.slice(0,2).join(' | '));if(dev.bad.length)return fail('server error: '+dev.bad.slice(0,3).join(', '));if(o>1)return fail(`page scrolls sideways by ${o}px`);return null}
const fail=detail=>({ok:false,detail});
async function run(name,fn){
 if(only&&!only.test(name))return;
 const started=Date.now();let ok=true,detail='';
 try{const r=await fn();if(r&&r.ok===false){ok=false;detail=r.detail}}catch(e){ok=false;detail=(e.message||String(e)).split('\n')[0].slice(0,400)}
 results.push({name,ok,detail,ms:Date.now()-started});
 console.log(`${ok?'PASS':'FAIL'}  ${name}${ok?'':'  — '+detail}`);
 if(!ok&&process.env.GITHUB_ACTIONS)console.log('::error::SPEAKER SIM: '+(name+' — '+detail).replace(/\r?\n/g,' | ').slice(0,900));
}
const phrase=t=>t==='TAKEAWAY'?'外带，有新订单':Number(t.slice(1))+'号桌，有新订单';
const account=async(username,role,name)=>{const r=await api('POST','/api/staff/accounts',{username,name,role,password:PASSWORD+'x',active:true});if(![200,201].includes(r.status)&&!/exist|tồn tại|CONFLICT/i.test(JSON.stringify(r.data)))throw Error('account '+username+' '+r.status+' '+JSON.stringify(r.data));return (await api('POST','/api/staff/login',{username,password:PASSWORD+'x'},null)).data.token};

try{
 await startWorker();
 browser=await chromium.launch(process.env.E2E_CHROMIUM?{executablePath:process.env.E2E_CHROMIUM}:{});
 ownerToken=(await api('POST','/api/staff/login',{username:'huang',password:PASSWORD},null)).data.token;
 await api('POST','/api/staff/attendance/in',{});
 const cashierToken=await account('sim.thungan','CASHIER','Thu Ngân Sim'),kitchenToken=await account('sim.bep','KITCHEN','Bếp Sim');

 // ---------- A. Off (the default): nothing is announced; the kitchen printer prints as before ----------
 const a=await device();await login(a);
 await run('A1 off by default: Settings shows the speaker off and what "off" means; no "Bật loa" button; screen not kept awake',async()=>{
  await go(a,'settings');if(await isOn(a))return fail('on by default');
  const t=await a.page.locator('#app').innerText();if(!/Đang tắt: không chuông, không đọc; phiếu bếp vẫn in/.test(t))return fail('no explanation of "off"');
  if(await a.page.locator('#announce-unlock').count())return fail('"Bật loa" button while off');if(await a.page.evaluate(()=>window.__awake))return fail('screen kept awake while off');return await clean(a)});
 await run('A2 off: a customer QR order is not read out, no chime, no notice — and its kitchen slip still prints once',async()=>{
  const s0=(await spoken(a)).length,k0=(await kitchen(a)).length;const o=await qrOrder('T11');
  try{await a.page.waitForFunction(n=>window.__kitchen.length>n,k0,{timeout:20000})}catch{return fail('kitchen slip not printed')}
  await sleep(3000);if((await spoken(a)).length>s0)return fail('read out while off');if(await a.page.evaluate(()=>window.__chimes))return fail('chimed while off');
  if(await a.page.locator('#announce-toast').count())return fail('notice while off');if((await kitchen(a)).length-k0!==1)return fail('printed '+((await kitchen(a)).length-k0)+' times');void o;return await clean(a)});
 await run('A3 off: three orders in a row print three slips and say nothing',async()=>{
  const s0=(await spoken(a)).length,k0=(await kitchen(a)).length;for(const t of ['T12','T13','T14'])await qrOrder(t);
  try{await a.page.waitForFunction(n=>window.__kitchen.length>=n+3,k0,{timeout:25000})}catch{return fail('slips printed: '+((await kitchen(a)).length-k0))}
  await sleep(2000);return (await spoken(a)).length>s0?fail('read out while off'):await clean(a)});
 await run('A4 off: the device makes no announcement requests on the Settings screen (no watcher, no service polling)',async()=>{
  await go(a,'settings');await sleep(4000);// the taps that open Settings load the screen (refresh); count from after that
  const l0=(await a.page.evaluate(()=>window.__log.length));await sleep(20000);
  const calls=(await a.page.evaluate(n=>window.__log.slice(n),l0)).filter(x=>/sync-meta|\/api\/staff\/orders -|service-requests/.test(x));
  return calls.length?fail('requests while off: '+calls.slice(0,4).join(', ')):await clean(a)});
 await run('A5 off: a service call from a table is not read out',async()=>{
  const s0=(await spoken(a)).length,{order,orderToken}=await qrOrder('T15');const r=await api('POST',`/api/orders/${order.id}/service`,{},null,{'x-order-token':orderToken});
  if(![200,201].includes(r.status))return fail('service call '+r.status);await sleep(6000);return (await spoken(a)).length>s0?fail('read out while off'):await clean(a)});

 // ---------- B. On with a Bluetooth speaker ----------
 await run('B1 turning it on keeps the screen awake and shows "Loa Bluetooth: đã kết nối"',async()=>{
  await speaker(a,true);if(!await a.page.evaluate(()=>window.__awake))return fail('screen not kept awake');
  return /Loa Bluetooth: đã kết nối/.test(await a.page.locator('#announce-speaker').innerText())?await clean(a):fail('speaker status missing')});
 await run('B2 turning it on does not read out the orders placed while it was off',async()=>{await sleep(4000);const x=await said(a,0);return x.length?fail('read out late: '+JSON.stringify(x)):await clean(a)});
 for(const t of ['T01','T09','T10','T20','T99'])await run(`B3 a customer order at ${t} is read out as "${phrase(t)}"`,async()=>{
  const s0=(await spoken(a)).length;await qrOrder(t);if(!await heard(a,s0,phrase(t)))return fail('heard: '+JSON.stringify(await said(a,s0)));
  await sleep(1500);const x=(await said(a,s0)).filter(v=>v===phrase(t));return x.length===1?await clean(a):fail('read out '+x.length+' times')});
 await run('B4 a takeaway order is read out as "外带，有新订单"',async()=>{const s0=(await spoken(a)).length;await qrOrder('TAKEAWAY');return await heard(a,s0,phrase('TAKEAWAY'))?await clean(a):fail('heard: '+JSON.stringify(await said(a,s0)))});
 await run('B5 a chime comes with each announcement, and the notice is on screen',async()=>{
  const c0=await a.page.evaluate(()=>window.__chimes),s0=(await spoken(a)).length;await qrOrder('T21');if(!await heard(a,s0,phrase('T21')))return fail('not read out');
  if(await a.page.evaluate(()=>window.__chimes)<=c0)return fail('no chime');return /21号桌，有新订单/.test(await a.page.locator('#announce-toast').innerText().catch(()=>''))?await clean(a):fail('no notice')});
 await run('B6 five orders in a burst: five announcements, each once, the notice lists the last four',async()=>{
  const s0=(await spoken(a)).length,tables=['T22','T23','T24','T25','T26'];await Promise.all(tables.map(t=>qrOrder(t)));
  try{await a.page.waitForFunction(n=>window.__spoken.length>=n+5,s0,{timeout:20000})}catch{}
  const x=await said(a,s0);if(tables.some(t=>x.filter(v=>v===phrase(t)).length!==1))return fail('heard: '+JSON.stringify(x));
  const lines=await a.page.locator('#announce-toast > div').count();return lines>=1&&lines<=4?await clean(a):fail('notice lines '+lines)});
 await run('B7 two orders from the same table are both read out',async()=>{const s0=(await spoken(a)).length;await qrOrder('T27');await sleep(800);await qrOrder('T27');try{await a.page.waitForFunction(n=>window.__spoken.slice(n).filter(x=>x==='27号桌，有新订单').length>=2,s0,{timeout:15000})}catch{return fail('heard: '+JSON.stringify(await said(a,s0)))}return await clean(a)});
 await run('B8 an order the staff enter on another device is not read out, but it prints',async()=>{
  const s0=(await spoken(a)).length,k0=(await kitchen(a)).length;await staffOrder('T28',cashierToken);
  try{await a.page.waitForFunction(n=>window.__kitchen.length>n,k0,{timeout:20000})}catch{return fail('not printed')}
  await sleep(2000);return (await spoken(a)).length>s0?fail('read out: '+JSON.stringify(await said(a,s0))):await clean(a)});
 await run('B9 accepting a customer order and adding dishes to it is not announced again',async()=>{
  const s0=(await spoken(a)).length,{order}=await qrOrder('T29');if(!await heard(a,s0,phrase('T29')))return fail('first announcement missing');
  const d=(await api('GET','/api/staff/orders/'+order.id)).data.order;await api('POST',`/api/staff/orders/${order.id}/accept`,{version:d.version});
  const d2=(await api('GET','/api/staff/orders/'+order.id)).data.order;await api('POST',`/api/staff/orders/${order.id}/append`,{version:d2.version,items:[{productId:'115',qty:1,mods:{}}],idempotencyKey:key('append')});
  await sleep(6000);const x=(await said(a,s0)).filter(v=>v===phrase('T29'));return x.length===1?await clean(a):fail('announced '+x.length+' times')});
 await run('B10 each customer order prints exactly once while the speaker is on',async()=>{
  const k0=(await kitchen(a)).length;await qrOrder('T30');await qrOrder('T31');try{await a.page.waitForFunction(n=>window.__kitchen.length>=n+2,k0,{timeout:20000})}catch{}
  await sleep(3000);const n=(await kitchen(a)).length-k0;return n===2?await clean(a):fail('printed '+n+' slips for 2 orders')});
 for(const screen of ['orders','new','kitchen','inventory','refunds','shifts','dashboard','products','store'])
  await run(`B11 heard while the handheld is on the "${screen}" screen`,async()=>{
   await go(a,screen);const s0=(await spoken(a)).length,t='T'+(32+['orders','new','kitchen','inventory','refunds','shifts','dashboard','products','store'].indexOf(screen));await qrOrder(t);
   return await heard(a,s0,phrase(t))?await clean(a):fail('heard: '+JSON.stringify(await said(a,s0)))});
 await run('B12 heard with an order open on screen, and the order detail stays open',async()=>{
  await go(a,'orders');await a.page.locator('#app [data-open]').first().click();await a.page.waitForSelector('[data-action=back]');
  const s0=(await spoken(a)).length;await qrOrder('T41');if(!await heard(a,s0,phrase('T41')))return fail('not heard');
  return await a.page.locator('[data-action=back]').count()?await clean(a):fail('the order detail was closed')});
 await run('B13 an announcement does not wipe a sale being entered (table, cart, note)',async()=>{
  await go(a,'new');await a.page.waitForSelector('[data-add]');await a.page.selectOption('#table','T42');await a.page.click('[data-add="115"]');await a.page.waitForSelector('[data-item-save]');await a.page.click('[data-item-save]');
  await a.page.fill('#order-note','ít cay');const s0=(await spoken(a)).length;await qrOrder('T43');if(!await heard(a,s0,phrase('T43')))return fail('not heard');
  const st=await a.page.evaluate(()=>({table:document.querySelector('#table')?.value,note:document.querySelector('#order-note')?.value,cart:document.querySelectorAll('[data-cart-remove]').length}));
  return st.table==='T42'&&st.note==='ít cay'&&st.cart>=1?await clean(a):fail(JSON.stringify(st))});
 await run('B14 the notice does not block the menu: the bottom navigation still works while it shows',async()=>{
  const s0=(await spoken(a)).length;await qrOrder('T44');if(!await heard(a,s0,phrase('T44')))return fail('not heard');
  if(!await a.page.locator('#announce-toast').count())return fail('no notice');await a.page.click('nav [data-screen="orders"]');return await a.page.locator('nav [data-screen="orders"].active').count()?await clean(a):fail('nav did not switch')});
 await run('B15 the test button reads "5号桌，有新订单"',async()=>{await go(a,'settings');const s0=(await spoken(a)).length;await a.page.click('[data-action=announce-test]');return await heard(a,s0,'5号桌，有新订单',4000)?await clean(a):fail('not read')});
 await run('B16 a service call from a table is read out as "N号桌呼叫服务员", once',async()=>{
  const s0=(await spoken(a)).length,{order,orderToken}=await qrOrder('T45');await heard(a,s0,phrase('T45'));
  const s1=(await spoken(a)).length;await api('POST',`/api/orders/${order.id}/service`,{},null,{'x-order-token':orderToken});
  if(!await heard(a,s1,'45号桌呼叫服务员',20000))return fail('heard: '+JSON.stringify(await said(a,s1)));
  await api('POST',`/api/orders/${order.id}/service`,{},null,{'x-order-token':orderToken});await sleep(9000);
  const x=(await said(a,s1)).filter(v=>v==='45号桌呼叫服务员');return x.length===1?await clean(a):fail('read '+x.length+' times')});

 // ---------- C. The speaker: connected, lost, back ----------
 await run('C1 Bluetooth speaker disconnected: Settings says so within 2 s',async()=>{await go(a,'settings');await a.page.evaluate(()=>{window.__speaker='none'});await sleep(2500);
  return /Chưa kết nối loa Bluetooth/.test(await a.page.locator('#announce-speaker').innerText())?await clean(a):fail('status not updated')});
 await run('C2 no speaker: an order is not played through the handheld speaker, only shown with "chưa kết nối loa"',async()=>{
  const s0=(await spoken(a)).length,c0=await a.page.evaluate(()=>window.__chimes);await qrOrder('T46');
  try{await a.page.waitForFunction(()=>/46号桌，有新订单 · chưa kết nối loa/.test(document.querySelector('#announce-toast')?.textContent||''),null,{timeout:15000})}catch{return fail('no notice')}
  if((await spoken(a)).length>s0||await a.page.evaluate(()=>window.__chimes)>c0)return fail('played without a speaker');return await clean(a)});
 await run('C3 no speaker: the test button says to pair the Bluetooth speaker',async()=>{await a.page.click('[data-action=announce-test]');try{await a.page.waitForFunction(()=>/Chưa kết nối loa Bluetooth: ghép loa/.test(document.querySelector('#app').innerText),null,{timeout:4000})}catch{return fail('no message')}return await clean(a)});
 await run('C4 speaker back: the status turns green and the next order is read out',async()=>{
  await a.page.evaluate(()=>{window.__speaker='bluetooth'});await sleep(2500);if(!/đã kết nối/.test(await a.page.locator('#announce-speaker').innerText()))return fail('status');
  const s0=(await spoken(a)).length;await qrOrder('T47');return await heard(a,s0,phrase('T47'))?await clean(a):fail('not heard')});
 await run('C5 a wired speaker counts as a speaker',async()=>{await a.page.evaluate(()=>{window.__speaker='wired'});await sleep(2500);
  if(!/Loa có dây: đã kết nối/.test(await a.page.locator('#announce-speaker').innerText()))return fail('status');const s0=(await spoken(a)).length;await qrOrder('T48');
  const ok=await heard(a,s0,phrase('T48'));await a.page.evaluate(()=>{window.__speaker='bluetooth'});return ok?await clean(a):fail('not heard')});
 await run('C6 no Chinese voice on the device: Settings says to install it, an order still chimes and shows',async()=>{
  await a.page.evaluate(()=>{window.__tts='NO_VOICE'});await go(a,'orders');await go(a,'settings');
  if(!/chưa có giọng tiếng Trung/.test(await a.page.locator('#announce-voice').innerText()))return fail('voice status');
  const c0=await a.page.evaluate(()=>window.__chimes);await qrOrder('T49');try{await a.page.waitForFunction(n=>window.__chimes>n,c0,{timeout:15000})}catch{return fail('no chime')}
  await a.page.evaluate(()=>{window.__tts='READY'});return await clean(a)});

 // ---------- D. Turning it off and on, signing in again, reloading ----------
 await run('D1 off again: the screen may sleep, nothing is read out, the slip still prints',async()=>{
  await speaker(a,false);if(await a.page.evaluate(()=>window.__awake))return fail('still awake');const s0=(await spoken(a)).length,k0=(await kitchen(a)).length;await qrOrder('T50');
  try{await a.page.waitForFunction(n=>window.__kitchen.length>n,k0,{timeout:20000})}catch{return fail('not printed')}await sleep(2000);return (await spoken(a)).length>s0?fail('read out while off'):await clean(a)});
 await run('D2 off → on → off → on quickly: nothing is read twice or late',async()=>{
  for(const on of [true,false,true]){await go(a,'settings');await speaker(a,on)}const s0=(await spoken(a)).length;await qrOrder('T51');if(!await heard(a,s0,phrase('T51')))return fail('not heard');
  await sleep(3000);const x=await said(a,s0);return x.length===1?await clean(a):fail('heard: '+JSON.stringify(x))});
 await run('D3 the setting survives a reload; after the reload old orders are not read again',async()=>{
  const s0=(await spoken(a)).length;await a.page.reload();await a.page.waitForSelector('nav [data-screen]');await sleep(4000);
  if(!await a.page.evaluate(()=>window.__awake))return fail('not on after reload');const x=await said(a,0);if(x.length)return fail('read again after reload: '+JSON.stringify(x));void s0;
  const s1=(await spoken(a)).length;await qrOrder('T52');return await heard(a,s1,phrase('T52'))?await clean(a):fail('not heard after reload')});
 await run('D4 log out: nothing is read and the screen may sleep; log in again: only new orders are read',async()=>{
  await go(a,'settings');await a.page.click('[data-action=logout]');await a.page.waitForSelector('input[name=password]');if(await a.page.evaluate(()=>window.__awake))return fail('awake while logged out');
  const s0=(await spoken(a)).length;await qrOrder('T53');await sleep(4000);if((await spoken(a)).length>s0)return fail('read out while logged out');
  await login(a);await sleep(3000);if((await spoken(a)).length>s0)return fail('read out the order placed before login');
  await qrOrder('T54');return await heard(a,s0,phrase('T54'))?await clean(a):fail('not heard after login')});

 // ---------- E. Several devices ----------
 const b=await device();await login(b,'sim.thungan',PASSWORD+'x');
 const k=await device();await login(k,'sim.bep',PASSWORD+'x');
 await run('E1 handheld A on, handheld B off: only A reads the order out',async()=>{
  const sa=(await spoken(a)).length,sb=(await spoken(b)).length;await qrOrder('T55');if(!await heard(a,sa,phrase('T55')))return fail('A did not read it');
  await sleep(2000);return (await spoken(b)).length>sb?fail('B read it while off'):(await clean(a))||(await clean(b))});
 await run('E2 both on: each reads it once',async()=>{
  await speaker(b,true);const sa=(await spoken(a)).length,sb=(await spoken(b)).length;await qrOrder('T56');
  if(!await heard(a,sa,phrase('T56'))||!await heard(b,sb,phrase('T56')))return fail('A '+JSON.stringify(await said(a,sa))+' B '+JSON.stringify(await said(b,sb)));
  await sleep(2000);const na=(await said(a,sa)).length,nb=(await said(b,sb)).length;return na===1&&nb===1?(await clean(a))||(await clean(b)):fail(`A ${na}, B ${nb}`)});
 await run('E3 with three handhelds printing, each order still prints exactly once in all',async()=>{
  const k0=[(await kitchen(a)).length,(await kitchen(b)).length,(await kitchen(k)).length];await qrOrder('T57');await sleep(12000);
  const n=(await kitchen(a)).length+(await kitchen(b)).length+(await kitchen(k)).length-k0.reduce((x,y)=>x+y,0);return n===1?await clean(a):fail('printed '+n+' times')});
 await run('E4 the kitchen account hears every new order: a staff order too; the cashier device does not',async()=>{
  await speaker(k,true);const sk=(await spoken(k)).length,sb=(await spoken(b)).length;await staffOrder('T58',ownerToken);
  if(!await heard(k,sk,phrase('T58')))return fail('kitchen did not hear the staff order: '+JSON.stringify(await said(k,sk)));
  await sleep(2000);return (await said(b,sb)).includes(phrase('T58'))?fail('the cashier device read a staff order'):await clean(k)});
 await run('E5 the kitchen account hears customer orders too',async()=>{const sk=(await spoken(k)).length;await qrOrder('T59');return await heard(k,sk,phrase('T59'))?await clean(k):fail('not heard')});
 await run('E6 the kitchen device has no money on its notice and no service polling',async()=>{
  const t=await k.page.locator('#announce-toast').innerText().catch(()=>'');if(/đ\b|₫|\d{2,3}\.\d{3}/.test(t))return fail('money in notice: '+t);
  const calls=(await k.page.evaluate(()=>window.__log)).filter(x=>/service-requests/.test(x));return calls.length?fail('kitchen polls service calls'):await clean(k)});
 await run('E7 turning A off does not affect B',async()=>{
  await speaker(a,false);const sa=(await spoken(a)).length,sb=(await spoken(b)).length;await qrOrder('T60');if(!await heard(b,sb,phrase('T60')))return fail('B did not hear');
  await sleep(1500);const r=(await spoken(a)).length>sa?fail('A read it while off'):await clean(b);await speaker(a,true);return r});
 await run('E8 a staff order entered on handheld B is not read out by A (cashier) and prints once',async()=>{
  await go(b,'new');await b.page.waitForSelector('[data-add]');await b.page.selectOption('#table','T61');await b.page.click('[data-add="115"]');await b.page.waitForSelector('[data-item-save]');await b.page.click('[data-item-save]');
  const sa=(await spoken(a)).length;await b.page.click('[data-action=submit]');await b.page.waitForSelector('[data-action=append]');await sleep(5000);
  return (await said(a,sa)).includes(phrase('T61'))?fail('A read a staff order'):(await clean(a))||(await clean(b))});
 await k.context.close();

 // ---------- F. Network ----------
 await run('F1 offline for 10 s: the order placed meanwhile is read out once after the network is back',async()=>{
  const s0=(await spoken(a)).length;await a.page.evaluate(()=>{window.__offline=true});await a.context.setOffline(true);await qrOrder('T62');await sleep(10000);
  await a.page.evaluate(()=>{window.__offline=false});await a.context.setOffline(false);if(!await heard(a,s0,phrase('T62'),40000))return fail('not heard after reconnect');
  await sleep(3000);const x=(await said(a,s0)).filter(v=>v===phrase('T62'));return x.length===1?await clean(a):fail('read '+x.length+' times')});
 await run('F2 without the realtime socket the order is still read out by polling (≤ 20 s)',async()=>{
  await a.page.evaluate(()=>{window.__noWs=true});await a.page.routeWebSocket?.(/\/api\/realtime/,ws=>ws.close());await a.page.reload();await a.page.waitForSelector('nav [data-screen]');await go(a,'settings');await sleep(3000);
  const s0=(await spoken(a)).length;await qrOrder('T63');const ok=await heard(a,s0,phrase('T63'),25000);await a.page.unrouteAll?.();return ok?await clean(a):fail('not heard')});
 await run('F3 the server failing for a while: retries back off, then the order is read out',async()=>{
  await a.page.reload();await a.page.waitForSelector('nav [data-screen]');await go(a,'settings');await sleep(2000);
  let fails=0;await a.page.route('**/api/staff/sync-meta',r=>{if(fails++<3)return r.fulfill({status:503,body:'{"ok":false}'});return r.continue()});
  const s0=(await spoken(a)).length;await qrOrder('T64');const ok=await heard(a,s0,phrase('T64'),45000);await a.page.unroute('**/api/staff/sync-meta');a.bad.length=0;return ok?await clean(a):fail('not heard')});

 // ---------- G. A browser with an ordinary speaker (how the owner tests before the shop) ----------
 const w=await device({native:false,hidden:true});await login(w);
 await run('G1 browser: off by default, no "Bật loa" button, Settings explains it plays through the selected speaker once on',async()=>{
  await go(w,'settings');if(await isOn(w))return fail('on by default');if(await w.page.locator('#announce-unlock').count())return fail('button while off');
  await speaker(w,true);return /loa đang chọn của máy tính/.test(await w.page.locator('#announce-speaker').innerText())?await clean(w):fail('speaker line')});
 await run('G2 browser: a customer order chimes and is spoken in Chinese with the Chinese voice',async()=>{
  const s0=(await spoken(w)).length,b0=await w.page.evaluate(()=>window.__beeps);await qrOrder('T65');
  if(!await heard(w,s0,phrase('T65')))return fail('heard: '+JSON.stringify(await said(w,s0)));const x=(await said(w,s0)).find(v=>v.startsWith(phrase('T65')));
  if(!/\|zh-CN$/.test(x))return fail('voice '+x);return await w.page.evaluate(()=>window.__beeps)>b0?await clean(w):fail('no chime')});
 await run('G3 browser tab hidden: it keeps listening and reads the order out',async()=>{
  await w.page.evaluate(()=>{window.__hide=true;document.dispatchEvent(new Event('visibilitychange'))});await sleep(1500);
  const s0=(await spoken(w)).length;await qrOrder('T66');const ok=await heard(w,s0,phrase('T66'),30000);
  await w.page.evaluate(()=>{window.__hide=false;document.dispatchEvent(new Event('visibilitychange'))});return ok?await clean(w):fail('not heard while hidden')});
 await run('G4 browser tab hidden with the speaker off: the realtime socket is closed and no requests are made',async()=>{
  await speaker(w,false);await w.page.evaluate(()=>{window.__hide=true;document.dispatchEvent(new Event('visibilitychange'))});
  let n=0;const count=r=>{if(r.url().includes('/api/'))n++};w.page.on('request',count);await sleep(15000);w.page.off('request',count);
  await w.page.evaluate(()=>{window.__hide=false;document.dispatchEvent(new Event('visibilitychange'))});await speaker(w,true);return n?fail(n+' requests while hidden and off'):await clean(w)});
 await run('G5 browser reload: one tap on "Bật loa" turns the sound back on, then orders are heard',async()=>{
  await w.page.reload();await w.page.waitForSelector('nav [data-screen]');if(!await w.page.locator('#announce-unlock').count())return fail('no button after reload');
  await w.page.click('#announce-unlock');if(await w.page.locator('#announce-unlock').count())return fail('button stays');const s0=(await spoken(w)).length;await qrOrder('T67');return await heard(w,s0,phrase('T67'))?await clean(w):fail('not heard')});
 await w.context.close();
 await run('G6 browser without a Chinese voice: chime and notice, and Settings says it has no Chinese voice',async()=>{
  const v=await device({native:false,zhVoice:false});try{await login(v);await speaker(v,true);
   if(!/chưa có giọng tiếng Trung/.test(await v.page.locator('#announce-voice').innerText()))return fail('voice line');
   const b0=await v.page.evaluate(()=>window.__beeps);await qrOrder('T68');try{await v.page.waitForFunction(()=>/68号桌，有新订单/.test(document.querySelector('#announce-toast')?.textContent||''),null,{timeout:15000})}catch{return fail('no notice')}
   if(await v.page.evaluate(()=>window.__spoken.length))return fail('spoke with a non-Chinese voice');return await v.page.evaluate(()=>window.__beeps)>b0?await clean(v):fail('no chime')}finally{await v.context.close()}});
 for(const [label,opts] of [['iPhone SE 320px, old engine',{native:false,old:true,viewport:{width:320,height:568}}],['Android phone 360px',{native:false,old:false,viewport:{width:360,height:740}}],['iPad 768px',{native:false,old:true,viewport:{width:768,height:1024}}]])
  await run(`G7 browser ${label}: heard, the notice fits the screen, no page error`,async()=>{
   const v=await device(opts);try{await login(v);await speaker(v,true);const t='T'+(69+['iPhone','Android','iPad'].findIndex(x=>label.startsWith(x)));const s0=(await spoken(v)).length;await qrOrder(t);
    if(!await heard(v,s0,phrase(t)))return fail('not heard');const box=await v.page.locator('#announce-toast').boundingBox();if(!box||box.x<0||box.x+box.width>opts.viewport.width+1)return fail('notice off screen '+JSON.stringify(box));return await clean(v)}finally{await v.context.close()}});
 await run('G8 the counter page (desktop) announces too when turned on',async()=>{
  const v=await device({native:false});try{await v.page.goto(BASE+'/counter/');await v.page.waitForSelector('input[name=username]');await v.page.fill('input[name=username]','huang');await v.page.fill('input[name=password]',PASSWORD);await v.page.click('button:has-text("Đăng nhập")');await v.page.waitForSelector('nav [data-screen]');
   await v.page.click('nav [data-screen="settings"]');await v.page.waitForSelector('[data-action=announce-toggle]');await v.page.click('[data-action=announce-toggle]');await sleep(1500);
   const s0=(await spoken(v)).length;await qrOrder('T72');return await heard(v,s0,phrase('T72'))?await clean(v):fail('not heard')}finally{await v.context.close()}});

 // ---------- H. Request budget (Cloudflare Free: 100,000 requests a day) ----------
 await run('H1 on and idle on Settings with realtime: at most 2 announcement checks a minute',async()=>{
  await a.page.reload();await a.page.waitForSelector('nav [data-screen]');await go(a,'settings');await sleep(5000);const l0=await a.page.evaluate(()=>window.__log.length);await sleep(60000);
  const calls=(await a.page.evaluate(n=>window.__log.slice(n),l0)).filter(x=>/sync-meta|\/api\/staff\/orders -/.test(x));return calls.length<=4?await clean(a):fail(calls.length+' calls in a minute: '+calls.join(', '))});
 await run('H2 on the order list the watcher stays off (the live sync already loads orders): no extra order reads',async()=>{
  await go(a,'orders');await sleep(3000);const l0=await a.page.evaluate(()=>window.__log.length);await sleep(30000);
  const reads=(await a.page.evaluate(n=>window.__log.slice(n),l0)).filter(x=>/\/api\/staff\/orders -/.test(x));return reads.length<=1?await clean(a):fail(reads.length+' order reads while idle')});
 await run('H3 one new order costs at most two reads on an announcing device on Settings (sync-meta + orders)',async()=>{
  await go(a,'settings');await sleep(3000);const l0=await a.page.evaluate(()=>window.__log.length),s0=(await spoken(a)).length;await qrOrder('T73');await heard(a,s0,phrase('T73'));await sleep(2000);
  const calls=(await a.page.evaluate(n=>window.__log.slice(n),l0)).filter(x=>/sync-meta|\/api\/staff\/orders -/.test(x));return calls.length<=3?await clean(a):fail(calls.join(', '))});

 // ---------- I. The real QR page end to end ----------
 for(const [label,old] of [['old engine (iOS 15 / WebView 83)',true],['current Chrome',false]])
  await run(`I1 a customer ordering on the real QR page (${label}) is heard on the handheld`,async()=>{
   const phone=await device({native:false,old,viewport:{width:390,height:844}});const t=old?'T74':'T75';
   try{await phone.page.goto(BASE+'/qr/?table='+t);await phone.page.waitForSelector('[data-add]');
    if(await phone.page.locator('[data-action=confirm-table]').isVisible().catch(()=>false)){if(await phone.page.locator(`[data-pick=${t}]`).count())await phone.page.click(`[data-pick=${t}]`);await phone.page.click('[data-action=confirm-table]')}
    await phone.page.click('[data-add="115"]');await phone.page.waitForSelector('[data-action=modal-save]');await phone.page.click('[data-action=modal-save]');
    await phone.page.click('[data-view=cart]');await phone.page.waitForSelector('[data-action=submit]');const s0=(await spoken(a)).length;await phone.page.click('[data-action=submit]');
    return await heard(a,s0,phrase(t),20000)?await clean(a):fail('not heard: '+JSON.stringify(await said(a,s0)))}finally{await phone.context.close()}});
 await b.context.close();await a.context.close();
}catch(e){console.log('FAIL  harness: '+e.stack);results.push({name:'harness',ok:false,detail:e.message})}
finally{
 await browser?.close();server?.kill();
 const failed=results.filter(r=>!r.ok);
 console.log(`\n${results.length} cases, ${results.length-failed.length} passed, ${failed.length} failed`);
 for(const f of failed)console.log(`  FAIL ${f.name}\n       ${f.detail}`);
 process.exitCode=failed.length?1:0;
}
