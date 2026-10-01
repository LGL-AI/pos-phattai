import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {extname,join,normalize} from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {applyCurrentSchema} from './helpers/schema.mjs';
import worker from '../src/worker.js';

const ROOT=new URL('../public/',import.meta.url).pathname;
function makeFixture(){
 const db=new DatabaseSync(':memory:'); applyCurrentSchema(db); db.exec('UPDATE pos_product_inventory SET stock=100; UPDATE pos_ingredients SET stock=100000;');
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},_run(){return db.prepare(sql).run(...args)}}},async batch(stmts){db.exec('BEGIN');try{const out=stmts.map(s=>s._run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,ASSETS:{fetch:async()=>new Response('not found',{status:404})},ORDERING_ENABLED:'true',ALLOW_UNVERIFIED_MEMBER_VOUCHERS:'true',SESSION_SECRET:'browser-smoke-secret-012345678901234567890',POS_STAFF_PASSWORD:'phattai-test-password'};
 return {db,env};
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
function staticPath(path){if(path==='/'||path==='/index.html')return join(ROOT,'index.html');if(path==='/qr'||path==='/qr/')return join(ROOT,'qr/index.html');if(path==='/staff'||path==='/staff/')return join(ROOT,'staff/index.html');if(path==='/counter'||path==='/counter/')return join(ROOT,'counter/index.html');if(path==='/display'||path==='/display/')return join(ROOT,'display/index.html');const cleaned=normalize(path).replace(/^([/\\])+/, '');const f=join(ROOT,cleaned);return f.startsWith(ROOT)?f:null;}
async function startServer(fx){
 const server=http.createServer(async(req,res)=>{try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname.startsWith('/api/')){
    const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(', '):String(v));
    const host=`http://${req.headers.host}`;const request=new Request(host+url.pathname+url.search,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body});
    const response=await worker.fetch(request,fx.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   const f=staticPath(url.pathname);if(!f||!existsSync(f)){res.writeHead(404);res.end('not found');return}res.writeHead(200,{'Content-Type':mime[extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(readFileSync(f));
  }catch(e){res.writeHead(500,{'Content-Type':'text/plain'});res.end(String(e.stack||e))}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return server;
}
async function api(base,path,method='GET',body=null,headers={}){const h={'Origin':base,...headers};if(body!==null)h['Content-Type']='application/json';const r=await fetch(base+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
class CDP{
 constructor(ws){this.ws=new WebSocket(ws);this.id=1;this.pending=new Map();this.exceptions=[];this.logs=[];this.ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}}else{if(m.method==='Runtime.exceptionThrown')this.exceptions.push(m.params.exceptionDetails?.text+': '+(m.params.exceptionDetails?.exception?.description||''));if(m.method==='Log.entryAdded'&&m.params.entry?.level==='error')this.logs.push(m.params.entry.text)}}}
 async ready(){await new Promise((r,j)=>{this.ws.onopen=r;this.ws.onerror=j});await this.send('Runtime.enable');await this.send('Page.enable');await this.send('Log.enable')}
 send(method,params={}){return new Promise((resolve,reject)=>{const id=this.id++;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}))})}
 async eval(expr){const r=await this.send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+(r.exceptionDetails.exception?.description||''));return r.result?.value}
 async navigate(url){await this.send('Page.navigate',{url});await this.wait(`document.readyState==='complete'`,8000)}
 async wait(expr,timeout=8000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{last=await this.eval(expr);if(last)return last}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('wait timeout: '+expr+' last='+last)}
 close(){this.ws.close()}
}
async function openChrome(url){
 const port=9339,profile='/tmp/phattai-browser-smoke-'+process.pid;const proc=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--host-resolver-rules=MAP phattai.test 127.0.0.1',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,url],{stdio:['ignore','pipe','pipe']});
 const end=Date.now()+8000;let pages;while(Date.now()<end){try{pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages?.some(p=>p.type==='page'&&p.webSocketDebuggerUrl))break}catch{}await new Promise(r=>setTimeout(r,100))}const target=pages?.find(p=>p.type==='page'&&p.url===url)||pages?.find(p=>p.type==='page');if(!target)throw Error('chromium did not start: '+JSON.stringify(pages));const cdp=new CDP(target.webSocketDebuggerUrl);await cdp.ready();return {proc,cdp};
}
const fx=makeFixture();const server=await startServer(fx);const base=`http://127.0.0.1:${server.address().port}`;const browserBase=`http://phattai.test:${server.address().port}`;
// Seed one real QR order for staff payment smoke.
const seeded=await api(base,'/api/orders','POST',{table:'T09',idempotencyKey:'browser_smoke_order_1234567890',items:[{productId:'110',qty:1,mods:{size:'中',spice:'中',note:'browser smoke'}}],note:''});if(seeded.status!==201)throw Error('seed order failed '+JSON.stringify(seeded));
const {proc,cdp}=await openChrome(browserBase+'/staff/');
const checks=[];const pass=(name,value)=>{if(!value)throw Error('FAIL '+name);checks.push(name)};
try{
 console.log('INIT',await cdp.eval(`({href:location.href,ready:document.readyState,text:document.body?.innerText?.slice(0,300),html:document.documentElement?.outerHTML?.slice(0,500)})`));
 await cdp.wait(`document.querySelector('#login')`);
 await cdp.eval(`(()=>{document.querySelector('#login input[name=username]').value='huang';document.querySelector('#login input[name=password]').value='phattai-test-password';document.querySelector('#login').requestSubmit();return true})()`);
 await cdp.wait(`document.body.innerText.includes('Đơn hàng')||document.body.innerText.includes('订单')`,10000);pass('staff login/render',true);
 pass('staff no refundForm error',!(await cdp.eval(`document.body.innerText.includes('refundForm is not defined')`)));
 // Owner hub render/navigation.
 await cdp.eval(`document.querySelector('button[data-screen="owner"]')?.click();true`);await cdp.wait(`document.body.innerText.includes('Quản trị chủ tiệm')&&document.body.innerText.includes('店主管理')`);pass('owner hub opens',true);
 await cdp.eval(`document.querySelector('button[data-screen="dashboard"]')?.click();true`);await cdp.wait(`document.body.innerText.includes('Báo cáo ngày')`);pass('daily report screen opens',true);
 await cdp.eval(`document.querySelector('button[data-screen="orders"]')?.click();true`);await cdp.wait(`document.querySelector('[data-open="${seeded.data.order.id}"]')`);await cdp.eval(`document.querySelector('[data-open="${seeded.data.order.id}"]').click();true`);await cdp.wait(`document.body.innerText.includes('T09')&&document.querySelector('[data-start-pay]')`);pass('order detail opens',true);
 await cdp.eval(`window.confirm=()=>true;window.prompt=(t,d)=>d||'';document.querySelector('[data-start-pay]').click();true`);await cdp.wait(`document.querySelector('[data-choose-pay="BANK"]')`);await cdp.eval(`document.querySelector('[data-choose-pay="BANK"]').click();true`);await cdp.wait(`document.querySelector('[data-method="BANK"]')`);await cdp.eval(`document.querySelector('[data-method="BANK"]').click();true`);await cdp.wait(`document.body.innerText.includes('PAID')||document.body.innerText.includes('Đã thanh toán')`,10000);pass('bank payment UI returns without stuck',true);
 pass('payment screen no undefined error',!(await cdp.eval(`/not defined|undefined is not a function/i.test(document.body.innerText)`)));
 // Shift screen opens after previous async actions.
 await cdp.eval(`document.querySelector('button[data-screen="shifts"]')?.click();true`);await cdp.wait(`document.body.innerText.includes('Chấm công')||document.body.innerText.includes('考勤')`);pass('shift screen opens after payment',true);
 // QR customer flow in same browser; clear local storage to force table picker.
 await cdp.navigate(browserBase+'/qr/');await cdp.eval(`localStorage.clear();location.reload();true`);await cdp.wait(`document.querySelector('[data-pick="T03"]')`,10000);await cdp.eval(`document.querySelector('[data-pick="T03"]').click();document.querySelector('[data-action="confirm-table"]').click();true`);await cdp.wait(`document.querySelector('[data-add="101"]')`);pass('QR table selection works',true);
 await cdp.eval(`document.querySelector('[data-add="101"]').click();true`);await cdp.wait(`document.querySelector('.sheet [data-action="modal-save"]')`);pass('QR modifier modal opens',true);
 await cdp.eval(`document.querySelector('[data-opt="size"][data-val="大"]')?.click();document.querySelector('[data-opt="spice"][data-val="小"]')?.click();const n=document.querySelector('#item-note');if(n)n.value='少辣 / ít cay';document.querySelector('[data-action="modal-save"]').click();true`);await cdp.wait(`document.querySelector('[data-view="cart"]')`);await cdp.eval(`document.querySelector('[data-view="cart"]').click();true`);await cdp.wait(`document.querySelector('[data-action="submit"]')`);pass('QR cart render after modifier save',true);
 await cdp.eval(`document.querySelector('[data-action="submit"]').click();true`);await cdp.wait(`document.body.innerText.includes('已记录')||document.body.innerText.includes('Đã ghi nhận')||document.querySelector('.result-code')`,10000);pass('QR order submit returns without stuck',true);
 pass('QR bilingual Chinese visible',await cdp.eval(`/[\u3400-\u9fff]/.test(document.body.innerText)`));
 pass('no runtime exceptions',cdp.exceptions.length===0);
 pass('no console errors',cdp.logs.length===0);
 console.log(JSON.stringify({ok:true,checks,exceptions:cdp.exceptions,logs:cdp.logs},null,2));
}catch(e){console.error(JSON.stringify({ok:false,error:String(e.stack||e),checks,exceptions:cdp.exceptions,logs:cdp.logs},null,2));process.exitCode=1}
finally{cdp.close();proc.kill('SIGKILL');server.close();fx.db.close()}
