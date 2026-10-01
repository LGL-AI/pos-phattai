import {readFileSync,readdirSync} from 'node:fs';
import {relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {apkEntries} from './apk-zip.mjs';
export function verifyApkAssets(path){
const root=fileURLToPath(new URL('../public/staff/',import.meta.url));
const entries=apkEntries(readFileSync(path));
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(resolve(dir,item.name)):[resolve(dir,item.name)])}
const expected=files(root).map(path=>['assets/staff/'+relative(root,path).replaceAll('\\','/'),path]);
const actual=[...entries.keys()].filter(name=>name.startsWith('assets/staff/')&&!name.endsWith('/')).sort();
if(JSON.stringify(actual)!==JSON.stringify(expected.map(([name])=>name).sort()))throw Error('APK staff file list differs from current public/staff');
for(const [name,path] of expected)if(!entries.get(name)?.().equals(readFileSync(path)))throw Error('Stale APK asset: '+name);
const dex=entries.get('classes.dex')?.().toString('latin1')||'';
for(const method of ['printReceipt','printKitchen','printDailyReport','openKitchenSettings','openKitchenJobs','openDiagnostics','checkPrinter','reconnectPrinter','getAppUpdateState','checkAppUpdate','installAppUpdate','UpdatePolicy','UpdateProvider'])if(!dex.includes(method))throw Error('Missing native bridge: '+method);
console.log('Built APK contains the current Staff UI and required native bridge methods.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const path=process.argv[2];if(!path)throw Error('Usage: node scripts/verify-apk-assets.mjs APK_PATH');
 verifyApkAssets(path);
}
