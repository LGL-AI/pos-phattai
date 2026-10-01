import {existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectApk} from './verify-apk-identity.mjs';
import {validateReleaseCatalog,releasePath,MAX_APK_BYTES} from '../src/android-update.js';
const root=fileURLToPath(new URL('../',import.meta.url));

export function releaseMetadata(actual,{notesVi='',notesZh='',publishedAt=new Date().toISOString()}={}){
 if(actual.signed!==true||!actual.signerSha256)throw Error('Only a verified signed APK may be published');
 if(actual.sizeBytes>MAX_APK_BYTES)throw Error('APK exceeds the 25 MiB asset limit');
 const release={applicationId:actual.applicationId,versionName:actual.versionName,versionCode:actual.versionCode,
  signerSha256:actual.signerSha256,signatureVerified:true,sha256:actual.sha256,sizeBytes:actual.sizeBytes,minSdk:actual.minSdk,
  publishedAt,notesVi,notesZh};
 release.path=releasePath(release);return release;
}
export function publishVerifiedRelease(project,apk,release){
 const path=resolve(project,'src/android-releases.json'),catalog=JSON.parse(readFileSync(path,'utf8'));
 validateReleaseCatalog(catalog);
 const previous=catalog.releases.find(x=>x.applicationId===release.applicationId);
 if(previous&&(previous.versionCode>release.versionCode||(previous.versionCode===release.versionCode&&previous.sha256!==release.sha256)))throw Error('Refusing a downgrade or replacement of an already published versionCode');
 if(previous?.sha256===release.sha256)release={...release,publishedAt:previous.publishedAt};
 const next={schemaVersion:1,releases:[...catalog.releases.filter(x=>x.applicationId!==release.applicationId),release].sort((a,b)=>a.applicationId.localeCompare(b.applicationId))};
 validateReleaseCatalog(next);
 const destination=resolve(project,'public','.'+release.path),temporary=destination+'.tmp';
 const data=readFileSync(apk);
 // Recheck bytes after signature inspection, before any file or catalog mutation.
 if(data.length!==release.sizeBytes)throw Error('APK bytes changed after verification');
 if(createHash('sha256').update(data).digest('hex')!==release.sha256)throw Error('APK checksum changed after verification');
 mkdirSync(dirname(destination),{recursive:true});
 if(existsSync(destination)&&!readFileSync(destination).equals(data))throw Error('Immutable APK path already has different bytes');
 try{
  writeFileSync(temporary,data);renameSync(temporary,destination);
  writeFileSync(path+'.tmp',JSON.stringify(next,null,2)+'\n');renameSync(path+'.tmp',path);
 }finally{rmSync(temporary,{force:true});rmSync(path+'.tmp',{force:true})}
 return release;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),apk=args.shift(),notes={};
  if(!apk||apk.startsWith('--'))throw Error('Usage: node scripts/publish-android-release.mjs SIGNED_APK [--notes-vi TEXT] [--notes-zh TEXT]');
  while(args.length){const option=args.shift(),value=args.shift();if(!['--notes-vi','--notes-zh'].includes(option)||value===undefined)throw Error('Invalid release notes argument');notes[option==='--notes-vi'?'notesVi':'notesZh']=value;}
  const actual=inspectApk(resolve(apk)); // Requires pinned package/version/signer and current APK assets.
  const release=publishVerifiedRelease(root,resolve(apk),releaseMetadata(actual,notes));
  console.log(JSON.stringify({publishedLocally:true,remoteDeployed:false,release},null,2));
 }catch(error){console.error('Android publication refused: '+error.message);process.exitCode=1;}
}
