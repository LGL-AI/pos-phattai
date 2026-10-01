import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveAndroidIdentity,androidIdentityConfig} from '../scripts/android-identity.mjs';
import {parseApkBadging,assertApkIdentity,assertApkSigner} from '../scripts/apk-identity.mjs';

const production='vn.lotusai.pos.phattaiapp',legacy='vn.lotusai.pos.handheld';
const expected=resolveAndroidIdentity({});
const badging=(id=production,code=expected.versionCode,name=expected.versionName,activity=production+'.MainActivity')=>`package: name='${id}' versionCode='${code}' versionName='${name}' platformBuildVersionName='15'\nlaunchable-activity: name='${activity}' label='Lotus POS' icon=''\n`;
const root=fileURLToPath(new URL('../',import.meta.url));
function cleanEnv(extra={}){const env={...process.env};delete env.LOTUS_APP_ID;delete env.LOTUS_ALLOW_ALT_APP_ID;return {...env,...extra};}

test('IDENTITY no environment defaults to the production package and production signer',()=>{
 assert.equal(expected.applicationId,production);
 assert.equal(expected.signerSha256,'e66d9870204bcfef827e3b3ef2d601fb83160a4927619e1354411bc6b7f484b4');
});
test('IDENTITY explicit production does not need the alternate-package flag',()=>assert.deepEqual(resolveAndroidIdentity({LOTUS_APP_ID:production}),expected));
test('IDENTITY allow flag alone cannot select the legacy package',()=>assert.deepEqual(resolveAndroidIdentity({LOTUS_ALLOW_ALT_APP_ID:'1'}),expected));
test('IDENTITY the retired legacy package is rejected, even with the alternate-build flag',()=>{
 assert.throws(()=>resolveAndroidIdentity({LOTUS_APP_ID:legacy}),/Unsupported/);
 assert.throws(()=>resolveAndroidIdentity({LOTUS_APP_ID:legacy,LOTUS_ALLOW_ALT_APP_ID:'1'}),/Unsupported/);
 assert.deepEqual(Object.keys(androidIdentityConfig.profiles),[production]);
});
test('IDENTITY CI can inject an increasing release version; malformed versions are refused',()=>{
 const ci=resolveAndroidIdentity({LOTUS_VERSION_CODE:'1042',LOTUS_VERSION_NAME:'1.7.42'});
 assert.equal(ci.versionCode,1042);assert.equal(ci.versionName,'1.7.42');assert.equal(ci.signerSha256,expected.signerSha256);
 for(const bad of [{LOTUS_VERSION_CODE:'0'},{LOTUS_VERSION_CODE:'12a'},{LOTUS_VERSION_NAME:'1.7'},{LOTUS_VERSION_NAME:'v1.7.0'}])assert.throws(()=>resolveAndroidIdentity(bad),/LOTUS_VERSION/);
});
test('IDENTITY unknown packages remain rejected even with opt-in',()=>assert.throws(()=>resolveAndroidIdentity({LOTUS_APP_ID:'vn.lotusai.pos.typo',LOTUS_ALLOW_ALT_APP_ID:'1'}),/Unsupported/));
test('IDENTITY empty app ID cannot silently become a default',()=>assert.throws(()=>resolveAndroidIdentity({LOTUS_APP_ID:''}),/Unsupported/));
test('IDENTITY whitespace in app ID is rejected',()=>assert.throws(()=>resolveAndroidIdentity({LOTUS_APP_ID:' '+production}),/Unsupported/));
test('IDENTITY identity version agrees with Gradle and native user agent',()=>{
 const gradle=readFileSync(new URL('../android/app/build.gradle.kts',import.meta.url),'utf8');
 const main=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java',import.meta.url),'utf8');
 assert.match(gradle,/getOrElse\(\(identityConfig\["versionCode"\] as Number\)\.toString\(\)\)/);
 assert.match(gradle,/versionCode = releaseVersionCode/);assert.match(gradle,/versionName = releaseVersionName/);
 assert.ok(main.includes('" LotusPOSPhatTai/" + installedVersionName()'));
 assert.match(gradle,/applicationId = selectedAppId/);
 assert.match(gradle,/getOrElse\(productionAppId\)/);
 assert.match(gradle,/require\(selectedAppId == productionAppId \|\| providers\.environmentVariable\("LOTUS_ALLOW_ALT_APP_ID"\)\.getOrElse\("0"\) == "1"\)/);
 assert.match(gradle,/assembleRelease/);assert.match(gradle,/finalizedBy\(verifyBuiltReleaseApks\)/);
});
test('APK_ID accepts the actual production package/version/launcher fields',()=>assert.deepEqual(assertApkIdentity(parseApkBadging(badging()),expected),{applicationId:production,versionName:expected.versionName,versionCode:expected.versionCode,mainActivity:production+'.MainActivity'}));
test('APK_ID rejects a legacy APK in the production release path',()=>assert.throws(()=>assertApkIdentity(parseApkBadging(badging(legacy)),expected),/applicationId mismatch/));
test('APK_ID old versionCode cannot pass release verification',()=>assert.throws(()=>assertApkIdentity(parseApkBadging(badging(production,expected.versionCode-1)),expected),/versionCode mismatch/));
test('APK_ID wrong versionName cannot pass release verification',()=>assert.throws(()=>assertApkIdentity(parseApkBadging(badging(production,expected.versionCode,'1.6.1')),expected),/versionName mismatch/));
test('APK_ID missing binary package metadata is rejected',()=>assert.throws(()=>parseApkBadging('application-label: Lotus'),/valid APK package/));
test('APK_ID malformed versionCode is rejected',()=>assert.throws(()=>parseApkBadging(badging(production,'not-a-version')),/valid APK package/));
test('APK_ID missing launcher is rejected',()=>assert.throws(()=>parseApkBadging(badging().split('\n')[0]),/no launchable activity/));
test('APK_ID relative or different launcher cannot pass namespace verification',()=>assert.throws(()=>assertApkIdentity(parseApkBadging(badging(production,expected.versionCode,expected.versionName,'.MainActivity')),expected),/launcher mismatch/));
test('APK_SIGNER the production certificate is accepted',()=>assert.equal(assertApkSigner('Signer #1 certificate SHA-256 digest: '+expected.signerSha256+'\n',expected),expected.signerSha256));
test('APK_SIGNER the retired v1.6.3 signing key cannot sign a production update',()=>assert.throws(()=>assertApkSigner('Signer #1 certificate SHA-256 digest: 9a3049ab6b940be51cea4e22ba4d0ecc8a1d6490f0827d461b7a1f3c3ae860ae\n',expected),/signer mismatch/));
test('APK_SIGNER output without a verified certificate is rejected',()=>assert.throws(()=>assertApkSigner('DOES NOT VERIFY',expected),/signer mismatch/));
test('APK_SIGNER unexpected additional signers are rejected',()=>assert.throws(()=>assertApkSigner('Signer #1 certificate SHA-256 digest: '+expected.signerSha256+'\nSigner #2 certificate SHA-256 digest: '+expected.signerSha256+'\n',expected),/signer mismatch/));
test('IDENTITY CLI reports the production profile with no environment',()=>{
 const result=spawnSync(process.execPath,['scripts/android-identity.mjs'],{cwd:root,env:cleanEnv(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).applicationId,production);
});
test('IDENTITY CLI exits nonzero for the retired legacy package',()=>{
 const result=spawnSync(process.execPath,['scripts/android-identity.mjs'],{cwd:root,env:cleanEnv({LOTUS_APP_ID:legacy}),encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Unsupported/);assert.equal(result.stdout,'');
});
test('IDENTITY CLI rejects unknown package even when alternate builds are enabled',()=>{
 const result=spawnSync(process.execPath,['scripts/android-identity.mjs'],{cwd:root,env:cleanEnv({LOTUS_APP_ID:'vn.lotusai.pos.typo',LOTUS_ALLOW_ALT_APP_ID:'1'}),encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Unsupported/);assert.equal(result.stdout,'');
});
