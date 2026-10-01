import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import identity from '../android/app-identity.json' with {type:'json'};
import pkg from '../package.json' with {type:'json'};
import catalog from '../src/android-releases.json' with {type:'json'};
const root=fileURLToPath(new URL('../',import.meta.url));
const current=JSON.parse(readFileSync(resolve(root,'CURRENT_RELEASE.json'),'utf8'));
const expectedManifest=`RELEASE_MANIFEST_v${identity.versionName}.json`;
if(current.release!==identity.versionName||current.worker!==pkg.version||current.manifest!==expectedManifest)throw Error('Current release pointer is stale');
const manifest=JSON.parse(readFileSync(resolve(root,expectedManifest),'utf8'));
const template=JSON.parse(readFileSync(resolve(root,'RELEASE_MANIFEST.template.json'),'utf8'));
for(const data of [manifest,template]){
 if(data.release!==identity.versionName||data.worker!==pkg.version||data.androidSourceVersion!==identity.versionName||data.androidSourceVersionCode!==identity.versionCode||data.defaultApkPackage!==identity.productionApplicationId)throw Error('Release manifest/template differs from actual Android/Worker identity');
 if(JSON.stringify(data.supportedApkProfiles)!==JSON.stringify(identity.profiles))throw Error('Release manifest/template has stale package/signer profiles');
}
const signed=catalog.releases.filter(release=>release.versionCode===identity.versionCode&&release.versionName===identity.versionName);
if(manifest.signedApkProduced!==(signed.length>0)||JSON.stringify(manifest.signedApks)!==JSON.stringify(signed))throw Error('Release manifest signing status differs from the verified APK catalog');
if(manifest.autoUpdater.catalogEntries!==catalog.releases.length)throw Error('Release manifest updater count differs from actual catalog');
if(manifest.productionDeployedThisSession){
 const path=resolve(root,`verification/REMOTE_DEPLOY_v${identity.versionName}.json`);
 if(!existsSync(path))throw Error('Deployment claim has no remote verification proof');
 const proof=JSON.parse(readFileSync(path,'utf8'));
 if(proof.worker!==pkg.version||proof.health?.version!==pkg.version||proof.health?.d1!=='ok')throw Error('Deployment claim differs from remote verification proof');
}
console.log('Current manifest, template, package/signer profiles and signing/deployment claims are consistent.');
