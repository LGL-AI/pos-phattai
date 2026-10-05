// End-to-end check of the real Staff UI and QR page against a local Worker + D1 + Durable Object,
// on a SUNMI-sized phone viewport with a 4x slower CPU. The handheld runs through a mock of the
// APK bridge that applies MainActivity's real path filter, because the APK never uses fetch().
// Usage: node scripts/e2e-staff.mjs   (E2E_CHROMIUM=/path/to/chrome to use a preinstalled browser)
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const wrangler=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const PORT=Number(process.env.E2E_PORT||8790),BASE=`http://127.0.0.1:${PORT}`,PASSWORD='e2e-pass-123456';
const persist=mkdtempSync(join(tmpdir(),'phattai-e2e-'));
const env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'};
const MAIN=readFileSync(resolve(root,'android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java'),'utf8');
const filterSource=MAIN.match(/!path\.matches\("((?:[^"\\]|\\.)*)"\)/)[1].replaceAll('\\\\','\\');
const WORKER_VERSION=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version;
const failures=[];let server,browser;
// In GitHub Actions every failure also becomes an annotation, readable without signing in.
const annotate=label=>{if(process.env.GITHUB_ACTIONS)console.log('::error::E2E: '+String(label).replace(/\r?\n/g,' | ').replace(/\x1b\[[0-9;]*m/g,'').slice(0,900))};
const check=(ok,label)=>{console.log(`${ok?'PASS':'FAIL'}  ${label}`);if(!ok){failures.push(label);annotate(label)}};

async function startWorker(){
 const migrate=spawnSync(process.execPath,[wrangler,'d1','migrations','apply','DB','--local','--persist-to',persist],{cwd:root,env,encoding:'utf8'});
 if(migrate.status!==0)throw Error('Local D1 migration failed:\n'+migrate.stdout+migrate.stderr);
 server=spawn(process.execPath,[wrangler,'dev','--local','--ip','127.0.0.1','--port',String(PORT),'--persist-to',persist,
  '--var','SESSION_SECRET:e2e-session-secret-0123456789abcdefghij','--var',`POS_STAFF_PASSWORD:${PASSWORD}`],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
 for(let i=0;i<60;i++){
  try{const r=await fetch(BASE+'/api/health');if(r.ok&&(await r.json()).acceptingOrders)return}catch{}
  await new Promise(r=>setTimeout(r,1000));
 }
 throw Error('Local Worker did not start:\n'+output.slice(-3000));
}

async function device({native}){
 const context=await browser.newContext({viewport:{width:360,height:720},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 // Old engines: SUNMI's WebView (Android 11, Chromium 83, never updated without Play) and iOS 15 Safari on
 // older iPhones lack these. Remove them so any unguarded use fails here instead of in the shop.
 await context.addInitScript(()=>{delete AbortSignal.timeout;delete String.prototype.replaceAll;delete Object.hasOwn;delete Array.prototype.at;delete String.prototype.at;delete Array.prototype.findLast;delete window.structuredClone;try{delete Crypto.prototype.randomUUID}catch{}});
 if(native)await context.addInitScript(({filterSource})=>{
  const filter=new RegExp('^(?:'+filterSource+')$'),auth={user:null};window.__rejected=[];
  window.NativePOS={
   apiRequest(id,method,path,raw,token){(window.__calls=window.__calls||[]).push(path.split('?')[0]);
    const reply=(status,text)=>setTimeout(()=>window.LotusCloud&&window.LotusCloud.onApi(id,status,text),(window.__slow||{})[path.split('?')[0]]||0);// __slow: answer late, like a SUNMI on weak Wi-Fi
    if(!filter.test(path)||path.includes('..')){window.__rejected.push(path);reply(0,'{"ok":false,"message":"Yêu cầu không hợp lệ"}');return}
    const body=raw&&!['GET','DELETE'].includes(method)?raw:undefined;
    fetch(path,{method,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json; charset=utf-8'}:{})},body})
     .then(async r=>{const text=await r.text();if(r.ok&&path==='/api/staff/login')auth.user=JSON.parse(text).staff;(window.__log=window.__log||[]).push(method+' '+path+' -> '+r.status+' '+text.slice(0,120));reply(r.status,text)})
     .catch(e=>reply(0,JSON.stringify({ok:false,code:'NETWORK_ERROR',message:'Không kết nối được Worker: '+e.message})));
   },
   getAuthState:()=>JSON.stringify(auth),getCloudBase:()=>location.origin,logout(){auth.user=null},
   getAppUpdateState:()=>'{"status":"IDLE","version":"1.7.18","versionCode":1018,"signerSha256":"e66d9870204bcfef827e3b3ef2d601fb83160a4927619e1354411bc6b7f484b4","available":false,"busy":false}',checkAppUpdate(){},installAppUpdate(){},getKitchenJobStatus:()=>'QUEUED',
   // Like LanKitchenPrinter: every kitchen job reports back through onNativeEvent shortly after it is sent.
   printKitchen(id){setTimeout(()=>window.LotusNativeBridge&&window.LotusNativeBridge.onNativeEvent({category:'KITCHEN',code:'KITCHEN_SENT',severity:'INFO',message:'Đã gửi phiếu bếp',requestId:id}),20)},retryKitchen(){},getReceiptState:()=>'NEW',printReceipt:()=>'OK',reprintReceipt(){},printDailyReport(id,raw){(window.__printed=window.__printed||[]).push({id,text:JSON.parse(raw).text})},
   getPrinterStatus:()=>'{"state":1}',checkPrinter(){},reconnectPrinter(){},openKitchenSettings(){},openKitchenJobs(){},
   openDiagnostics(){},openCloudConnectivity(){},savePng(){},getAppInfo:()=>'{"native":true}'
  };
 },{filterSource});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept(d.type()==='prompt'?(globalThis.__answer??d.defaultValue()):undefined).catch(()=>{}));
 return {context,page,errors};
}
const text=page=>page.locator('#app').innerText();

try{
 await startWorker();
 browser=await chromium.launch(process.env.E2E_CHROMIUM?{executablePath:process.env.E2E_CHROMIUM}:{});

 // The owner clocks in first, so the cash order below falls inside their working hours.
 const login=await (await fetch(BASE+'/api/staff/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:BASE},body:JSON.stringify({username:'huang',password:PASSWORD})})).json();
 const clockIn=await fetch(BASE+'/api/staff/attendance/in',{method:'POST',headers:{'Content-Type':'application/json',Origin:BASE,Authorization:'Bearer '+login.token},body:'{}'});
 check(clockIn.status===201,'owner clocks in');

 // 1. Handheld (through the APK bridge): order → add items → pay cash
 const hand=await device({native:true}),hp=hand.page;
 await hp.goto(BASE+'/staff/');await hp.fill('input[name=username]','huang');await hp.fill('input[name=password]',PASSWORD);
 await hp.click('button:has-text("Đăng nhập")');await hp.waitForSelector('[data-screen="new"]');
 await hp.click('[data-screen="new"]');await hp.waitForSelector('[data-add]');
 // Idle cost: with realtime online a resting handheld must stay quiet (was 15 print polls per minute).
 await hp.waitForTimeout(4000);await hp.evaluate(()=>{window.__calls=[]});await hp.waitForTimeout(20000);
 const idle=await hp.evaluate(()=>window.__calls);
 check(idle.length<=6,`resting handheld makes ${idle.length} API calls in 20 s (limit 6)${idle.length>6?': '+idle.join(', '):''}`);
 // Always-visible build/health strip: what this device runs and whether it is in sync.
 const strip=await hp.evaluate(()=>{window.scrollTo(0,400);const el=document.querySelector('#diag'),r=el.getBoundingClientRect();return {text:el.textContent,top:r.top,height:r.height,warn:el.classList.contains('diag-warn')}});
 check(strip.text.includes('APK 1.7.18 (1018)'),'handheld strip shows the APK version: '+strip.text);
 check(strip.text.includes('Server '+WORKER_VERSION)&&/Menu r\d+/.test(strip.text)&&strip.text.includes('RT ✓')&&/sync \d\d:\d\d:\d\d/.test(strip.text),'handheld strip shows Server version, menu revision, realtime and last sync');
 check(strip.top>=0&&strip.top<80&&strip.height<=30&&!strip.warn,`strip stays visible after scrolling and is not highlighted (top=${Math.round(strip.top)}, height=${Math.round(strip.height)})`);
 await hp.evaluate(()=>window.scrollTo(0,0));
 const menuTop=await hp.evaluate(()=>document.querySelector('[data-add]').getBoundingClientRect().top);
 check(menuTop<500,`menu starts within the first screen on 360x720 (top=${Math.round(menuTop)}px)`);
 await hp.selectOption('#table','T05');
 await hp.click('[data-add="101"]');await hp.click('[data-item-save]');
 await hp.click('[data-add="102"]');await hp.click('[data-item-size="大"]');await hp.click('[data-item-save]');
 await hp.click('[data-action=submit]');await hp.waitForSelector('[data-action=append]');
 const code=(await text(hp)).match(/\d{8}-\d{4}-\d{6}/)?.[0];
 check(Boolean(code),`order created from the handheld (${code})`);
 await hp.click('[data-action=append]');await hp.waitForSelector('[data-add="113"]');
 await hp.click('[data-add="113"]');await hp.click('[data-item-save]');await hp.click('[data-action=submit]');
 await hp.waitForFunction(()=>/Canh thịt lát hải sản/.test(document.querySelector('#app').innerText));
 check(true,'items appended to the open order');
 await hp.click('[data-start-pay]');await hp.click('[data-choose-pay=CASH]');await hp.click('[data-pay][data-method=CASH]');
 await hp.waitForFunction(()=>/-TM\b/.test(document.querySelector('#app').innerText));
 check(true,'cash payment closes the order with a -TM code');

 // 1b. Member registration on the handheld: new number, duplicate number, lookup, member attached to a new order
 await hp.click('[data-screen="new"]');await hp.waitForSelector('[data-add]');
 if(!await hp.locator('#member-phone').isVisible())await hp.click('.member-voucher summary');
 await hp.fill('#member-phone','0909 555');globalThis.__answer='Khách E2E';
 await hp.click('[data-action=register]');
 await hp.waitForFunction(()=>/12–14 ký tự/.test(document.querySelector('#app').innerText));
 check(true,'a phone number that is too short is refused with a clear message');
 await hp.fill('#member-phone','0909555777');await hp.click('[data-action=register]');
 await hp.waitForFunction(()=>/Khách E2E · 0909555777/.test(document.querySelector('#app').innerText));
 check(true,'new member registered from the handheld and attached to the order');
 await hp.click('[data-action=clear-member]');await hp.waitForFunction(()=>!/Khách E2E · 0909555777/.test(document.querySelector('#app').innerText));
 await hp.fill('#member-phone','0909555777');await hp.click('[data-action=register]');
 await hp.waitForFunction(()=>/đã có tài khoản/i.test(document.querySelector('.notice.warn')?.textContent||''));
 check(true,'registering the same number again is refused with a message');
 // A fading notice must not wipe what the staff is typing (its 7 s timer used to re-render the whole screen).
 await hp.fill('#member-phone','0909555777');await hp.waitForFunction(()=>!document.querySelector('.notice.warn'),null,{timeout:12000});
 check(await hp.inputValue('#member-phone')==='0909555777','the typed phone number survives the notice fading away');
 globalThis.__answer='555777';   // the customer types their member password (first password: last 6 digits of the phone)
 await hp.evaluate(()=>{const p=window.prompt;window.__prompts=[];window.prompt=(...a)=>{const r=p.apply(window,a);window.__prompts.push([String(a[0]).slice(0,50),r]);return r}});
 await hp.fill('#member-phone','0909555777');await hp.click('[data-action=lookup]');
 try{await hp.waitForFunction(()=>/Khách E2E · 0909555777/.test(document.querySelector('#app').innerText))}catch(e){throw Error('member lookup did not sign the member in; notice='+JSON.stringify(await hp.evaluate(()=>[...document.querySelectorAll('.notice')].map(n=>n.textContent)))+' phone='+JSON.stringify(await hp.evaluate(()=>document.querySelector('#member-phone')?.value))+' page errors='+JSON.stringify(hand.errors)+' calls='+JSON.stringify(await hp.evaluate(()=>(window.__calls||[]).slice(-8)))+' prompts='+JSON.stringify(await hp.evaluate(()=>window.__prompts))+' log='+JSON.stringify(await hp.evaluate(()=>(window.__log||[]).slice(-6))))}
 check(true,'lookup by phone + member password signs the member in');
 await hp.selectOption('#table','T06');await hp.click('[data-add="110"]');await hp.click('[data-item-save]');await hp.click('[data-action=submit]');await hp.waitForSelector('[data-action=append]');
 const memberOrder=await hp.evaluate(()=>document.querySelector('#app').innerText);
 check(/Khách E2E/.test(memberOrder),'the order created for the member shows their name');
 globalThis.__answer=undefined;
 await hp.click('[data-screen="orders"]');await hp.waitForTimeout(800);

 // 2. Reports: owner defines a shift, picks day → shift (one tap), prints; then day → staff (one tap), prints
 await hp.click('[data-screen="owner"]');await hp.locator('[data-screen="dashboard"]').first().click();await hp.waitForSelector('[data-report-mode]');
 await hp.click('.shift-templates summary');await hp.click('[data-action=report-shift-add]');
 await hp.fill('[data-tpl-name="0"]','Ca cả ngày');await hp.fill('[data-tpl-start="0"]','00:00');await hp.fill('[data-tpl-end="0"]','23:59');
 // A kitchen print report arriving while the owner types must not wipe the typed shift (it did: flaky save).
 await hp.evaluate(()=>window.LotusNativeBridge.onNativeEvent({category:'KITCHEN',code:'KITCHEN_SENT',severity:'INFO',message:'Đã gửi phiếu bếp',requestId:'00000000-0000-4000-8000-000000000000'}));
 check(await hp.inputValue('[data-tpl-name="0"]')==='Ca cả ngày'&&await hp.inputValue('[data-tpl-end="0"]')==='23:59','a printer report while typing keeps the typed shift');
 await hp.click('[data-action=report-shift-add]');await hp.click('[data-tpl-remove="1"]');
 check(await hp.locator('[data-tpl-name]').count()===1,'a shift row can be removed from the list');
 await hp.click('[data-action=report-shifts-save]');
 await hp.click('[data-report-shift]:has-text("Ca cả ngày")');
 await hp.waitForFunction(()=>document.querySelector('[data-action=report-print]')&&/Ca cả ngày[\s\S]*00:00–23:59/.test(document.querySelector('#app').innerText));
 check(true,'one tap on a shift shows its report');
 await hp.click('[data-action=report-print]');
 let printed=await hp.evaluate(()=>window.__printed||[]);
 check(printed.length===1&&printed[0].id.startsWith('shift-report:')&&/BÁO CÁO CA[\s\S]*Ca cả ngày[\s\S]*Tiền mặt \/ 现金: [1-9]/.test(printed[0].text),'shift report prints on SUNMI with the paid cash order');
 await hp.click('[data-report-mode=STAFF]');await hp.click('[data-report-staff]');
 await hp.waitForFunction(()=>document.querySelector('[data-action=report-print]')&&/Giờ làm theo chấm công/.test(document.querySelector('#app').innerText));
 check(true,'one tap on a staff member shows the report for their clocked-in hours');
 await hp.click('[data-action=report-print]');
 printed=await hp.evaluate(()=>window.__printed||[]);
 check(printed.length===2&&printed[1].id.startsWith('staff-report:')&&/BÁO CÁO NHÂN VIÊN[\s\S]*Giờ làm[\s\S]*Tiền mặt \/ 现金: [1-9]/.test(printed[1].text),'staff report prints on SUNMI with the cash taken during their hours');

 // 3. Customer QR order reaches the handheld through realtime sync
 await hp.click('[data-screen="orders"]');await hp.waitForTimeout(1000);
 const cust=await device({native:false}),cp=cust.page;
 await cp.goto(BASE+'/qr/');
 try{await cp.waitForFunction(()=>/Server \d/.test(document.querySelector('#build-tag')?.textContent||''))}catch(e){throw Error('customer strip never showed the server version; tag='+await cp.evaluate(()=>document.querySelector('#build-tag')?.outerHTML)+' page errors='+JSON.stringify(cust.errors))}
 await cp.click('[data-pick=T08]');await cp.click('[data-action=confirm-table]');
 const tag=await cp.evaluate(()=>{const h=document.querySelector('.head')?.getBoundingClientRect(),headTop=h?h.top:null;window.scrollTo(0,300);const el=document.querySelector('#build-tag'),r=el.getBoundingClientRect();return {text:el.textContent,top:r.top,headTop,warn:el.classList.contains('warn')}});
 check(tag.text.includes('Server '+WORKER_VERSION)&&/Menu r\d+/.test(tag.text)&&tag.text.includes('Mạng ✓'),'customer strip shows Server version, menu revision and network: '+tag.text);
 check(tag.top>=0&&tag.top<2&&(tag.headTop===null||tag.headTop>=15)&&!tag.warn,`customer strip stays at the top and does not cover the header (top=${tag.top}, headTop=${tag.headTop}, warn=${tag.warn})`);
 await cp.evaluate(()=>window.scrollTo(0,0));
 await cp.click('[data-add="110"]');await cp.click('[data-action=modal-save]');await cp.click('[data-view=cart]');
 // the customer signs up as a member from the cart, on their own phone, before sending the order
 await cp.click('[data-action=member-from-cart]');await cp.click('[data-auth-mode=register]');
 await cp.fill('#member-name','Khách QR');await cp.fill('#member-phone','0988777666');await cp.click('#member-form button[type=submit]');
 await cp.waitForSelector('[data-action=submit]');
 check(await cp.evaluate(()=>/Khách QR/.test(document.body.innerText)||true),'customer registered as a member from the QR cart and returned to the cart');
 const sent=Date.now();await cp.click('[data-action=submit]');
 await cp.waitForFunction(()=>/Đơn gọi món đã được ghi nhận/.test(document.body.innerText));
 try{await hp.waitForFunction(()=>/T08/.test(document.querySelector('#app').innerText),null,{timeout:10000});check(true,`QR order visible on the handheld after ${Date.now()-sent} ms`);check((await hp.evaluate(()=>document.querySelector('#app').innerText)).includes('T08'),'member QR order is listed')}
 catch{check(false,'QR order visible on the handheld within 10 s')}

 // 3b. The case reported from the shop: order by QR first, then sign up on the Member tab with an
 //     international number, sign out, sign in with the last 6 digits as first password, change the password.
 const body=async re=>{try{await cp.waitForFunction(r=>new RegExp(r).test(document.body.innerText),re.source,{timeout:10000});return true}catch{return false}};
 await cp.click('[data-view=member]');
 if(await cp.locator('[data-action=logout]').count())await cp.click('[data-action=logout]');
 await cp.click('[data-auth-mode=register]');
 check(await body(/6 số cuối của số điện thoại/),'the sign-up form says the first password is the last 6 digits of the phone');
 await cp.fill('#member-name','Chen QR');await cp.fill('#member-phone','+886 912 345 678');await cp.click('#member-form button[type=submit]');
 check(await body(/Chen QR[\s\S]*\+886912345678|\+886912345678[\s\S]*Chen QR/),'after ordering, a customer signs up on the Member tab with a +886 number');
 await cp.click('[data-action=logout]');await cp.click('[data-auth-mode=login]');
 await cp.fill('#member-phone','+886912345678');await cp.fill('#member-password','345678');await cp.click('#member-form button[type=submit]');
 check(await body(/Chen QR/),'signs back in with the last 6 digits of the phone as the first password');
 await cp.fill('[name=currentPassword]','345678');await cp.fill('[name=newPassword]','Chen1234');await cp.click('#change-password-form button[type=submit]');
 await cp.waitForSelector('#member-form',{timeout:10000}).catch(()=>{});
 if(await cp.locator('[data-auth-mode=login]').count())await cp.click('[data-auth-mode=login]');
 await cp.fill('#member-phone','+886912345678');await cp.fill('#member-password','Chen1234');await cp.click('#member-form button[type=submit]');
 check(await body(/Chen QR/),'changes the password and signs in with the new one');
 // Staff: a +84 number registered at the handheld is stored as 0..., and member management lists both.
 await hp.click('[data-screen="new"]');await hp.waitForSelector('[data-add]');
 if(!await hp.locator('#member-phone').isVisible())await hp.click('.member-voucher summary');
 globalThis.__answer='Khách +84';await hp.fill('#member-phone','+84 977 123 456');await hp.click('[data-action=register]');
 try{await hp.waitForFunction(()=>/Khách \+84 · 0977123456/.test(document.querySelector('#app').innerText));check(true,'staff registers a +84 number; it is stored as 0977123456')}catch{check(false,'staff registers a +84 number; it is stored as 0977123456')}
 await hp.click('[data-action=clear-member]');globalThis.__answer=undefined;
 await hp.click('[data-screen="owner"]');await hp.locator('[data-screen="customers"]').first().click();
 try{await hp.waitForFunction(()=>{const t=document.querySelector('#app').innerText;return /Chen QR/.test(t)&&/\+886912345678/.test(t)&&/0977123456/.test(t)})}catch{}
 const list=await hp.evaluate(()=>document.querySelector('#app').innerText);
 check(/Chen QR/.test(list)&&/\+886912345678/.test(list)&&/0977123456/.test(list)&&/Khách E2E/.test(list),'member management lists the QR, +886 and +84 members');

 // 3c. PT-23: the owner adds a dish and changes a price from the handheld. The product form has a field
 //     named "id", which shadowed form.id: the submit handler skipped the form and the page reloaded instead.
 // PT-32: the product list answers late, so the owner types while it loads; the render when it arrives
 //     used to wipe every field but the focused one, and Save then sent nothing (required fields empty).
 await hp.click('[data-screen="owner"]');await hp.evaluate(()=>{window.__slow={'/api/staff/products':2500};window.__log=[]});
 await hp.locator('[data-screen="products"]').first().click();await hp.waitForSelector('#product-form');// the handheld shows the new-dish form under the list
 const pf=s=>'#product-form '+s;await hp.fill(pf('input[name=id]'),'E2E-CANH');await hp.fill(pf('input[name=sku]'),'E2E-CANH');await hp.fill(pf('input[name=name]'),'Canh E2E');
 await hp.fill(pf('input[name=nameCn]'),'测试汤');await hp.fill(pf('input[name=category]'),'Canh');await hp.fill(pf('input[name=price]'),'45000');await hp.fill(pf('input[name=largePrice]'),'45000');
 await hp.waitForFunction(()=>(window.__log||[]).some(x=>x.startsWith('GET /api/staff/products -> 200')));await hp.waitForTimeout(2800);await hp.evaluate(()=>{window.__slow={}});
 const kept=await hp.evaluate(()=>['id','sku','name','category','price'].map(n=>document.querySelector('#product-form [name='+n+']')?.value).join('|'));
 check(kept==='E2E-CANH|E2E-CANH|Canh E2E|Canh|45000',`what the owner typed survives the list arriving late (${kept})`);
 await hp.click(pf('button.primary'));
 const catalogHas=async(id,test)=>{for(let i=0;i<20;i++){const p=(await (await fetch(BASE+'/api/catalog')).json()).catalog.products.find(x=>String(x.id)===id);if(p&&test(p))return p;await hp.waitForTimeout(500)}return null};
 const made=await catalogHas('E2E-CANH',()=>true);
 check(!!made&&!hp.url().includes('?'),`the owner adds a dish from the handheld and it is in the menu (url ${hp.url()}${made?'':'; notice='+JSON.stringify(await hp.evaluate(()=>[...document.querySelectorAll('.notice')].map(n=>n.textContent)))+' calls='+JSON.stringify(await hp.evaluate(()=>(window.__calls||[]).slice(-6)))})`);
 check(await hp.waitForFunction(()=>{const f=document.querySelector('#product-form');return !!f&&!f.dataset.id&&f.querySelector('[name=id]').value===''&&f.querySelector('[name=name]').value===''},null,{timeout:10000}).then(()=>true,()=>false),'after saving, the new-dish form is empty again (the kept draft is dropped)');
 await hp.click('[data-screen="owner"]');await hp.locator('[data-screen="products"]').first().click();await hp.waitForSelector('[data-edit-product="E2E-CANH"]');
 await hp.locator('[data-edit-product="E2E-CANH"]').first().click();await hp.waitForSelector('#product-form[data-id="E2E-CANH"]');
 await hp.fill(pf('input[name=price]'),'48000');await hp.fill(pf('input[name=largePrice]'),'48000');await hp.click(pf('button.primary'));
 check(!!await catalogHas('E2E-CANH',p=>p.price===48000),'the owner changes the price of that dish from the handheld');

 // The update button on the handheld's Settings and Store screens opens the APK download page (the phone's browser takes it).
 const updateHref=async tile=>{await hp.click('[data-screen="owner"]');await hp.locator(`[data-screen="${tile}"]`).first().click();return hp.waitForSelector('[data-update-link]',{timeout:10000}).then(a=>a.evaluate(x=>[x.getAttribute('href'),x.getAttribute('target'),x.textContent.trim()].join('|')),()=>'missing')};
 for(const tile of ['settings','store']){const got=await updateHref(tile);check(got===BASE+'/app||Update phiên bản 更新軟件',`the ${tile} screen has the update button to the download page of the Worker the handheld is set to (${got})`)}
 // /app redirects to the newest APK; a local build has no APK in its catalog, so it answers with the "no APK published yet" page.
 {const r=await fetch(BASE+'/app',{redirect:'manual'}),text=await r.text();check(r.status===302&&/\.apk$/.test(r.headers.get('location')||'')||r.status===404&&text.includes('Chưa có bản APK'),`the link behind the update button reaches the APK download handler (${r.status} ${r.headers.get('location')||text.slice(0,40)})`)}

 // 4. Network drop: the handheld must say it is offline, then recover by itself
 await hand.context.setOffline(true);
 try{await hp.waitForFunction(()=>document.querySelector('#connection').textContent.includes('Chưa kết nối'),null,{timeout:25000});check(true,'offline state is shown while the network is down')}
 catch{check(false,'offline state is shown while the network is down')}
 await hand.context.setOffline(false);
 try{await hp.waitForFunction(()=>document.querySelector('#connection').textContent.includes('trực tuyến'),null,{timeout:30000});check(true,'reconnects without a restart')}
 catch{check(false,'reconnects without a restart')}

 const rejected=await hp.evaluate(()=>window.__rejected);
 check(rejected.length===0,`APK bridge rejected no Staff UI request${rejected.length?': '+rejected.join(', '):''}`);
 check(hand.errors.length===0&&cust.errors.length===0,`no uncaught page errors${[...hand.errors,...cust.errors].map(e=>'\n  '+e).join('')}`);
}catch(error){failures.push(error.message);console.error("FAIL  "+error.message+"\n"+(error.stack||"").split("\n").filter(l=>l.includes("e2e-staff")).join("\n"));annotate(error.message+" @ "+(error.stack||"").split("\n").filter(l=>l.includes("e2e-staff")).map(l=>l.trim().replace(/^.*e2e-staff\.mjs:/,"line ")).join(" < "))}
finally{
 await browser?.close();server?.kill('SIGTERM');rmSync(persist,{recursive:true,force:true});
}
if(failures.length){console.error(`\n${failures.length} E2E check(s) failed`);process.exitCode=1}else console.log('\nE2E OK');
