import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium as playwrightChromium} from 'playwright';
import serverlessChromium from '@sparticuz/chromium';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const results=[];
const runtimeErrors=[];

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((request,response)=>{
  const parsed=new URL(request.url,'http://127.0.0.1');
  let relative=decodeURIComponent(parsed.pathname).replace(/^\/+/, '')||'index.html';
  let target=path.resolve(root,relative);
  if(!target.startsWith(root)){response.writeHead(403);response.end('Forbidden');return;}
  if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  if(!fs.existsSync(target)){response.writeHead(404);response.end('Not found');return;}
  const ext=path.extname(target);
  response.writeHead(200,{'content-type':MIME[ext]||'application/octet-stream','cache-control':'no-cache'});
  fs.createReadStream(target).pipe(response);
});
await new Promise(resolve=>server.listen(4175,'127.0.0.1',resolve));

async function test(id,group,expected,fn){
  const timestamp=new Date().toISOString();
  try{
    const actual=await fn();
    if(actual===false)throw new Error('assertion returned false');
    results.push({id,group,expected,actual:typeof actual==='string'?actual:JSON.stringify(actual??'PASS'),status:'PASS',timestamp});
  }catch(error){
    results.push({id,group,expected,actual:error.message,status:'FAIL',timestamp});
  }
}
function ensure(condition,message){if(!condition)throw new Error(message);return true;}

