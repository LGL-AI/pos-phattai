import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {currentFixture} from './helpers/current-fixture.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const STAFF=read('public/staff/staff.js'),QR=read('public/assets/app.js');
const VERSION=JSON.parse(read('package.json')).version;

test('STRIP the menu endpoints tell every client the Worker version and server time',async()=>{
 const f=currentFixture();
 try{
  for(const path of ['/api/catalog/meta','/api/catalog']){
   const {status,data}=await f.call(path);
   assert.equal(status,200);assert.equal(data.workerVersion,VERSION,path);
   assert.ok(Math.abs(data.serverTime-Date.now())<5000,path+' serverTime');
   assert.ok(data.revision!==undefined);
  }
 }finally{f.db.close?.()}
});

test('STRIP the strip is in the staff, counter and customer pages and survives re-render',()=>{
 assert.match(read('public/staff/index.html'),/<header>.*<small id="diag"[^>]*><\/small><\/header>/);
 assert.match(read('public/counter/index.html'),/<header>.*<small id="diag"[^>]*><\/small><\/header>/);
 assert.match(read('public/qr/index.html'),/<div id="build-tag"[^>]*><\/div><div id="app"/);
 assert.match(STAFF,/function connection\(\)\{[^\n]*diag\(\)\}\n/,'every API answer or failure refreshes the strip');
 assert.match(QR,/finally\{catalogRefreshing=false;buildTag\(\)\}/,'every menu refresh updates the customer strip');
 assert.equal(readFileSync(new URL('../android/app/src/main/assets/staff/staff.js',import.meta.url),'utf8'),STAFF,'APK ships the same UI');
});

// Run the real diag()/buildTag() source against a stub element.
function staffStrip(st,native=null){
 const start=STAFF.indexOf('const clockSec='),end=STAFF.indexOf('try{st.appInfo=');
 const el={textContent:'',classList:{on:false,toggle(name,value){if(name==='diag-warn')this.on=!!value}}};
 const run=()=>{vm.runInNewContext(STAFF.slice(start,end)+';diag()',{st,native,$:()=>el,Intl,Date})};
 return {el,run};
}
test('STRIP the staff strip shows APK, Server, Menu, realtime, sync and clock',()=>{
 const now=Date.UTC(2026,9,2,5,28,41); // 12:28:41 in Vietnam
 const st={token:'t',online:true,realtimeState:'ONLINE',workerVersion:'2.11.2-phattai.1',menuRev:'47',lastOkAt:now,skew:0,
  appInfo:{version:'1.7.18',versionCode:1018,signerSha256:'e66d9870204bcfef827e3b3ef2d601fb83160a4927619e1354411bc6b7f484b4'}};
 const {el,run}=staffStrip(st,{});
 const realNow=Date.now;Date.now=()=>now;
 try{run()}finally{Date.now=realNow}
 assert.equal(el.textContent,'APK 1.7.18 (1018) · Server 2.11.2-phattai.1 · Menu r47 · RT ✓ · sync 12:28:41 · giờ 12:28');
 assert.equal(el.classList.on,false,'healthy device is not highlighted');
});
test('STRIP the staff strip warns on a stale realtime link, a wrong device clock or a pending update',()=>{
 const base={token:'t',online:true,realtimeState:'ONLINE',workerVersion:'2.11.2',menuRev:'1',lastOkAt:Date.now(),skew:0,appInfo:{version:'1.7.18',versionCode:1018}};
 const cases=[
  [{realtimeState:'OFFLINE'},/RT ✗/],
  [{skew:5*60*1000},/⚠ máy lệch \+5p/],
  [{skew:-20*1000},null],
  [{appInfo:{version:'1.7.18',versionCode:1018,available:true,releaseVersion:'1.7.19'}},/⬆ có bản 1.7.19/],
  [{lastOkAt:Date.now()-200000},/sync/],
  [{appInfo:{version:'1.7.18',versionCode:1018,status:'UNSUPPORTED_IDENTITY',signerSha256:'abcdef0123'}},/⚠ sai khóa ký abcdef/],
 ];
 for(const [patch,expect] of cases){
  const st={...base,...patch},{el,run}=staffStrip(st,{});run();
  if(expect)assert.match(el.textContent,expect);
  const shouldWarn=patch.skew===-20000?false:true;
  assert.equal(el.classList.on,shouldWarn,JSON.stringify(patch));
 }
});
test('STRIP the staff strip is quiet before login and labels a plain browser as the counter web',()=>{
 const {el,run}=staffStrip({token:null,online:false},null);run();
 assert.match(el.textContent,/^Web quầy · Server — · Menu — · RT — · sync — · giờ \d\d:\d\d$/);
 assert.equal(el.classList.on,false,'logged-out screen is not a warning');
 const old=staffStrip({token:null,online:false},{});old.run();
 assert.match(old.el.textContent,/^APK cũ /,'an APK without the updater is called out');
});
test('STRIP the staff strip records the server facts from every good answer only',()=>{
 const start=STAFF.indexOf('const apiReads=new Map();'),end=STAFF.indexOf('\nfunction connection()',start);
 const answer=(status,body)=>{
  const st={token:'t',online:false};
  return vm.runInNewContext(STAFF.slice(start,end)+";apiRequest('GET','/api/catalog/meta').catch(()=>{});",
   {st,native:null,connection(){},AbortSignal,fetch:async()=>({status,text:async()=>JSON.stringify(body)})}).then(()=>st);
 };
 return Promise.all([
  answer(200,{ok:true,revision:'9',workerVersion:'2.11.2',serverTime:Date.now()-90000}),
  answer(503,{ok:false,code:'DOWN',workerVersion:'9.9.9'}),
 ]).then(([good,bad])=>{
  assert.equal(good.workerVersion,'2.11.2');assert.equal(good.menuRev,'9');
  assert.ok(good.skew>=89000&&good.skew<95000,'device is 90s ahead of the server');
  assert.ok(good.lastOkAt>0);
  assert.equal(bad.workerVersion,undefined);assert.equal(bad.lastOkAt,undefined,'an error answer is not a sync');
 });
});

