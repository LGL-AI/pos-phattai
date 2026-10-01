import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import published from '../src/android-releases.json' with {type:'json'};
import {selectAndroidRelease} from '../src/android-update.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temp=mkdtempSync(resolve(root,'.runtime-smoke-'));
let mf;
try{
 await build({entryPoints:[resolve(root,'src/worker.js')],outfile:resolve(temp,'worker.mjs'),bundle:true,format:'esm',platform:'neutral'});
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:resolve(temp,'worker.mjs'),compatibilityDate:'2026-09-23',d1Databases:{DB:'pos-test'},durableObjects:{REALTIME:{className:'RealtimeHub',useSQLite:true}},bindings:{ORDERING_ENABLED:'true',SESSION_SECRET:'runtime-test-only-012345678901234567890123456789',POS_STAFF_PASSWORD:'runtime-test-only'},serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;return published.releases.some(release=>release.path===path)?new Response(readFileSync(resolve(root,'public','.'+path)),{headers:{'Content-Type':'application/vnd.android.package-archive'}}):new Response('not found',{status:404})}}}));
 const db=await mf.getD1Database('DB');
 await db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT);');
 for(const name of readdirSync(resolve(root,'migrations')).filter(name=>name.endsWith('.sql')).sort()){
  // Keep each complete file on one line for D1.exec's statement-per-line API.
  const sql=readFileSync(resolve(root,'migrations',name),'utf8').replace(/--[^\n]*/g,'').replaceAll('\n',' ');
  await db.exec(sql);await db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(name).run();
 }
 const token='runtime-test-staff-session-token-012345678901234567890123456',hash=createHash('sha256').update(token).digest('hex');
 await db.prepare('INSERT INTO pos_staff_sessions(token_hash,expires_at,staff_id) VALUES(?,?,NULL)').bind(hash,Date.now()+3600000).run();
 const call=async(path,body=null)=>{const r=await mf.dispatchFetch('https://pos.test'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 const health=await call('/api/health');assert.equal(health.data.acceptingOrders,true);
 const identity=JSON.parse(readFileSync(resolve(root,'android/app-identity.json'),'utf8'));
 const updateQuery=new URLSearchParams({applicationId:identity.productionApplicationId,signerSha256:identity.profiles[identity.productionApplicationId].signerSha256,versionCode:'162',sdk:'30'});
 const update=await call('/api/android/update?'+updateQuery),expectedUpdate=selectAndroidRelease(updateQuery,published);
 assert.equal(update.status,200);assert.equal(update.data.status,expectedUpdate.status);assert.equal(update.data.available,expectedUpdate.available);
 if(update.data.available){const apk=await mf.dispatchFetch('https://pos.test'+update.data.release.path);assert.equal(apk.status,200);assert.equal(createHash('sha256').update(Buffer.from(await apk.arrayBuffer())).digest('hex'),update.data.release.sha256);}
 const order=await call('/api/staff/orders',{table:'T01',items:[{productId:'101',qty:1,mods:{size:'中',spice:'中',note:''}}],idempotencyKey:crypto.randomUUID()});assert.equal(order.status,201);
 const append={version:order.data.order.version,items:[{productId:'101',qty:1,mods:{size:'中',spice:'中',note:''}}],idempotencyKey:crypto.randomUUID()},path='/api/staff/orders/'+order.data.order.id+'/append';
 assert.equal((await call(path,append)).status,200);assert.equal((await call(path,append)).status,200);
 const detail=await call('/api/staff/orders/'+order.data.order.id);assert.equal(detail.data.order.items.reduce((n,x)=>n+x.qty,0),2);assert.equal(detail.data.jobs.length,2);
 const rejectedKey=crypto.randomUUID();
 let rolledBack=false;
 try{await db.batch([
  db.prepare('INSERT INTO pos_order_append_requests(request_key,order_id,fingerprint,actor_id,base_version,created_at) VALUES(?,?,?,?,?,?)').bind(rejectedKey,order.data.order.id,'qa-fingerprint','OWNER',-1,new Date().toISOString()),
  db.prepare('UPDATE qr_orders SET version=version+1 WHERE id=? AND version=-1').bind(order.data.order.id),
  db.prepare('UPDATE pos_order_append_requests SET applied_version=CASE WHEN changes()=1 THEN ? ELSE NULL END WHERE request_key=?').bind(0,rejectedKey)
 ])}catch(e){rolledBack=/APPEND_CONFLICT/.test(e.message)}
 assert.equal(rolledBack,true);assert.equal(await db.prepare('SELECT request_key FROM pos_order_append_requests WHERE request_key=?').bind(rejectedKey).first(),null);
 const queue=(await call('/api/staff/paid-labels')).data;assert.equal((await call('/api/staff/paid-labels?revision='+encodeURIComponent(queue.revision))).data.unchanged,true);
 const upgrade=await mf.dispatchFetch('https://pos.test/api/realtime',{headers:{Upgrade:'websocket','Sec-WebSocket-Protocol':'lotus-pos,'+token,Origin:'null'}});
 assert.equal(upgrade.status,101);const ws=upgrade.webSocket;ws.accept();
 const pong=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('WebSocket pong timeout')),5000);ws.addEventListener('message',e=>{if(e.data==='pong'){clearTimeout(timeout);resolve()}})});ws.send('ping');await pong;
 const invalidation=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('WebSocket invalidation timeout')),5000);ws.addEventListener('message',e=>{if(e.data!=='pong'){const message=JSON.parse(e.data);if(message.type==='invalidate'){clearTimeout(timeout);resolve(message)}}})});
 await call('/api/staff/orders',{table:'T02',items:append.items,idempotencyKey:crypto.randomUUID()});assert.equal((await invalidation).scope,'orders');ws.close();
 console.log('PASS workerd/D1: all 18 migrations, health, Android updater '+update.data.status+(update.data.available?' with actual signed APK download/checksum':' with no unsigned download offer')+', order, atomic append replay/rollback, kitchen queue revision, native file-origin WebSocket handshake, automatic pong and scoped invalidation.');
}finally{await mf?.dispose();rmSync(temp,{recursive:true,force:true})}
