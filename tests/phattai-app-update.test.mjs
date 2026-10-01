import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import identity from '../android/app-identity.json' with {type:'json'};
import {selectAndroidRelease,validateReleaseCatalog,releasePath,handleAndroidUpdate,handleAndroidApk,MAX_APK_BYTES} from '../src/android-update.js';
import {releaseMetadata,publishVerifiedRelease} from '../scripts/publish-android-release.mjs';
import {renderAndroidManifest} from '../scripts/android-manifest.mjs';
import worker from '../src/worker.js';
import {parseApkMinSdk} from '../scripts/apk-identity.mjs';

const production=identity.productionApplicationId,legacy='vn.lotusai.pos.other',signer=identity.profiles[production].signerSha256,retiredSigner='9a3049ab6b940be51cea4e22ba4d0ecc8a1d6490f0827d461b7a1f3c3ae860ae';
const twoProfiles={...identity.profiles,[legacy]:{artifactStem:'Other',signerSha256:'c'.repeat(64)}};
const release=(extra={})=>{const data={applicationId:production,signerSha256:signer,versionName:'1.6.3',versionCode:163,signatureVerified:true,minSdk:23,sizeBytes:100,sha256:'a'.repeat(64),publishedAt:'2026-09-30T10:00:00Z',notesVi:'Sửa và cập nhật',notesZh:'修复与更新',...extra};data.path=releasePath(data);return data};
const catalog=data=>({schemaVersion:1,releases:data?[data]:[]});
const params=(extra={})=>new URLSearchParams({applicationId:production,signerSha256:signer,versionCode:'162',sdk:'30',...extra});

test('APK metadata accepts both actual AAPT2 minimum-SDK output formats',()=>{assert.equal(parseApkMinSdk("minSdkVersion:'23'\ntargetSdkVersion:'35'"),23);assert.equal(parseApkMinSdk("sdkVersion:'23'\ntargetSdkVersion:'35'"),23)});
test('APK metadata rejects a missing, unsupported or malformed minimum SDK',()=>{for(const data of ['',"minSdkVersion:'22'","sdkVersion:'bad'","minSdkVersion:'999'"])assert.throws(()=>parseApkMinSdk(data),/minimum Android API/)});

