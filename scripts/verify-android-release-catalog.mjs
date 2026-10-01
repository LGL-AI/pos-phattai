import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import identity from '../android/app-identity.json' with {type:'json'};
import {validateReleaseCatalog} from '../src/android-update.js';
import {inspectApk} from './verify-apk-identity.mjs';
export function verifyPublishedApks(project,catalog){
 validateReleaseCatalog(catalog);
 for(const release of catalog.releases){
  const apk=resolve(project,'public','.'+release.path),data=readFileSync(apk);
  if(data.length!==release.sizeBytes||createHash('sha256').update(data).digest('hex')!==release.sha256)throw Error('Published APK bytes differ from catalog');
  const profile={...release,namespace:identity.namespace};
  // Existing signed releases may precede current web assets. Their immutable
  // bytes and signature are checked; publication separately checks fresh assets.
  const actual=inspectApk(apk,{profile,verifyAssets:false});
  if(actual.minSdk!==release.minSdk)throw Error('Published APK minimum Android API differs from catalog');
 }
 return catalog.releases.length;
}
const root=fileURLToPath(new URL('../',import.meta.url));
const count=verifyPublishedApks(root,JSON.parse(readFileSync(resolve(root,'src/android-releases.json'),'utf8')));
console.log(count?`Verified ${count} signed Android release(s).`:'Android updater catalog: NOT_PUBLISHED (no signed APK).');
