import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const source=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
catalog.store={...catalog.store,tableCount:99,taxRate:0,taxMode:'INCLUSIVE'};
const app={innerHTML:'',querySelector:()=>null};
const listeners={};
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const document={
 querySelector:s=>s==='#app'?app:null,
 querySelectorAll:()=>[],
 createElement:tag=>({tagName:tag.toUpperCase(),style:{},dataset:{},setAttribute(){},appendChild(){},remove(){},click(){},getContext(){return null}}),
 addEventListener:(name,fn)=>{listeners[name]=fn},
 documentElement:{lang:'vi'},body:{style:{},appendChild(){}}
};
const jsonResponse=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
async function fetchMock(input){
 const u=String(input);
 if(u.includes('/api/catalog'))return jsonResponse({ok:true,catalog,acceptingOrders:true});
 if(u.includes('/api/member/me'))return jsonResponse({ok:true,member:null});
 if(u.includes('/api/vouchers'))return jsonResponse({ok:true,vouchers:[]});
 if(u.endsWith('/catalog.json'))return jsonResponse(catalog);
 return jsonResponse({ok:false,message:'Không tìm thấy',messageCn:'找不到资源'},404);
}
const context={
 console,document,window:null,navigator:{onLine:true,serviceWorker:null},localStorage,location:{search:'',href:'http://qr.test/',protocol:'http:',hostname:'qr.test'},history:{replaceState(){}},
 URL,URLSearchParams,Intl,Math,Date,JSON,Number,String,Array,Object,Map,Set,RegExp,Error,Promise,Response,Request,Headers,Blob,TextEncoder,TextDecoder,AbortSignal,
 crypto:webcrypto,fetch:fetchMock,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},btoa,atob
};
context.window=context;context.window.addEventListener=()=>{};context.window.scrollTo=()=>{};
vm.createContext(context);
vm.runInContext(source,context,{filename:'app.js'});
await new Promise(r=>setTimeout(r,10));

const check=(name,ok)=>{if(!ok)throw new Error('SMOKE FAIL: '+name);console.log('PASS',name)};
check('document language zh-CN',document.documentElement.lang==='zh-CN');
check('table picker Chinese',app.innerHTML.includes('请选择您所在的桌号'));
check('menu Chinese',app.innerHTML.includes('菜单'));
check('Chinese equal bilingual structure',app.innerHTML.includes('lang="zh-CN"'));

const click=async dataset=>{const fn=listeners.click;if(!fn)throw new Error('click handler missing');await fn({target:{closest:sel=>sel==='button'?{dataset,disabled:false}:null,matches:()=>false}})};
await click({pick:'T03'});
await click({action:'confirm-table'});
check('table T03 selected',app.innerHTML.includes('T03'));
await click({add:'101'});
check('modifier modal Chinese size',app.innerHTML.includes('份量'));
check('modifier modal Chinese spice',app.innerHTML.includes('辣度'));
check('modifier modal Chinese note',app.innerHTML.includes('菜品备注'));
check('modifier modal Vietnamese retained',app.innerHTML.includes('Phần ăn')&&app.innerHTML.includes('Độ cay'));
check('no undefined/reference error leaked',!app.innerHTML.includes('undefined')&&!app.innerHTML.includes('ReferenceError'));
console.log('QR UI runtime smoke PASS');
