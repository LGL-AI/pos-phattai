import identity from '../android/app-identity.json' with {type:'json'};
import packageInfo from '../package.json' with {type:'json'};
import catalog from '../src/android-releases.json' with {type:'json'};
import {selectAndroidRelease} from '../src/android-update.js';
import {readdirSync} from 'node:fs';
const origin=process.env.POS_CLOUDFLARE_URL||'https://pos-phattai.lgl247-ai.workers.dev';
async function read(path){
 const response=await fetch(origin+path,{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Production check HTTP ${response.status}`);
 return response.json();
}
// Cloudflare needs a few seconds to serve a new deployment everywhere, so retry for up to a minute.
async function verify(){
 const health=await read('/api/health');
 const requiredMigration=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort().at(-1);
 if(health.version!==packageInfo.version||health.d1!=='ok'||health.requiredMigration!==requiredMigration)throw Error(`Production health ${JSON.stringify({version:health.version,d1:health.d1,requiredMigration:health.requiredMigration})} does not match Worker ${packageInfo.version}`);
 const query=new URLSearchParams({applicationId:identity.productionApplicationId,signerSha256:identity.profiles[identity.productionApplicationId].signerSha256,versionCode:'1',sdk:'30'});
 const update=await read('/api/android/update?'+query),expected=selectAndroidRelease(query,catalog);
 if(update.status!==expected.status||update.available!==expected.available||update.release?.sha256!==expected.release?.sha256)throw Error(`Production updater (${update.status} ${update.release?.sha256||''}) differs from the verified catalog (${expected.status} ${expected.release?.sha256||''})`);
 // PT-31: pages are served without the Worker, so their security headers come from public/_headers.
 for(const path of ['/qr/','/staff/','/counter/']){
  const page=await fetch(origin+path,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});
  if(!page.ok||!/frame-ancestors 'none'/.test(page.headers.get('content-security-policy')||'')||page.headers.get('x-content-type-options')!=='nosniff')throw Error(`Production page ${path} HTTP ${page.status} is missing its security headers`);
 }
 return update.status;
}
let lastError;
for(let attempt=1;attempt<=12;attempt++){
 try{const status=await verify();console.log(`Production verified: Worker ${packageInfo.version}; updater ${status}.`);lastError=null;break}
 catch(error){lastError=error;console.error(`Production check ${attempt}/12: ${error.message}`);if(attempt<12)await new Promise(resolve=>setTimeout(resolve,5000))}
}
if(lastError){
 console.error('Production verification failed: '+lastError.message);
 if(process.env.GITHUB_ACTIONS)console.log('::error::Production verification failed: '+lastError.message);
 process.exitCode=1;
}
