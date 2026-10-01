import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const androidIdentityConfig=JSON.parse(readFileSync(new URL('../android/app-identity.json',import.meta.url),'utf8'));

export function resolveAndroidIdentity(env=process.env){
 const applicationId=env.LOTUS_APP_ID===undefined?androidIdentityConfig.productionApplicationId:env.LOTUS_APP_ID;
 if(!Object.hasOwn(androidIdentityConfig.profiles,applicationId))throw Error(`Unsupported LOTUS_APP_ID=${JSON.stringify(applicationId)}. Select one of the pinned Android profiles.`);
 if(applicationId!==androidIdentityConfig.productionApplicationId&&env.LOTUS_ALLOW_ALT_APP_ID!=='1')throw Error(`LOTUS_APP_ID=${applicationId} is an alternate install profile. Set LOTUS_ALLOW_ALT_APP_ID=1 only when intentionally updating that package.`);
 return {applicationId,namespace:androidIdentityConfig.namespace,versionName:androidIdentityConfig.versionName,versionCode:androidIdentityConfig.versionCode,...androidIdentityConfig.profiles[applicationId]};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const profile=resolveAndroidIdentity();
  if(process.argv[2]==='--build-fields')console.log([profile.applicationId,profile.signerSha256,profile.namespace,profile.versionName,profile.versionCode,profile.artifactStem].join('\n'));
  else if(process.argv.length===2)console.log(JSON.stringify(profile,null,2));
  else throw Error('Usage: node scripts/android-identity.mjs [--build-fields]');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
