import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {resolveAndroidIdentity} from './android-identity.mjs';
import {parseApkBadging,assertApkIdentity,assertApkSigner,parseApkMinSdk} from './apk-identity.mjs';
import {apkHasSigningMaterial} from './apk-zip.mjs';
import {verifyApkAssets} from './verify-apk-assets.mjs';

export function inspectApk(apk,options={}){
 const profile=options.profile||resolveAndroidIdentity();
 const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME;
 const tools=sdk&&join(sdk,'build-tools','35.0.1');
 const aapt2=options.aapt2||(tools&&join(tools,process.platform==='win32'?'aapt2.exe':'aapt2'));
 if(!aapt2)throw Error('Set ANDROID_SDK_ROOT or pass --aapt2 AAPT2_PATH to inspect the compiled APK.');
 const output=execFileSync(aapt2,['dump','badging',apk],{encoding:'utf8',maxBuffer:2*1024*1024});
 const actual=assertApkIdentity(parseApkBadging(output),profile);
 const minSdk=parseApkMinSdk(output);
 const buffer=readFileSync(apk),signed=apkHasSigningMaterial(buffer);let signerSha256=null;
 if(signed){
  const jar=options.apksignerJar||(tools&&join(tools,'lib','apksigner.jar'));
  if(!jar)throw Error('Pass --apksigner-jar or set ANDROID_SDK_ROOT to verify the APK signature.');
  const verification=execFileSync('java',['-jar',jar,'verify','--verbose','--print-certs',apk],{encoding:'utf8',maxBuffer:2*1024*1024});
  signerSha256=assertApkSigner(verification,profile);
 }else if(!options.allowUnsigned)throw Error('Unsigned APK cannot be released. Sign with the original profile keystore.');
 if(options.verifyAssets!==false)verifyApkAssets(apk);
 return {apk,...actual,minSdk,signed,signerSha256,sizeBytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
try{
 const args=process.argv.slice(2),options={};let path;
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--allow-unsigned')options.allowUnsigned=true;
  else if(['--directory','--aapt2','--apksigner-jar'].includes(arg)){
   if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing value for ${arg}`);
   options[arg.slice(2)]=args[++i];
  }else if(!arg.startsWith('-')&&!path)path=arg;
  else throw Error(`Unexpected argument: ${arg}`);
 }
 if(Boolean(path)===Boolean(options.directory))throw Error('Provide APK_PATH or --directory APK_DIRECTORY.');
 const profile=resolveAndroidIdentity();
 const apks=path?[resolve(path)]:readdirSync(options.directory).filter(name=>name.endsWith('.apk')).sort().map(name=>resolve(options.directory,name));
 if(!apks.length)throw Error('No built release APK found; identity verification cannot be skipped.');
 for(const apk of apks){
  console.log(JSON.stringify(inspectApk(apk,{profile,aapt2:options.aapt2,apksignerJar:options['apksigner-jar'],allowUnsigned:options.allowUnsigned}),null,2));
 }
}catch(error){console.error(`APK verification failed: ${error.message}`);process.exitCode=1;}
}
