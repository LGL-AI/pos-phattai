import pkg from '../package.json' with {type:'json'};
import {readdirSync} from 'node:fs';
const expectedMigration=readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort().at(-1);
const endpoint=process.env.POS_CLOUDFLARE_URL||'https://pos-phattai.lgl247-ai.workers.dev';
const expected=process.env.EXPECTED_VERSION||pkg.version;
async function main(){
 for(let attempt=1;attempt<=5;attempt++){
  try{
   const response=await fetch(new URL('/api/health',endpoint),{signal:AbortSignal.timeout(8000)});
   const health=await response.json();
   if(response.ok&&health.version===expected&&health.d1==='ok'&&health.storeReady===true&&health.acceptingOrders===true&&health.requiredMigration===expectedMigration&&health.realtime===true){console.log(`Worker PHÁT TÀI ${expected} và D1 đã sẵn sàng.`);return}
   console.error(`Health lần ${attempt}: expected=${expected}, version=${health.version}, d1=${health.d1}, storeReady=${health.storeReady}, acceptingOrders=${health.acceptingOrders}, migration=${health.requiredMigration}, realtime=${health.realtime}`);
  }catch(e){console.error(`Health lần ${attempt}: ${e.message}`)}
  if(attempt<5)await new Promise(resolve=>setTimeout(resolve,2000));
 }
 throw Error('Worker chưa sẵn sàng; kiểm tra deployment và D1, không coi triển khai thành công.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