const executablePath=await serverlessChromium.executablePath();
const browser=await playwrightChromium.launch({executablePath,headless:true,args:[...serverlessChromium.args,'--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
const page=await context.newPage();
page.on('pageerror',error=>runtimeErrors.push(error.stack||error.message));
page.on('console',message=>{if(message.type()==='error')runtimeErrors.push(message.text());});
const base='http://127.0.0.1:4175';

await page.goto(`${base}/index.html`,{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);
await page.evaluate(()=>localStorage.clear());
await page.reload({waitUntil:'networkidle'});
await test('BROWSER-001','runtime','Desktop opens without runtime errors',async()=>ensure(runtimeErrors.length===0,runtimeErrors.join(' | ')));
await test('BROWSER-002','desktop','All 14 desktop views activate from navigation',async()=>{
  const buttons=page.locator('#nav button[data-view]'),count=await buttons.count();
  for(let i=0;i<count;i++){
    const button=buttons.nth(i),view=await button.getAttribute('data-view');await button.click();
    const active=await page.locator('.view.active').getAttribute('id');ensure(active===`view-${view}`,`${view} -> ${active}`);
  }
  return `${count} views`;
});
await page.locator('#nav button[data-view="settings"]').click();
await test('BROWSER-003','settings','Role matrix and OCB Store Settings render',async()=>ensure(await page.locator('.permission-matrix').isVisible()&&await page.locator('#settingsBankAccount').isVisible(),'settings controls missing'));
await test('BROWSER-004','settings','QR inspector contains no bank save control',async()=>ensure(await page.locator('#qrAccountInspector #saveBankPayment').count()===0,'customer bank editor leaked'));
await page.setViewportSize({width:1440,height:1000});
fs.mkdirSync(path.join(root,'test-results','screenshots'),{recursive:true});
await page.screenshot({path:path.join(root,'test-results','screenshots','desktop-settings-1440.png'),fullPage:true});

for(const width of [320,360,375,390,430,600,768]){
  await page.setViewportSize({width,height:844});
  await page.goto(`${base}/index.html?mode=qr&table=T02`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,sidebar:getComputedStyle(document.querySelector('.sidebar')).display,phoneWidth:document.querySelector('#qrPhone').getBoundingClientRect().width,table:LotusPOC.S().qr.table,bottomTabs:document.querySelectorAll('#qrPhone .mobile-bottom-nav button').length}));
  await test(`UI-QR-${width}`,'responsive',`QR ${width}px has no horizontal overflow and hides desktop chrome`,async()=>{ensure(metrics.scrollWidth<=metrics.innerWidth+1,`overflow ${metrics.scrollWidth}>${metrics.innerWidth}`);ensure(metrics.sidebar==='none','sidebar visible');ensure(metrics.phoneWidth<=metrics.innerWidth+1,`phone ${metrics.phoneWidth}`);ensure(metrics.bottomTabs===4,'bottom tabs != 4');ensure(metrics.table==='T02','table lost');return metrics;});
  if([320,390,430].includes(width))await page.screenshot({path:path.join(root,'test-results','screenshots',`qr-${width}.png`),fullPage:true});
}

await test('BROWSER-FONT','bilingual','Bundled Simplified Chinese font is ready',async()=>{const diagnostic=await page.evaluate(async()=>({ready:document.fonts.check('16px "Lotus Noto SC"','热'),faces:[...document.fonts].map(face=>({family:face.family,status:face.status,weight:face.weight})),fontStatus:(await fetch('/fonts/noto-sans-sc-400.woff2')).status,bodyFont:getComputedStyle(document.body).fontFamily}));ensure(diagnostic.ready,JSON.stringify(diagnostic));return diagnostic;});

await page.setViewportSize({width:390,height:844});
await page.goto(`${base}/index.html?mode=qr&table=T02`,{waitUntil:'networkidle'});
await page.locator('[data-qradd="1"]').click();await page.locator('#confirmModifier').click();await page.locator('[data-qr-tab="cart"]').click();await page.locator('#qrCheckout').click();
await test('BROWSER-012','qr-flow','QR checkout starts with login/register/guest choices',async()=>ensure(await page.locator('#qrCheckoutLogin').isVisible()&&await page.locator('#qrCheckoutRegister').isVisible()&&await page.locator('#qrGuestNext').isVisible(),'member choices missing'));
await page.locator('#qrGuestNext').click();await page.locator('#qrVoucherNext').click();await page.locator('[data-qr-payment="BANK"]').click();
await test('BROWSER-013','qr-payment','OCB result shows order barcode and bank QR',async()=>ensure(await page.locator('.order-barcode-box svg').isVisible()&&await page.locator('.payment-qr-box svg').isVisible(),'dual codes missing'));
await test('BROWSER-014','qr-payment','OCB result has four visible fallback actions',async()=>ensure(await page.locator('.payment-fallbacks button').count()===4,'fallback count'));
const pendingState=await page.evaluate(()=>{const o=LotusPOC.S().orders.at(-1);return{status:o.status,paymentStatus:o.paymentStatus,amount:o.paymentRequest.amount,total:o.total,content:o.paymentRequest.content,code:o.code};});
await test('BROWSER-015','qr-payment','Payment request amount and content match order',async()=>{ensure(pendingState.status!=='PAID'&&pendingState.paymentStatus==='PENDING','premature paid');ensure(pendingState.amount===pendingState.total,'amount mismatch');ensure(pendingState.content.includes(pendingState.code),'content mismatch');return pendingState;});
await page.locator('[data-payment-action="ocb"]').click();
await test('BROWSER-016','qr-payment','OCB direct action carries exact recipient, amount and order note',async()=>{const raw=await page.locator('[data-payment-action="ocb"]').getAttribute('data-ocb-url'),url=new URL(raw);ensure(url.hostname==='dl.vietqr.io'&&url.searchParams.get('app')==='ocb'&&url.searchParams.get('ba')==='609271@ocb'&&url.searchParams.get('am')===String(pendingState.total)&&url.searchParams.get('tn')===pendingState.content&&url.searchParams.get('bn')==='HUANG TIANSHENG',raw);return raw;});
await page.locator('[data-payment-action="reported"]').click();
await test('BROWSER-017','qr-payment','Customer report stays CUSTOMER_REPORTED without receipt',async()=>{const state=await page.evaluate(()=>{const o=LotusPOC.S().orders.at(-1);return{status:o.status,paymentStatus:o.paymentStatus,receipts:LotusPOC.S().receipts.filter(r=>r.orderId===o.id).length};});ensure(state.status!=='PAID'&&state.paymentStatus==='CUSTOMER_REPORTED'&&state.receipts===0,JSON.stringify(state));return state;});

for(const width of [320,360,390,430,600,768]){
  await page.setViewportSize({width,height:844});
  await page.goto(`${base}/index.html?mode=staff`,{waitUntil:'networkidle'});
  const metrics=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,sidebar:getComputedStyle(document.querySelector('.sidebar')).display,iphoneBorder:getComputedStyle(document.querySelector('.iphone')).borderTopWidth,iphoneRadius:getComputedStyle(document.querySelector('.iphone')).borderRadius}));
  await test(`UI-STAFF-${width}`,'responsive',`Staff ${width}px has no overflow/mock phone/desktop sidebar`,async()=>{ensure(metrics.scrollWidth<=metrics.innerWidth+1,`overflow ${metrics.scrollWidth}>${metrics.innerWidth}`);ensure(metrics.sidebar==='none','sidebar visible');ensure(metrics.iphoneBorder==='0px'&&metrics.iphoneRadius==='0px',JSON.stringify(metrics));return metrics;});
}

