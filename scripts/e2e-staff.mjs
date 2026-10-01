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
const failures=[];let server,browser;
const check=(ok,label)=>{console.log(`${ok?'PASS':'FAIL'}  ${label}`);if(!ok)failures.push(label)};

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
 if(native)await context.addInitScript(({filterSource})=>{
  const filter=new RegExp('^(?:'+filterSource+')$'),auth={user:null};window.__rejected=[];
  window.NativePOS={
   apiRequest(id,method,path,raw,token){
    const reply=(status,text)=>setTimeout(()=>window.LotusCloud&&window.LotusCloud.onApi(id,status,text),0);
    if(!filter.test(path)||path.includes('..')){window.__rejected.push(path);reply(0,'{"ok":false,"message":"Yêu cầu không hợp lệ"}');return}
    const body=raw&&!['GET','DELETE'].includes(method)?raw:undefined;
    fetch(path,{method,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json; charset=utf-8'}:{})},body})
     .then(async r=>{const text=await r.text();if(r.ok&&path==='/api/staff/login')auth.user=JSON.parse(text).staff;reply(r.status,text)})
     .catch(e=>reply(0,JSON.stringify({ok:false,code:'NETWORK_ERROR',message:'Không kết nối được Worker: '+e.message})));
   },
   getAuthState:()=>JSON.stringify(auth),getCloudBase:()=>location.origin,logout(){auth.user=null},
   getAppUpdateState:()=>'{"status":"IDLE"}',checkAppUpdate(){},installAppUpdate(){},getKitchenJobStatus:()=>'QUEUED',
   printKitchen(){},retryKitchen(){},getReceiptState:()=>'NEW',printReceipt:()=>'OK',reprintReceipt(){},printDailyReport(id,raw){(window.__printed=window.__printed||[]).push({id,text:JSON.parse(raw).text})},
   getPrinterStatus:()=>'{"state":1}',checkPrinter(){},reconnectPrinter(){},openKitchenSettings(){},openKitchenJobs(){},
   openDiagnostics(){},openCloudConnectivity(){},savePng(){},getAppInfo:()=>'{"native":true}'
  };
 },{filterSource});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined).catch(()=>{}));
 return {context,page,errors};
}
const text=page=>page.locator('#app').innerText();

try{
 await startWorker();
 browser=await chromium.launch(process.env.E2E_CHROMIUM?{executablePath:process.env.E2E_CHROMIUM}:{});

 // 1. Handheld (through the APK bridge): order → add items → pay cash
 const hand=await device({native:true}),hp=hand.page;
 await hp.goto(BASE+'/staff/');await hp.fill('input[name=username]','huang');await hp.fill('input[name=password]',PASSWORD);
 await hp.click('button:has-text("Đăng nhập")');await hp.waitForSelector('[data-screen="new"]');
 await hp.click('[data-screen="new"]');await hp.waitForSelector('[data-add]');
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

 // 2. Shift report: owner defines a shift, picks day + shift, views it and prints on SUNMI
 await hp.click('[data-screen="owner"]');await hp.locator('[data-screen="dashboard"]').first().click();await hp.waitForSelector('#report-shift');
 await hp.click('.shift-templates summary');await hp.click('[data-action=report-shift-add]');
 await hp.fill('[data-tpl-name="0"]','Ca cả ngày');await hp.fill('[data-tpl-start="0"]','00:00');await hp.fill('[data-tpl-end="0"]','23:59');
 await hp.click('[data-action=report-shifts-save]');
 await hp.waitForFunction(()=>[...document.querySelectorAll('#report-shift option')].some(o=>o.textContent.startsWith('Ca cả ngày')));
 const shiftKey=await hp.evaluate(()=>[...document.querySelectorAll('#report-shift option')].find(o=>o.textContent.startsWith('Ca cả ngày')).value);
 await hp.selectOption('#report-shift',shiftKey);await hp.click('[data-action=report-load]');
 await hp.waitForFunction(()=>!document.querySelector('[data-action=report-print]')?.disabled&&/Ca cả ngày/.test(document.querySelector('#app').innerText));
 check(/Ca cả ngày[\s\S]*00:00–23:59/.test(await text(hp)),'shift report shows the chosen shift');
 await hp.click('[data-action=report-print]');
 const printed=await hp.evaluate(()=>window.__printed||[]);
 check(printed.length===1&&printed[0].id.startsWith('shift-report:')&&/BÁO CÁO CA[\s\S]*Ca cả ngày[\s\S]*Tiền mặt \/ 现金: [1-9]/.test(printed[0].text),'shift report prints on SUNMI with the paid cash order');

 // 3. Customer QR order reaches the handheld through realtime sync
 await hp.click('[data-screen="orders"]');await hp.waitForTimeout(1000);
 const cust=await device({native:false}),cp=cust.page;
 await cp.goto(BASE+'/qr/');await cp.click('[data-pick=T08]');await cp.click('[data-action=confirm-table]');
 await cp.click('[data-add="110"]');await cp.click('[data-action=modal-save]');await cp.click('[data-view=cart]');
 const sent=Date.now();await cp.click('[data-action=submit]');
 await cp.waitForFunction(()=>/Đơn gọi món đã được ghi nhận/.test(document.body.innerText));
 try{await hp.waitForFunction(()=>/T08/.test(document.querySelector('#app').innerText),null,{timeout:10000});check(true,`QR order visible on the handheld after ${Date.now()-sent} ms`)}
 catch{check(false,'QR order visible on the handheld within 10 s')}

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
}catch(error){failures.push(error.message);console.error('FAIL  '+error.message)}
finally{
 await browser?.close();server?.kill('SIGTERM');rmSync(persist,{recursive:true,force:true});
}
if(failures.length){console.error(`\n${failures.length} E2E check(s) failed`);process.exitCode=1}else console.log('\nE2E OK');
