// Fingerprint of everything that ends up inside the APK. CI publishes a new APK
// (with a higher versionCode) only when this changes, so the shop is not asked to
// install an "update" after a Worker-only change.
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function androidInputsHash(){
 const files=execFileSync('git',['ls-files','-z','android','public/staff'],{cwd:root,encoding:'utf8'})
  .split('\0').filter(Boolean)
  // The APK copy of the Staff UI is synced from public/staff; count it once.
  .filter(path=>!path.startsWith('android/app/src/main/assets/staff/')&&existsSync(resolve(root,path)))
  .sort();
 if(!files.length)throw Error('No Android inputs found (is this a git checkout?)');
 const hash=createHash('sha256');
 for(const path of files){hash.update(path+'\0');hash.update(readFileSync(resolve(root,path)));hash.update('\0');}
 return hash.digest('hex').slice(0,16);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(androidInputsHash());