function customerStrip(state){
 const start=QR.indexOf('const tagSec='),end=QR.indexOf('async function refreshHealth(');
 const el={textContent:'',classList:{on:false,toggle(name,value){if(name==='warn')this.on=!!value}}};
 vm.runInNewContext(QR.slice(start,end)+';buildTag()',{state,document:{getElementById:()=>el},Intl,Date});
 return el;
}
test('STRIP the customer strip shows server, menu, network, table and goes red when offline',()=>{
 const now=Date.now(),on=customerStrip({workerVersion:'2.11.2',menuRev:'47',serverOnline:true,table:'T05',lastOkAt:now,skew:0});
 assert.match(on.textContent,/^Server 2\.11\.2 · Menu r47 · Mạng ✓ · bàn T05 · sync \d\d:\d\d:\d\d$/);
 assert.equal(on.classList.on,false);
 const off=customerStrip({workerVersion:'',menuRev:'',serverOnline:false,table:'',lastOkAt:0,skew:0});
 assert.match(off.textContent,/^Server — · Menu — · Mạng ✗ · sync —$/);
 assert.equal(off.classList.on,true);
 assert.match(customerStrip({workerVersion:'x',menuRev:'1',serverOnline:true,lastOkAt:now,skew:-3*60*1000}).textContent,/⚠ máy lệch -3p/);
});
test('STRIP the customer page pins the strip to the top and moves the app below it',()=>{
 const css=read('public/assets/app.css');
 assert.match(css,/#build-tag\{position:fixed;top:0;left:0;right:0;z-index:90;height:16px/);
 assert.match(css,/\.head\{top:16px\}\.app\{margin-top:16px;min-height:calc\(100vh - 16px\);min-height:calc\(100dvh - 16px\)\}/);
 assert.match(read('public/staff/staff.css'),/#diag\{flex:0 0 100%/);
});

test('FLAKE a fading notice removes only the notice: it must not re-render and wipe typed fields',()=>{
 const start=STAFF.indexOf('function message(s){'),end=STAFF.indexOf('\n',start);
 const run=(change)=>{
  let renders=0,removed=false,timer=null;
  const notice={classList:{contains:name=>name==='notice'||name==='warn'},remove(){removed=true}};
  const st={error:''};
  vm.runInNewContext(STAFF.slice(start,end)+';message("Số điện thoại đã có tài khoản");'+(change?'st.error="khác";':''),
   {st,app:{firstElementChild:notice},bilingualText:x=>x,render(){renders++},window:{setTimeout:fn=>{timer=fn}}});
  assert.equal(renders,1,'showing the notice renders once');
  timer();
  return {renders,removed,error:st.error};
 };
 assert.deepEqual(run(false),{renders:1,removed:true,error:''});
 assert.deepEqual(run(true),{renders:1,removed:false,error:'khác'},'a newer message is not removed by an older timer');
 assert.ok(!/st\.error='';render\(\)/.test(STAFF),'no timer may clear the notice with a full render');
});

test('STRIP the staff warning colour is its own class: the generic .warn box made it unreadable on the device',()=>{
 const css=read('public/staff/staff.css');
 assert.match(css,/#diag\.diag-warn\{color:#ffd9a0\}/);
 assert.doesNotMatch(STAFF,/classList\.toggle\('warn'/);
});
