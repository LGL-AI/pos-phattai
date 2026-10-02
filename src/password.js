// Password hashes that fit the Workers Free plan, which allows 10 ms of CPU per request.
// PBKDF2 at 120,000 rounds costs 50-90 ms of CPU, so Cloudflare cut off every member registration
// and login, and every staff-account login, with error 1102 (an HTML page the apps could not read).
// New hashes are HMAC-SHA256 under a server-side key derived from PASSWORD_PEPPER (or, when that is
// not set, SESSION_SECRET): without that key a leaked table cannot be brute-forced, and a hash costs
// microseconds. Hashes made before keep verifying with PBKDF2 wherever the CPU allowance permits.
// Changing PASSWORD_PEPPER / SESSION_SECRET invalidates every keyed password.
const te=new TextEncoder();
export const KEYED_PREFIX='k1:';
const keys=new Map();

function secretOf(env){
 const secret=env.PASSWORD_PEPPER||env.SESSION_SECRET;
 if(typeof secret!=='string'||secret.length<16)throw Error('PASSWORD_KEY_MISSING');
 return secret;
}
function keyFor(secret){
 let key=keys.get(secret);
 if(!key){
  key=crypto.subtle.importKey('raw',te.encode(secret),'HKDF',false,['deriveKey'])
   .then(base=>crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:te.encode('lotus-pos/password/v1'),info:new Uint8Array(0)},base,{name:'HMAC',hash:'SHA-256',length:256},false,['sign']));
  keys.set(secret,key);
 }
 return key;
}
const hex=buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
const fromBase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

export async function hashPassword(env,password,salt){
 const signature=await crypto.subtle.sign('HMAC',await keyFor(secretOf(env)),te.encode(salt+'\u0000'+password));
 return KEYED_PREFIX+hex(signature);
}
async function legacyPbkdf2(password,salt,iterations){
 const key=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromBase64(salt),iterations,hash:'SHA-256'},key,256));
}
export function sameText(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 let diff=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return diff===0;
}
export async function verifyPassword(env,password,salt,stored,iterations=120000){
 if(typeof password!=='string'||typeof salt!=='string'||typeof stored!=='string')return false;
 const actual=stored.startsWith(KEYED_PREFIX)?await hashPassword(env,password,salt):await legacyPbkdf2(password,salt,iterations||120000);
 return sameText(actual,stored);
}
export function newSalt(){
 return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}
