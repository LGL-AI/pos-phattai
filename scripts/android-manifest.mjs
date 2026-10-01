import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveAndroidIdentity} from './android-identity.mjs';
export function renderAndroidManifest(source,profile){
 const rendered=source.replaceAll('${applicationId}',profile.applicationId);
 if(/\$\{[^}]+\}/.test(rendered))throw Error('Unresolved Android manifest placeholder');
 return rendered;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];if(!output||process.argv.length!==3)throw Error('Usage: node scripts/android-manifest.mjs OUTPUT_PATH');
 const source=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 writeFileSync(output,renderAndroidManifest(source,resolveAndroidIdentity()));
}