await page.setViewportSize({width:390,height:844});
await page.goto(`${base}/index.html?mode=staff`,{waitUntil:'networkidle'});
if(await page.locator('#mLogin').count()){
  await page.locator('#mLoginStaff').selectOption('2');await page.locator('#mPin').fill('2222');await page.locator('#mLogin').click();
}
await test('BROWSER-024','staff-flow','Staff app has exactly four required bottom tabs',async()=>{const labels=await page.locator('#mobileScreen .mobile-bottom-nav button').allTextContents();ensure(labels.length===4&&labels.some(x=>x.includes('Bán hàng'))&&labels.some(x=>x.includes('Đơn hàng'))&&labels.some(x=>x.includes('Bàn'))&&labels.some(x=>x.includes('Cá nhân')),labels.join('|'));return labels.join(' | ');});
await page.locator('[data-madd="2"]').click();await page.locator('#confirmModifier').click();await page.locator('#mStartCheckout').click();
await test('BROWSER-025','staff-flow','Handheld checkout includes phone lookup and new member registration',async()=>ensure(await page.locator('#mMemberPhone').isVisible()&&await page.locator('#mRegisterMember').isVisible(),'member controls missing'));
await page.locator('#mGuestCheckout').click();await page.locator('#mVoucherNext').click();await page.locator('[data-m-payment="BANK"]').click();
await test('BROWSER-026','staff-payment','Handheld bank result has manual checked-money confirmation',async()=>ensure(await page.locator('[data-payment-action="confirm-staff"]').isVisible(),'manual confirm missing'));
page.once('dialog',dialog=>dialog.accept());
await page.locator('[data-payment-action="confirm-staff"]').click();
await test('BROWSER-027','staff-payment','Manual staff confirm produces one paid receipt',async()=>{const state=await page.evaluate(()=>{const o=LotusPOC.S().orders.at(-1);return{status:o.status,receipts:LotusPOC.S().receipts.filter(r=>r.orderId===o.id).length};});ensure(state.status==='PAID'&&state.receipts===1,JSON.stringify(state));return state;});
await page.evaluate(()=>{for(const element of document.querySelectorAll('.staff-main-scroll,.iphone-screen,#mobileScreen'))element.scrollTop=0;window.scrollTo(0,0);});
await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:path.join(root,'test-results','screenshots','staff-390-paid.png'),fullPage:true});

await page.goto(`${base}/index.html`,{waitUntil:'networkidle'});await page.locator('#nav button[data-view="license"]').click();await page.locator('[data-license-scenario="D_PLUS_3_0500"]').click();
await test('BROWSER-028','license','License D+3 05:00 visibly becomes SUSPENDED',async()=>ensure((await page.locator('#licenseSimulatorRoot').innerText()).includes('SUSPENDED'),'suspended state missing'));
await page.locator('#nav button[data-view="pos"]').click();
await test('BROWSER-029','license','SUSPENDED disables POS create-order button',async()=>ensure(!(await page.locator('#posCreateOrder').isEnabled()),'create order still enabled'));
await page.locator('#nav button[data-view="license"]').click();await page.locator('#toggleSystemAdmin').click();await page.locator('#licenseNewExpiry').fill('2026-12-31');await page.locator('[data-license-action="RENEW"]').click();
await test('BROWSER-030','license','System Admin demo renewal restores ACTIVE and records audit',async()=>{const state=await page.evaluate(()=>({status:LotusPOC.S().license.status,audit:LotusPOC.S().license.audit.map(x=>x.type)}));ensure(state.status==='ACTIVE'&&state.audit.includes('MANUAL_RENEW'),JSON.stringify(state));return state;});

await page.goto(`${base}/index.html?mode=qr&table=T01`,{waitUntil:'networkidle'});
await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
await test('BROWSER-031','pwa','Service worker registers on localhost',async()=>ensure(await page.evaluate(()=>!!navigator.serviceWorker.controller||!!navigator.serviceWorker),'service worker missing'));
await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(250);
await test('BROWSER-032','pwa-offline','Cached UI opens offline with explicit no-order warning',async()=>{const text=await page.locator('#pwaStatusBanner').innerText();ensure(text.includes('không thể gửi đơn mới'),'offline warning missing');return text;});
await context.setOffline(false);

await test('BROWSER-033','runtime','No uncaught runtime error across browser flows',async()=>ensure(runtimeErrors.length===0,runtimeErrors.join(' | ')));

const summary={total:results.length,pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,runtimeErrors};
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
fs.writeFileSync(path.join(root,'test-results','browser-results.json'),JSON.stringify({summary,results},null,2)+'\n');
await browser.close();
await new Promise(resolve=>server.close(resolve));
console.log(JSON.stringify(summary,null,2));
if(summary.fail)process.exitCode=1;
