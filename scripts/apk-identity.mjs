export function parseApkBadging(text){
 const line=text.split(/\r?\n/).find(line=>line.startsWith('package: '));
 const field=name=>line?.match(new RegExp(`(?:^| )${name}='([^']*)'`))?.[1];
 const applicationId=field('name'),versionName=field('versionName'),code=field('versionCode');
 if(!applicationId||!versionName||!/^\d+$/.test(code||''))throw Error('AAPT2 did not return a valid APK package/version.');
 const mainActivity=text.match(/^launchable-activity: name='([^']*)'/m)?.[1];
 if(!mainActivity)throw Error('APK has no launchable activity.');
 return {applicationId,versionName,versionCode:Number(code),mainActivity};
}

export function assertApkIdentity(actual,expected){
 for(const field of ['applicationId','versionName','versionCode'])if(actual[field]!==expected[field])throw Error(`APK ${field} mismatch: expected=${expected[field]}, actual=${actual[field]}`);
 if(actual.mainActivity!==`${expected.namespace}.MainActivity`)throw Error(`APK launcher mismatch: ${actual.mainActivity}`);
 return actual;
}

export function parseApkMinSdk(text){
 const value=Number(text.match(/^(?:sdkVersion|minSdkVersion):'(\d+)'/m)?.[1]);
 if(!Number.isSafeInteger(value)||value<23||value>100)throw Error('APK has an invalid minimum Android API.');
 return value;
}

export function assertApkSigner(output,expected){
 const signers=[...output.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-f]{64})\s*$/gmi)].map(match=>match[1].toLowerCase());
 if(signers.length!==1||signers[0]!==expected.signerSha256)throw Error(`APK signer mismatch for ${expected.applicationId}; refusing release.`);
 return signers[0];
}
