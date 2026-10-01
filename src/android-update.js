import identity from '../android/app-identity.json' with {type:'json'};
import published from './android-releases.json' with {type:'json'};

export const MAX_APK_BYTES=25*1024*1024;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
export function releasePath(release){
 return `/releases/android/${release.applicationId}/v${release.versionCode}/${release.sha256}.apk`;
}
export function validateReleaseCatalog(catalog,profiles=identity.profiles){
 if(catalog?.schemaVersion!==1||!Array.isArray(catalog.releases))throw Error('Invalid Android release catalog');
 const packages=new Set();
 for(const release of catalog.releases){
  const profile=release&&Object.hasOwn(profiles,release.applicationId)?profiles[release.applicationId]:null;
  if(!profile||packages.has(release.applicationId))throw Error('Unknown or duplicate Android release profile');
  packages.add(release.applicationId);
  if(release.signatureVerified!==true||release.signerSha256!==profile.signerSha256)throw Error('Unverified or mismatched Android release signer');
  if(!integer(release.versionCode,1,2147483647)||typeof release.versionName!=='string'||!/^\d+\.\d+\.\d+$/.test(release.versionName))throw Error('Invalid Android release version');
  if(!integer(release.minSdk,23,100)||!integer(release.sizeBytes,1,MAX_APK_BYTES)||!digest(release.sha256))throw Error('Invalid Android release file metadata');
  if(release.path!==releasePath(release))throw Error('Android release path is not immutable or has an external origin');
  if(typeof release.publishedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(release.publishedAt)||!Number.isFinite(Date.parse(release.publishedAt)))throw Error('Invalid Android release publication time');
  for(const field of ['notesVi','notesZh'])if(typeof release[field]!=='string'||release[field].length>2000)throw Error('Invalid Android release notes');
 }
 return catalog;
}
export function selectAndroidRelease(params,catalog=published,profiles=identity.profiles){
 const keys=['applicationId','signerSha256','versionCode','sdk'];
 if(keys.some(key=>params.getAll(key).length!==1))return {httpStatus:400,ok:false,code:'BAD_UPDATE_IDENTITY'};
 const applicationId=params.get('applicationId'),signer=params.get('signerSha256');
 const code=params.get('versionCode'),sdk=params.get('sdk');
 if(!/^[A-Za-z][A-Za-z0-9_.]{2,150}$/.test(applicationId)||!digest(signer)||!/^\d{1,10}$/.test(code)||!/^\d{1,3}$/.test(sdk)||!integer(Number(code),1,2147483647)||!integer(Number(sdk),23,100))return {httpStatus:400,ok:false,code:'BAD_UPDATE_IDENTITY'};
 const profile=Object.hasOwn(profiles,applicationId)?profiles[applicationId]:null;
 if(!profile||signer!==profile.signerSha256)return {ok:true,available:false,status:'UNSUPPORTED_IDENTITY'};
 validateReleaseCatalog(catalog,profiles);
 const release=catalog.releases.find(release=>release.applicationId===applicationId);
 if(!release)return {ok:true,available:false,status:'NOT_PUBLISHED'};
 if(release.versionCode<=Number(code))return {ok:true,available:false,status:'UP_TO_DATE'};
 if(release.minSdk>Number(sdk))return {ok:true,available:false,status:'INCOMPATIBLE_ANDROID'};
 return {ok:true,available:true,status:'AVAILABLE',release};
}
export function handleAndroidUpdate(request,catalog=published){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'};
 if(request.method!=='GET')return new Response(JSON.stringify({ok:false,code:'METHOD_NOT_ALLOWED'}),{status:405,headers:{...headers,Allow:'GET'}});
 try{
  const {httpStatus=200,...data}=selectAndroidRelease(new URL(request.url).searchParams,catalog);
  return new Response(JSON.stringify(data),{status:httpStatus,headers});
 }catch{return new Response(JSON.stringify({ok:false,code:'UPDATE_CATALOG_INVALID'}),{status:503,headers})}
}
export async function handleAndroidApk(request,env,catalog=published){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
 try{
  validateReleaseCatalog(catalog);
  const path=new URL(request.url).pathname,release=catalog.releases.find(release=>release.path===path);
  if(!release)return new Response('Not found',{status:404,headers});
  const response=await env.ASSETS.fetch(request);
  if(response.status!==200||/text\/html/i.test(response.headers.get('Content-Type')||''))return new Response('APK unavailable',{status:503,headers});
  const result=new Headers(response.headers);
  result.set('Content-Type','application/vnd.android.package-archive');
  result.set('Content-Disposition',`attachment; filename="LotusPOS_PhatTai_${release.versionName}.apk"`);
  result.set('Cache-Control','public, max-age=31536000, immutable');
  result.set('X-Content-Type-Options','nosniff');
  return new Response(response.body,{status:200,headers:result});
 }catch{return new Response('APK unavailable',{status:503,headers})}
}
