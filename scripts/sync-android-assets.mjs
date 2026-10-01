import {cpSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const src=resolve(root,'public/staff');
const dst=resolve(root,'android/app/src/main/assets/staff');
rmSync(dst,{recursive:true,force:true});mkdirSync(dst,{recursive:true});cpSync(src,dst,{recursive:true});
console.log(`Synced ${src} -> ${dst}`);
