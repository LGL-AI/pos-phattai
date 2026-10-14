// PT-50: a read made after a write must not join an identical read started before it (stale answer:
// a shift saved right after opening the dashboard did not appear until a refresh; flaky E2E 14/10/2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
const ANDROID=readFileSync(new URL('../android/app/src/main/assets/staff/staff.js',import.meta.url),'utf8');

function harness(){
 const start=STAFF.indexOf('const apiReads=new Map();'),end=STAFF.indexOf('\nfunction connection()',start);
 let saved='old';const calls=[];const held=[];
 const context={st:{token:'token',online:true},native:null,connection(){},bilingualText:x=>x,AbortSignal,setTimeout,
  fetch:(path,o)=>{calls.push((o?.method||'GET')+' '+path);
   if((o?.method||'GET')!=='GET'){saved=JSON.parse(o.body).value;return Promise.resolve({status:200,text:async()=>JSON.stringify({ok:true})})}
   const answer=saved;// the server answers with what it had when the read arrived
   return new Promise(resolve=>held.push(()=>resolve({status:200,text:async()=>JSON.stringify({ok:true,value:answer})})))}};
 vm.runInNewContext(STAFF.slice(start,end)+';globalThis.api=api;globalThis.apiReads=apiReads',context);
 return {context,calls,release:()=>{while(held.length)held.shift()()}};
}

test('API a read after a write starts its own request instead of joining an older one',async()=>{
 const {context,calls,release}=harness();
 const before=context.api('GET','/api/staff/report-shifts');           // dashboard opening, still in flight
 await context.api('PUT','/api/staff/report-shifts',{value:'new'});      // owner saves a shift
 const after=context.api('GET','/api/staff/report-shifts');            // reload after the save
 release();
 assert.equal((await before).value,'old');
 assert.equal((await after).value,'new');
 assert.deepEqual(calls,['GET /api/staff/report-shifts','PUT /api/staff/report-shifts','GET /api/staff/report-shifts']);
});

test('API identical reads with no write in between still share one request',async()=>{
 const {context,calls,release}=harness();
 const a=context.api('GET','/api/staff/sync-meta'),b=context.api('GET','/api/staff/sync-meta');
 release();await Promise.all([a,b]);
 assert.equal(calls.length,1);
});

test('API an old read finishing late does not drop the newer shared read',async()=>{
 const {context,calls,release}=harness();
 const old=context.api('GET','/api/staff/orders');
 await context.api('POST','/api/staff/x',{value:'v'});
 const fresh=context.api('GET','/api/staff/orders');
 release();await old;
 const joined=context.api('GET','/api/staff/orders');                   // fresh may still be shared until it settles
 release();await Promise.all([fresh,joined]);
 assert.ok(calls.filter(x=>x.startsWith('GET')).length<=3);
 assert.equal(context.apiReads.size,0,'nothing left in the shared-read map');
});

test('APK bundle carries the same read-after-write rule',()=>{
 assert.match(STAFF,/if\(method!=='GET'\)\{apiReads\.clear\(\);return apiRequest\(method,path,data\)\.finally\(\(\)=>apiReads\.clear\(\)\)\}/);
 assert.equal(ANDROID,STAFF);
});
