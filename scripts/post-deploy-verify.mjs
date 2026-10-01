import identity from '../android/app-identity.json' with {type:'json'};
import packageInfo from '../package.json' with {type:'json'};
import catalog from '../src/android-releases.json' with {type:'json'};
import {selectAndroidRelease} from '../src/android-update.js';
const origin=process.env.POS_CLOUDFLARE_URL||'https://pos-phattai.lgl247-ai.workers.dev';
async function read(path){
 const response=await fetch(origin+path,{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Production check HTTP ${response.status}`);
 return response.json();
}
try{
 const health=await read('/api/health');
 const requiredMigration='0018_sync_revisions_append_requests.sql';
 if(health.version!==packageInfo.version||health.d1!=='ok'||health.requiredMigration!==requiredMigration)throw Error('Production health does not match this Worker/migration');
 const query=new URLSearchParams({applicationId:identity.productionApplicationId,signerSha256:identity.profiles[identity.productionApplicationId].signerSha256,versionCode:'1',sdk:'30'});
 const update=await read('/api/android/update?'+query),expected=selectAndroidRelease(query,catalog);
 if(update.status!==expected.status||update.available!==expected.available||update.release?.sha256!==expected.release?.sha256)throw Error('Production updater differs from the verified release catalog');
 console.log(`Production verified: Worker ${packageInfo.version}; updater ${update.status}.`);
}catch(error){console.error('Production verification failed: '+error.message);process.exitCode=1;}