test('UPDATE an installed production app gets only a newer matching signed release',()=>{const result=selectAndroidRelease(params(),catalog(release()));assert.equal(result.available,true);assert.equal(result.release.applicationId,production)});
test('UPDATE an empty catalog reports NOT_PUBLISHED instead of claiming up to date',()=>{assert.equal(selectAndroidRelease(params(),catalog()).status,'NOT_PUBLISHED')});
test('UPDATE the live Worker endpoint needs no D1 probe or staff login',async()=>{const response=await worker.fetch(new Request('https://pos.test/api/android/update?'+params()),{});assert.equal(response.status,200);const data=await response.json(),expected=selectAndroidRelease(params());assert.equal(data.status,expected.status);assert.equal(data.available,expected.available);assert.equal(data.release?.sha256,expected.release?.sha256);assert.match(response.headers.get('Cache-Control'),/no-store/)});
test('UPDATE the production channel never serves a release to a different signer',()=>{assert.equal(selectAndroidRelease(params({signerSha256:'b'.repeat(64)}),catalog(release())).status,'UNSUPPORTED_IDENTITY')});
test('UPDATE package profiles do not cross even when both are published',()=>{const c={schemaVersion:1,releases:[release(),release({applicationId:legacy,signerSha256:'c'.repeat(64)})]};const p=params({applicationId:legacy,signerSha256:'c'.repeat(64)});assert.equal(selectAndroidRelease(p,c,twoProfiles).release.applicationId,legacy);assert.equal(selectAndroidRelease(params(),c,twoProfiles).release.applicationId,production)});
test('UPDATE an unknown package cannot request the production channel',()=>{assert.equal(selectAndroidRelease(params({applicationId:'vn.lotusai.other'}),catalog(release())).status,'UNSUPPORTED_IDENTITY')});
test('UPDATE duplicate identity parameters are rejected',()=>{const p=params();p.append('applicationId',legacy);assert.equal(selectAndroidRelease(p,catalog(release())).httpStatus,400)});
test('UPDATE malformed numeric identity is rejected',()=>{for(const value of ['0','-1','162.5','2147483648','1e3'])assert.equal(selectAndroidRelease(params({versionCode:value}),catalog(release())).httpStatus,400)});
test('UPDATE no downgrade or reinstall of the same version is offered',()=>{for(const code of ['163','164'])assert.equal(selectAndroidRelease(params({versionCode:code}),catalog(release())).status,'UP_TO_DATE')});
test('UPDATE incompatible Android gets no download offer',()=>{assert.equal(selectAndroidRelease(params(),catalog(release({minSdk:31}))).status,'INCOMPATIBLE_ANDROID')});
test('UPDATE unsigned catalog entries fail closed',()=>assert.throws(()=>validateReleaseCatalog(catalog(release({signatureVerified:false}))),/Unverified/));
test('UPDATE catalog entries signed by another profile fail closed',()=>assert.throws(()=>validateReleaseCatalog(catalog(release({signerSha256:retiredSigner}))),/signer/));
test('UPDATE external and mutable download paths fail closed',()=>{for(const path of ['https://evil.test/x.apk','//evil.test/x.apk','/releases/android/latest.apk']){const r=release();r.path=path;assert.throws(()=>validateReleaseCatalog(catalog(r)),/path/)}});
test('UPDATE oversized and missing file metadata fail closed',()=>{for(const sizeBytes of [0,-1,MAX_APK_BYTES+1])assert.throws(()=>validateReleaseCatalog(catalog(release({sizeBytes}))),/metadata/)});
test('UPDATE malformed SHA-256 fails closed',()=>assert.throws(()=>validateReleaseCatalog(catalog(release({sha256:'bad'}))),/metadata/));
test('UPDATE duplicate publication channels fail closed',()=>assert.throws(()=>validateReleaseCatalog({schemaVersion:1,releases:[release(),release()]}),/duplicate/));
test('UPDATE POST cannot publish anything through the device endpoint',async()=>{const response=handleAndroidUpdate(new Request('https://pos.test/api/android/update',{method:'POST'}));assert.equal(response.status,405);assert.equal(response.headers.get('Allow'),'GET')});
test('UPDATE corrupt catalog returns a controlled 503 rather than a fallback update',async()=>{const response=handleAndroidUpdate(new Request('https://pos.test/api/android/update?'+params()),catalog(release({signatureVerified:false})));assert.equal(response.status,503)});
test('UPDATE unpublished APK URLs never reach the assets binding',async()=>{let calls=0;const r=await handleAndroidApk(new Request('https://pos.test/releases/android/unknown.apk'),{ASSETS:{fetch(){calls++;throw Error()}}},catalog());assert.equal(r.status,404);assert.equal(calls,0)});
test('UPDATE a published immutable APK gets the Android MIME type',async()=>{const r=release();const response=await handleAndroidApk(new Request('https://pos.test'+r.path),{ASSETS:{fetch:async()=>new Response('test fixture')}},catalog(r));assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/vnd.android.package-archive');assert.match(response.headers.get('Cache-Control'),/immutable/)});
test('UPDATE missing APK or SPA HTML is never served as an update',async()=>{const r=release();for(const response of [new Response('missing',{status:404}),new Response('<html>',{headers:{'Content-Type':'text/html'}})]){const result=await handleAndroidApk(new Request('https://pos.test'+r.path),{ASSETS:{fetch:async()=>response}},catalog(r));assert.equal(result.status,503)}});
test('PUBLISH metadata rejects unsigned compilation artifacts',()=>assert.throws(()=>releaseMetadata({signed:false}),/signed APK/));
test('PUBLISH byte changes and replacement versionCodes fail before catalog mutation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pos-publish-test-'));
 try{mkdirSync(join(dir,'src'));const original=JSON.stringify(catalog());writeFileSync(join(dir,'src/android-releases.json'),original);const apk=join(dir,'fixture.apk');writeFileSync(apk,'fixture bytes');assert.throws(()=>publishVerifiedRelease(dir,apk,release()),/bytes changed/);assert.equal(readFileSync(join(dir,'src/android-releases.json'),'utf8'),original);assert.equal(existsSync(join(dir,'public')),false);
  const bytes=readFileSync(apk),r=release({sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});publishVerifiedRelease(dir,apk,r);assert.ok(readFileSync(join(dir,'public','.'+r.path)).equals(bytes));const before=readFileSync(join(dir,'src/android-releases.json'),'utf8');assert.throws(()=>publishVerifiedRelease(dir,apk,release({sha256:'b'.repeat(64)})),/replacement/);assert.equal(readFileSync(join(dir,'src/android-releases.json'),'utf8'),before);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('MANIFEST production and legacy providers have distinct authorities',()=>{const source=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');for(const applicationId of [production,legacy]){const rendered=renderAndroidManifest(source,{applicationId});assert.ok(rendered.includes(applicationId+'.updates'));assert.ok(!rendered.includes('${applicationId}'));assert.match(rendered,/android:exported="false"/)}assert.throws(()=>renderAndroidManifest('${unknown}',{applicationId:production}),/Unresolved/)});
test('NATIVE Java update policy validates real production code without Android stubs',()=>{
 const directory=mkdtempSync(join(tmpdir(),'pos-java-policy-'));
 try{const source=fileURLToPath(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/UpdatePolicy.java',import.meta.url)),harness=fileURLToPath(new URL('./UpdatePolicyHarness.java',import.meta.url));execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',directory,source,harness],{encoding:'utf8'});const result=execFileSync('java',['-cp',directory,'UpdatePolicyHarness'],{encoding:'utf8'});assert.match(result,/PASS 28 native Java update policy cases/)}finally{rmSync(directory,{recursive:true,force:true})}
});
const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
function guard(extra={}){const s={busy:false,uncertain:false,submitDraft:null,itemDraft:null,payFlow:null,stockPending:null,refundPending:null,shiftPending:null,cart:[],...extra},context={st:s,pending:new Map(),printingLabels:new Set()};vm.createContext(context);const match=STAFF.match(/function canInstallUpdate\(\)\{[^\n]+\}/);assert.ok(match);vm.runInContext(match[0]+';globalThis.guard=canInstallUpdate',context);return context;}
test('UPDATE a clean idle order screen allows installation',()=>assert.equal(guard().guard(),true));
test('UPDATE drafts and uncertain mutations prevent installation',()=>{for(const key of ['busy','uncertain','submitDraft','itemDraft','payFlow','stockPending','refundPending','shiftPending'])assert.equal(guard({[key]:true}).guard(),false,key);assert.equal(guard({cart:[{}]}).guard(),false)});
test('UPDATE queued writes and printing prevent installation, idle polling does not',()=>{const c=guard();c.pending.set('read',{method:'GET'});assert.equal(c.guard(),true);c.pending.set('write',{method:'POST'});assert.equal(c.guard(),false);c.pending.clear();c.printingLabels.add('job');assert.equal(c.guard(),false)});
function ui(canInstall=true){
 const calls={check:0,install:0,notice:0},listeners=new Map(),panel={innerHTML:''};let state={version:'1.6.3',status:'AVAILABLE',available:true,busy:false,releaseVersion:'1.6.4',message:'Available'};
 const context={window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},document:{querySelector:()=>panel}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../public/staff/app-update.js',import.meta.url),'utf8'),context);
 const controller=context.window.LotusAppUpdate.create({native:{getAppUpdateState:()=>JSON.stringify(state),checkAppUpdate:()=>calls.check++,installAppUpdate:()=>calls.install++},canInstall:()=>canInstall,approve:()=>true,notice:()=>calls.notice++});
 return {controller,calls,panel,event:value=>listeners.get('lotusAppUpdate')({detail:value}),state:value=>{state=value}};
}
test('UPDATE UI supports explicit check and installation',()=>{const u=ui();u.controller.check();u.controller.install();assert.equal(u.calls.check,1);assert.equal(u.calls.install,1)});
test('UPDATE UI never invokes installation with an unfinished draft',()=>{const u=ui(false);u.controller.install();assert.equal(u.calls.install,0);assert.equal(u.calls.notice,1)});
test('UPDATE progress changes only its panel and escapes server text',()=>{const u=ui();u.event({message:'<img onerror=alert(1)>',releaseVersion:'<script>',busy:true,available:true});assert.ok(u.panel.innerHTML.includes('&lt;img'));assert.ok(!u.panel.innerHTML.includes('<script>'));assert.match(u.panel.innerHTML,/disabled/)});
