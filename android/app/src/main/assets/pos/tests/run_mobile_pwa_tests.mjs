import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium as playwrightChromium} from 'playwright';
import serverlessChromium from '@sparticuz/chromium';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const resultDir=path.join(root,'test-results');
const shotDir=path.join(resultDir,'mobile-audit');
fs.mkdirSync(shotDir,{recursive:true});
const results=[],runtimeErrors=[];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((request,response)=>{
  const parsed=new URL(request.url,'http://127.0.0.1');
  let relative=decodeURIComponent(parsed.pathname).replace(/^\/+/, '')||'index.html';
  let target=path.resolve(root,relative);
  if(!target.startsWith(root)){response.writeHead(403);response.end('Forbidden');return;}
  if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  if(!fs.existsSync(target)){response.writeHead(404);response.end('Not found');return;}
  response.writeHead(200,{'content-type':MIME[path.extname(target)]||'application/octet-stream','cache-control':'no-cache'});
  fs.createReadStream(target).pipe(response);
});
await new Promise(resolve=>server.listen(4176,'127.0.0.1',resolve));

function ensure(condition,message){if(!condition)throw new Error(message);return true;}
async function test(id,group,expected,fn){
  const timestamp=new Date().toISOString();
  try{const actual=await fn();results.push({id,group,expected,actual:typeof actual==='string'?actual:JSON.stringify(actual??'PASS'),status:'PASS',timestamp});}
  catch(error){results.push({id,group,expected,actual:error.message,status:'FAIL',timestamp,errorLog:error.stack||error.message});}
}
const executablePath=await serverlessChromium.executablePath();
const browser=await playwrightChromium.launch({executablePath,headless:true,args:[...serverlessChromium.args,'--no-sandbox','--disable-dev-shm-usage']});
const base='http://127.0.0.1:4176';
const commonMobile={
  viewport:{width:360,height:800},screen:{width:360,height:800},deviceScaleFactor:2,
  isMobile:true,hasTouch:true,
  userAgent:'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
};
const context=await browser.newContext({...commonMobile,locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh'});
const qr=await context.newPage();
qr.on('pageerror',error=>runtimeErrors.push(error.stack||error.message));
qr.on('console',message=>{if(message.type()==='error')runtimeErrors.push(message.text());});
await qr.goto(`${base}/qr/?table=T02`,{waitUntil:'networkidle'});
await qr.evaluate(()=>localStorage.clear());
await qr.goto(`${base}/qr/?table=T02`,{waitUntil:'networkidle'});
await qr.evaluate(()=>document.fonts.ready);

await test('MOBILE-QR-001','Android QR PWA','QR entry redirects to full-screen T02 customer UI with customer manifest',async()=>{const x=await qr.evaluate(()=>({table:LotusPOC.S().qr.table,manifest:document.querySelector('link[rel="manifest"]').getAttribute('href'),sidebar:getComputedStyle(document.querySelector('.sidebar')).display,overflow:document.documentElement.scrollWidth-innerWidth,touch:navigator.maxTouchPoints}));ensure(x.table==='T02'&&x.manifest.includes('customer.webmanifest')&&x.sidebar==='none'&&x.overflow<=1&&x.touch>0,JSON.stringify(x));return x;});
await test('MOBILE-QR-002','Android QR PWA','Customer bottom navigation has four usable tabs',async()=>{const labels=await qr.locator('#qrPhone .mobile-bottom-nav button').allTextContents();ensure(labels.length===4,labels.join('|'));return labels.join(' | ');});
await test('MOBILE-QR-003','Android QR PWA','Service worker reaches ready state on localhost',async()=>ensure(await qr.evaluate(async()=>{await navigator.serviceWorker.ready;return !!navigator.serviceWorker;}),'service worker not ready'));
await test('MOBILE-QR-BASELINE','Cross-device QR PWA','Common 360×800 baseline has no horizontal overflow and touch targets remain at least 44px',async()=>{const x=await qr.evaluate(()=>{const buttons=[...document.querySelectorAll('#qrPhone button')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;});return{viewport:String(innerWidth)+'x'+String(innerHeight),overflow:document.documentElement.scrollWidth-innerWidth,minButtonHeight:Math.min(...buttons.map(el=>el.getBoundingClientRect().height))};});ensure(x.viewport==='360x800'&&x.overflow<=1&&x.minButtonHeight>=44,JSON.stringify(x));return x;});
await qr.screenshot({path:path.join(shotDir,'01-qr-menu-common-360x800.png'),fullPage:true});

await qr.locator('[data-qradd="1"]').click();await qr.locator('#confirmModifier').click();await qr.locator('[data-qr-tab="cart"]').click();await qr.locator('#qrCheckout').click();
await test('MOBILE-QR-004','Android QR checkout','Member step shows login, registration and guest paths',async()=>ensure(await qr.locator('#qrCheckoutLogin').isVisible()&&await qr.locator('#qrCheckoutRegister').isVisible()&&await qr.locator('#qrGuestNext').isVisible(),'member step incomplete'));
await qr.locator('#qrGuestNext').click();await qr.locator('#qrVoucherNext').click();await qr.locator('[data-qr-payment="BANK"]').click();
const qrState=await qr.evaluate(()=>{const o=LotusPOC.S().orders.at(-1);return{code:o.code,total:o.total,status:o.status,paymentStatus:o.paymentStatus,request:o.paymentRequest};});
await test('MOBILE-QR-005','Android QR payment','Live OCB details and both machine-readable codes are visible',async()=>{const text=await qr.locator('.payment-qr-card').innerText();ensure(text.includes('609271')&&text.includes('HUANG TIANSHENG')&&await qr.locator('.payment-qr-box svg').isVisible()&&await qr.locator('.order-barcode-box svg').isVisible(),text);return `${qrState.code} · ${qrState.total}`;});
await test('MOBILE-QR-006','Android QR payment','VietQR payload contains OCB BIN, account, exact amount and order note with valid CRC',async()=>{const r=qrState.request;const valid=await qr.evaluate(payload=>LotusPOC.validPaymentCRC(payload),r.payload);ensure(valid&&r.bank.bankBin==='970448'&&r.bank.accountNumber==='609271'&&r.bank.accountName==='HUANG TIANSHENG'&&r.amount===qrState.total&&r.payload.includes('609271')&&r.content.includes(qrState.code),'payment payload mismatch');return{amount:r.amount,content:r.content,account:r.bank.accountNumber,crc:valid};});
await test('MOBILE-QR-007','Android QR payment','OCB deeplink matches recipient, amount, name and note',async()=>{const raw=await qr.locator('[data-payment-action="ocb"]').getAttribute('data-ocb-url'),url=new URL(raw);ensure(url.hostname==='dl.vietqr.io'&&url.searchParams.get('app')==='ocb'&&url.searchParams.get('ba')==='609271@ocb'&&url.searchParams.get('am')===String(qrState.total)&&url.searchParams.get('tn')===qrState.request.content&&url.searchParams.get('bn')==='HUANG TIANSHENG',raw);return raw;});
await test('MOBILE-QR-008','Android QR payment','Four fallback actions remain visible',async()=>ensure(await qr.locator('.payment-fallbacks button').count()===4,'fallback actions missing'));
await qr.screenshot({path:path.join(shotDir,'02-qr-ocb-payment-common-360x800.png'),fullPage:true});

let attemptedUrl='';
const handoff=await context.newPage();
await handoff.goto(`${base}/index.html?mode=qr&table=T02`,{waitUntil:'networkidle'});
await handoff.route('https://dl.vietqr.io/**',route=>{attemptedUrl=route.request().url();return route.abort('blockedbyclient');});
handoff.once('dialog',dialog=>dialog.accept());
await handoff.locator('[data-payment-action="ocb"]').click({noWaitAfter:true}).catch(()=>{});
await handoff.waitForTimeout(250);
await handoff.close();
const handoffVerifier=await context.newPage();await handoffVerifier.goto(`${base}/index.html?mode=qr&table=T02`,{waitUntil:'networkidle'});
await test('MOBILE-QR-009','Android OCB handoff','Accepted confirmation attempts the exact external OCB deeplink and does not mark PAID',async()=>{const state=await handoffVerifier.evaluate(()=>{const o=LotusPOC.S().orders.at(-1);return{status:o.status,paymentStatus:o.paymentStatus,receipts:LotusPOC.S().receipts.filter(r=>r.orderId===o.id).length,openedAt:o.paymentRequest.deeplinkOpenedAt};});ensure(attemptedUrl.includes('dl.vietqr.io/pay')&&state.openedAt&&state.status!=='PAID'&&state.paymentStatus==='PENDING'&&state.receipts===0,JSON.stringify({attemptedUrl,state}));return attemptedUrl;});
await handoffVerifier.close();
await qr.locator('[data-payment-action="reported"]').click();
await test('MOBILE-QR-010','Android QR payment','Customer report remains CUSTOMER_REPORTED with no receipt or loyalty side effect',async()=>{const state=await qr.evaluate(()=>{const o=LotusPOC.S().orders.at(-1);return{status:o.status,paymentStatus:o.paymentStatus,receipts:LotusPOC.S().receipts.filter(r=>r.orderId===o.id).length,loyalty:LotusPOC.S().loyaltyTx.filter(x=>x.orderCode===o.code).length};});ensure(state.status!=='PAID'&&state.paymentStatus==='CUSTOMER_REPORTED'&&state.receipts===0&&state.loyalty===0,JSON.stringify(state));return state;});
await qr.screenshot({path:path.join(shotDir,'03-qr-customer-reported-common-360x800.png'),fullPage:true});

const staff=await context.newPage();
staff.on('pageerror',error=>runtimeErrors.push(error.stack||error.message));
staff.on('console',message=>{if(message.type()==='error')runtimeErrors.push(message.text());});
await staff.goto(`${base}/staff/`,{waitUntil:'networkidle'});await staff.evaluate(()=>document.fonts.ready);
await test('MOBILE-STAFF-001','Android Staff PWA','Staff entry uses Staff manifest and removes desktop/mock-phone chrome',async()=>{const x=await staff.evaluate(()=>({manifest:document.querySelector('link[rel="manifest"]').getAttribute('href'),sidebar:getComputedStyle(document.querySelector('.sidebar')).display,border:getComputedStyle(document.querySelector('.iphone')).borderTopWidth,radius:getComputedStyle(document.querySelector('.iphone')).borderRadius,overflow:document.documentElement.scrollWidth-innerWidth,touch:navigator.maxTouchPoints}));ensure(x.manifest.includes('staff.webmanifest')&&x.sidebar==='none'&&x.border==='0px'&&x.radius==='0px'&&x.overflow<=1&&x.touch>0,JSON.stringify(x));return x;});
await staff.screenshot({path:path.join(shotDir,'04-staff-login-common-360x800.png'),fullPage:true});
await staff.locator('#mLoginStaff').selectOption('2');await staff.locator('#mPin').fill('2222');await staff.locator('#mLogin').click();
await test('MOBILE-STAFF-002','Android Staff PWA','Login succeeds and four Staff tabs are present',async()=>{const labels=await staff.locator('#mobileScreen .mobile-bottom-nav button').allTextContents();ensure(labels.length===4&&labels.some(x=>x.includes('Bán hàng'))&&labels.some(x=>x.includes('Đơn hàng'))&&labels.some(x=>x.includes('Bàn'))&&labels.some(x=>x.includes('Cá nhân')),labels.join('|'));return labels.join(' | ');});
await staff.screenshot({path:path.join(shotDir,'05-staff-menu-common-360x800.png'),fullPage:true});
await staff.locator('[data-madd="2"]').click();await staff.locator('#confirmModifier').click();await staff.locator('#mStartCheckout').click();
await test('MOBILE-STAFF-003','Android Staff checkout','Member phone lookup, registration and guest checkout are all available',async()=>ensure(await staff.locator('#mMemberPhone').isVisible()&&await staff.locator('#mRegisterMember').isVisible()&&await staff.locator('#mGuestCheckout').isVisible(),'member controls missing'));
await staff.locator('#mGuestCheckout').click();await staff.locator('#mVoucherNext').click();await staff.locator('[data-m-payment="BANK"]').click();
const staffState=await staff.evaluate(()=>{const o=LotusPOC.S().orders.at(-1);return{code:o.code,total:o.total,status:o.status,paymentStatus:o.paymentStatus,request:o.paymentRequest};});
await test('MOBILE-STAFF-004','Android Staff payment','Staff bank screen uses exact OCB account and requires manual funds confirmation',async()=>{const scope=staff.locator('#mobileScreen'),text=await scope.locator('.payment-qr-card').innerText(),raw=await scope.locator('[data-payment-action="ocb"]').getAttribute('data-ocb-url'),url=new URL(raw);ensure(text.includes('609271')&&text.includes('HUANG TIANSHENG')&&url.searchParams.get('am')===String(staffState.total)&&await scope.locator('[data-payment-action="confirm-staff"]').isVisible(),'staff OCB screen mismatch');return{code:staffState.code,total:staffState.total};});
await staff.screenshot({path:path.join(shotDir,'06-staff-ocb-payment-common-360x800.png'),fullPage:true});
staff.once('dialog',dialog=>dialog.accept());await staff.locator('[data-payment-action="confirm-staff"]').click();
await test('MOBILE-STAFF-005','Android Staff payment','Manual funds confirmation settles once and creates one receipt',async()=>{const state=await staff.evaluate(()=>{const o=LotusPOC.S().orders.at(-1);return{status:o.status,paymentStatus:o.paymentStatus,receipts:LotusPOC.S().receipts.filter(r=>r.orderId===o.id).length};});ensure(state.status==='PAID'&&state.paymentStatus==='PAID'&&state.receipts===1,JSON.stringify(state));return state;});
await staff.screenshot({path:path.join(shotDir,'07-staff-paid-common-360x800.png'),fullPage:true});

for(const [deviceName,viewport] of [['Compact 320',{width:320,height:568}],['Medium 390',{width:390,height:844}],['Large 430',{width:430,height:932}]]){
  const page=await context.newPage();await page.setViewportSize(viewport);
  await page.goto(`${base}/index.html?mode=qr&table=T01`,{waitUntil:'networkidle'});
  await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'networkidle'});
  await test(`MOBILE-SMOKE-${deviceName.replace(/\W/g,'').toUpperCase()}`,'Android responsive',`${deviceName} QR menu has no horizontal overflow or clipped bottom navigation`,async()=>{const x=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,tabs:document.querySelectorAll('#qrPhone .mobile-bottom-nav button').length,navRect:document.querySelector('#qrPhone .mobile-bottom-nav').getBoundingClientRect().toJSON()}));ensure(x.scrollWidth<=x.width+1&&x.tabs===4&&x.navRect.width<=x.width+1,JSON.stringify(x));return x;});
  await page.goto(`${base}/index.html?mode=staff`,{waitUntil:'networkidle'});
  await test(`MOBILE-STAFF-SMOKE-${deviceName.replace(/\W/g,'').toUpperCase()}`,'Android responsive',`${deviceName} Staff login has no horizontal overflow`,async()=>{const x=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,sidebar:getComputedStyle(document.querySelector('.sidebar')).display}));ensure(x.scrollWidth<=x.width+1&&x.sidebar==='none',JSON.stringify(x));return x;});
  await page.close();
}

await test('MOBILE-RUNTIME','Android runtime','No uncaught errors across Android PWA flows',async()=>ensure(runtimeErrors.length===0,runtimeErrors.join(' | ')));
const summary={total:results.length,pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,runtimeErrors,baseline:'360x800 CSS px',viewports:['320x568','360x800','390x844','430x932']};
fs.writeFileSync(path.join(resultDir,'mobile-pwa-results.json'),JSON.stringify({summary,results},null,2)+'\n');
await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
console.log(JSON.stringify(summary,null,2));if(summary.fail)process.exitCode=1;
