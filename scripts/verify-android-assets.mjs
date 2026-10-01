import {readdirSync,readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pub=resolve(root,'public/staff'),apk=resolve(root,'android/app/src/main/assets/staff');
function files(dir,base=dir,out=[]){for(const n of readdirSync(dir)){const p=resolve(dir,n),st=statSync(p);st.isDirectory()?files(p,base,out):out.push(relative(base,p).replaceAll('\\','/'))}return out.sort()}
function sha(p){return createHash('sha256').update(readFileSync(p)).digest('hex')}
const a=files(pub),b=files(apk);if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`Android staff asset file list differs from public/staff\npublic=${a}\napk=${b}`);
for(const f of a)if(sha(resolve(pub,f))!==sha(resolve(apk,f)))throw Error(`Android staff asset differs: ${f}`);
console.log(`Android staff assets match public/staff (${a.length} files).`);
