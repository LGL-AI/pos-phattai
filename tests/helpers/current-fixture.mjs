import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import worker from '../../src/worker.js';
import {applyCurrentSchema} from './schema.mjs';
export function currentFixture(){
 const db=new DatabaseSync(':memory:');applyCurrentSchema(db);const queries=[];
 const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){queries.push(sql);return db.prepare(sql).get(...args)||null},async all(){queries.push(sql);return {results:db.prepare(sql).all(...args)}},async run(){queries.push(sql);return this._run()},_run(){const result=db.prepare(sql).run(...args);return {meta:{changes:result.changes}}}}},async batch(statements){if(DB.beforeBatch){const fn=DB.beforeBatch;DB.beforeBatch=null;fn()}db.exec('BEGIN');try{const result=statements.map(statement=>statement._run());db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}};
 const env={DB,ORDERING_ENABLED:'true',SESSION_SECRET:'current-fixture-012345678901234567890123456789',POS_STAFF_PASSWORD:'qa-password-only',ASSETS:{fetch:async()=>new Response('not found',{status:404})}};
 const call=async(path,method='GET',body=null,headers={},ctx)=>{
  const response=await worker.fetch(new Request('https://pos.test'+path,{method,headers:{Origin:'https://pos.test',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}),env,ctx);
  return {status:response.status,data:await response.json()};
 };
 function actor(role='CASHIER'){
  const id=crypto.randomUUID(),token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),at=new Date().toISOString();
  db.prepare('INSERT INTO pos_staff_users(id,username,display_name,role_id,password_salt,password_hash,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,id,id,role,'salt','hash',1,at,at);
  db.prepare('INSERT INTO pos_staff_sessions(token_hash,expires_at,staff_id) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),Date.now()+3600000,id);
  return {id,token,headers:{Authorization:'Bearer '+token}};
 }
 const item=(qty=1)=>({productId:'101',qty,mods:{size:'中',spice:'中',note:''}});
 const order=(actor,key=crypto.randomUUID())=>call('/api/staff/orders','POST',{table:'T01',items:[item()],idempotencyKey:key},actor.headers);
 return {db,DB,env,call,actor,item,order,queries};
}
