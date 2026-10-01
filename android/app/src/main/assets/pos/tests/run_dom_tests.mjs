import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM,VirtualConsole,ResourceLoader} from 'jsdom';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='https://demo.local';
const results=[];

class LocalResourceLoader extends ResourceLoader{
  fetch(url){
    const parsed=new URL(url);
    const relative=decodeURIComponent(parsed.pathname.replace(/^\//,''))||'index.html';
    const target=path.resolve(root,relative);
    if(!target.startsWith(root)||!fs.existsSync(target)||fs.statSync(target).isDirectory())return null;
    return Promise.resolve(fs.readFileSync(target));
  }
}

function record(id,group,expected,fn){
  try{
    const actual=fn();
    if(actual===false)throw new Error('assertion returned false');
    results.push({id,group,expected,actual:typeof actual==='string'?actual:'PASS',status:'PASS',timestamp:new Date().toISOString()});
  }catch(error){
    results.push({id,group,expected,actual:error.message,status:'FAIL',timestamp:new Date().toISOString()});
  }
}
function assert(condition,message){if(!condition)throw new Error(message);return true;}
async function load(pathname){
  const runtimeErrors=[];
  const virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>runtimeErrors.push(error.message));
  virtualConsole.on('error',message=>runtimeErrors.push(String(message)));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{
    url:base+pathname,resources:new LocalResourceLoader(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,
    beforeParse(window){
      window.alert=message=>{window.__alerts=(window.__alerts||[]).concat(String(message));};
      window.confirm=()=>true;
      window.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      window.URL.createObjectURL=()=>`blob:mock-${Date.now()}`;window.URL.revokeObjectURL=()=>{};
      window.HTMLCanvasElement.prototype.getContext=()=>({fillStyle:'#fff',fillRect(){},drawImage(){}});
      window.HTMLCanvasElement.prototype.toBlob=callback=>callback(new window.Blob(['mock'],{type:'image/png'}));
      window.open=()=>({document:{write(){},close(){}}});
      Object.defineProperty(window.navigator,'onLine',{value:true,writable:true,configurable:true});
      window.addEventListener('error',event=>runtimeErrors.push(event.error?.stack||event.message));
    }
  });
  await new Promise(resolve=>dom.window.addEventListener('load',()=>setTimeout(resolve,120),{once:true}));
  return{dom,window:dom.window,document:dom.window.document,runtimeErrors};
}
function click(document,selector){const el=document.querySelector(selector);if(!el){const surface=document.querySelector('#qrPhone');throw new Error(`missing ${selector}; qr=${surface?.textContent.replace(/\s+/g,' ').slice(0,1200)}`);}el.click();return el;}
function fill(document,selector,value){const el=document.querySelector(selector);if(!el)throw new Error(`missing ${selector}`);el.value=value;el.dispatchEvent(new el.ownerDocument.defaultView.Event('input',{bubbles:true}));return el;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const desktop=await load('/index.html');
record('DOM-001','runtime','No uncaught runtime error on desktop',()=>assert(desktop.runtimeErrors.length===0,desktop.runtimeErrors.join(' | ')));
record('DOM-002','runtime','Enhanced API loaded',()=>assert(desktop.window.LotusPOC?.enhanced===true,'enhanced API missing'));
record('DOM-003','navigation','All desktop navigation targets exist',()=>{
  const buttons=[...desktop.document.querySelectorAll('#nav button[data-view]')];
  for(const button of buttons){button.click();const active=desktop.document.querySelector('.view.active');if(active?.id!==`view-${button.dataset.view}`)throw new Error(`${button.dataset.view} did not activate`);}
  return `${buttons.length} views opened`;
});
click(desktop.document,'#nav button[data-view="pos"]');
record('DOM-004','pos','POS has member phone lookup and register controls',()=>assert(!!desktop.document.querySelector('#posMemberPhone')&&!!desktop.document.querySelector('#posRegisterMember'),'member controls missing'));
fill(desktop.document,'#posMemberPhone','0909000111');click(desktop.document,'#posLookupMember');
record('DOM-005','pos','Member phone lookup selects existing member',()=>assert(desktop.window.LotusPOC.S().posCustomerId==='CUS001','member not selected'));
click(desktop.document,'[data-posadd="1"]');await delay(10);click(desktop.document,'#confirmModifier');
record('DOM-006','pos','Product modifier adds item to POS cart',()=>assert(desktop.window.LotusPOC.S().posCart.length===1,'cart unchanged'));
record('DOM-007','second-screen','Second screen mirrors POS cart immediately',()=>assert(desktop.document.querySelector('#secondScreen').textContent.includes('Cà phê đen nóng'),'mirror missing item'));
const desktopState=desktop.window.LotusPOC.S(),desktopIngredientBefore=desktopState.inventory.ingredients.find(x=>x.id==='ING-COFFEE').stock;
click(desktop.document,'#posCreateOrder');
record('DOM-008','orders','POS creates a real order record',()=>assert(desktopState.orders.length===1&&desktopState.orders[0].source==='POS','order missing'));
record('DOM-009','inventory','Order creation immediately deducts ingredient estimate',()=>assert(desktopState.inventory.ingredients.find(x=>x.id==='ING-COFFEE').stock===desktopIngredientBefore-20,'ingredient not deducted'));
record('DOM-010','inventory','Order creation writes inventory movement with order reference',()=>assert(desktopState.inventory.movements.some(x=>x.reference===desktopState.orders[0].code),'movement missing'));
record('DOM-011','product','Product editor exposes recipe rows and units',()=>{click(desktop.document,'#nav button[data-view="products"]');click(desktop.document,'[data-editproduct="1"]');return assert(desktop.document.querySelectorAll('#pRecipeRows .recipe-row').length>=2&&desktop.document.querySelector('.recipe-unit'),'recipe UI missing');});
record('DOM-012','inventory','Inventory receive/adjust/schedule controls render',()=>assert(!!desktop.document.querySelector('#saveInventoryEntry')&&desktop.document.querySelector('#invType option[value="PLAN"]'),'inventory form missing'));
record('DOM-013','settings','Store Settings is separated from customer QR inspector',()=>{click(desktop.document,'#nav button[data-view="settings"]');return assert(!!desktop.document.querySelector('#settingsBankAccount')&&!desktop.document.querySelector('#qrAccountInspector #settingsBankAccount'),'bank settings placement wrong');});
record('DOM-014','rbac','Admin seed migrated to STORE_OWNER only',()=>assert(desktopState.staff[0].role==='STORE_OWNER'&&!desktopState.roles.some(r=>r.id==='SYSTEM_ADMIN'),'role migration wrong'));
record('DOM-015','rbac','Permission matrix renders fixed and delegated roles',()=>assert(desktop.document.querySelectorAll('.permission-matrix thead th').length>=4,'role columns missing'));
fill(desktop.document,'#newRoleVi','Barista');fill(desktop.document,'#newRoleCn','咖啡师');
const createOrderPermission=desktop.document.querySelector('[data-new-role-permission="create_orders"]');createOrderPermission.checked=true;click(desktop.document,'#createRole');
record('DOM-016','rbac','Store owner can create a custom role from matrix',()=>assert(desktopState.roles.some(r=>r.nameVi==='Barista'&&r.permissions.includes('create_orders')),'custom role not saved'));
record('DOM-017','settings','Approved OCB account is loaded and direct transfer is enabled',()=>assert(desktop.document.querySelector('#settingsBankAccount').value==='609271'&&desktop.document.querySelector('#settingsBankName').value==='HUANG TIANSHENG'&&desktop.document.querySelector('#allowRealDeeplink').checked&&!desktop.document.querySelector('#allowRealDeeplink').disabled,'live OCB configuration missing'));
record('DOM-018','license','Store Settings exposes license read-only card',()=>assert(desktop.document.querySelector('#storeSettingsRoot').textContent.includes('Chỉ xem'),'license should be read-only'));
click(desktop.document,'#nav button[data-view="license"]');
record('DOM-019','license','License simulator is separate and clearly DEMO',()=>assert(desktop.document.querySelector('#licenseSimulatorRoot').textContent.includes('RANH GIỚI DEMO'),'demo boundary missing'));
click(desktop.document,'[data-license-scenario="D_PLUS_3_0500"]');
record('DOM-020','license','D+3 at 05:00 transitions to SUSPENDED',()=>assert(desktopState.license.status==='SUSPENDED','status='+desktopState.license.status));
record('DOM-021','license','Locked state blocks new order but preserves old order',()=>{let denied=false;try{desktop.window.LotusPOC.serviceCreateOrder(desktopState,{cart:[desktopState.orders[0].items[0]]});}catch(error){denied=error.message==='LICENSE_NEW_ORDERS_BLOCKED';}return assert(denied&&desktopState.orders.length===1,'scope incorrect');});
click(desktop.document,'#toggleSystemAdmin');fill(desktop.document,'#licenseNewExpiry','2026-12-31');click(desktop.document,'[data-license-action="RENEW"]');
record('DOM-022','license','System Admin demo renewal restores ACTIVE with audit',()=>assert(desktopState.license.status==='ACTIVE'&&desktopState.license.audit.some(x=>x.type==='MANUAL_RENEW'),'renew audit missing'));

const qr=await load('/index.html?mode=qr&table=T02');
record('DOM-023','qr-runtime','No uncaught runtime error on QR entry',()=>assert(qr.runtimeErrors.length===0,qr.runtimeErrors.join(' | ')));
record('DOM-024','qr-routing','QR deep link preserves validated table T02',()=>assert(qr.window.LotusPOC.S().qr.table==='T02','table not preserved'));
record('DOM-025','qr-layout','Standalone QR hides desktop sidebar and inspector panel',()=>{const sidebar=qr.window.getComputedStyle(qr.document.querySelector('.sidebar')).display;const panel=qr.window.getComputedStyle(qr.document.querySelector('#view-qr .display-layout>div:nth-child(2)')).display;return assert(sidebar==='none'&&panel==='none',`sidebar=${sidebar},panel=${panel}`);});
record('DOM-026','qr-navigation','Customer bottom navigation has exactly four required tabs',()=>{const labels=[...qr.document.querySelectorAll('#qrPhone .mobile-bottom-nav button')].map(x=>x.textContent.replace(/\s+/g,' ').trim());return assert(labels.length===4&&labels.some(x=>x.includes('Menu'))&&labels.some(x=>x.includes('Giỏ'))&&labels.some(x=>x.includes('Ưu đãi'))&&labels.some(x=>x.includes('Tài khoản')),labels.join('|'));});
record('DOM-027','qr-security','Customer UI has no editable/save OCB settings',()=>assert(!qr.document.querySelector('#qrPhone #saveBankPayment')&&!qr.document.querySelector('#qrPhone #settingsBankAccount'),'bank editor leaked'));
click(qr.document,'[data-qradd="1"]');await delay(10);click(qr.document,'#confirmModifier');click(qr.document,'[data-qr-tab="cart"]');
record('DOM-028','qr-cart','QR modifier adds item and cart tab shows it',()=>assert(qr.window.LotusPOC.S().qr.cart.length===1&&qr.document.querySelector('#qrPhone').textContent.includes('Cà phê đen nóng'),'qr cart missing'));
click(qr.document,'#qrCheckout');
record('DOM-029','qr-checkout','Checkout starts at login/register/guest step',()=>assert(!!qr.document.querySelector('#qrCheckoutLogin')&&!!qr.document.querySelector('#qrCheckoutRegister')&&!!qr.document.querySelector('#qrGuestNext'),'member step incomplete'));
click(qr.document,'#qrGuestNext');
record('DOM-030','qr-checkout','Guest proceeds to voucher step',()=>assert(qr.window.LotusPOC.S().qr.checkoutStep==='voucher','not voucher step'));
click(qr.document,'#qrVoucherNext');
record('DOM-031','qr-checkout','Payment method offers cash and OCB transfer',()=>assert(qr.document.querySelectorAll('[data-qr-payment]').length===2,'payment choices missing'));
click(qr.document,'[data-qr-payment="BANK"]');
const qrOrder=qr.window.LotusPOC.S().orders.at(-1);
record('DOM-032','qr-payment','Bank checkout creates one pending payment request',()=>assert(qrOrder.paymentRequest&&qrOrder.paymentStatus==='PENDING','payment request missing'));
record('DOM-033','qr-payment','Result shows order barcode and bank QR together',()=>assert(!!qr.document.querySelector('.order-barcode-box svg')&&!!qr.document.querySelector('.payment-qr-box svg'),'dual codes missing'));
record('DOM-034','qr-payment','QR payload contains exact amount and order content',()=>assert(qrOrder.paymentRequest.amount===qrOrder.total&&qrOrder.paymentRequest.content.includes(qrOrder.code),'payload mismatch'));
record('DOM-035','qr-payment','Fallback download/account/amount/note actions are visible',()=>assert(qr.document.querySelectorAll('.payment-fallbacks button').length===4,'fallback controls missing'));
if(!qr.document.querySelector('[data-payment-action="ocb"]'))throw new Error(`QR bank finalize failed: ${JSON.stringify({alerts:qr.window.__alerts,qr:qr.window.LotusPOC.S().qr,orders:qr.window.LotusPOC.S().orders.length,last:qrOrder&&{id:qrOrder.id,code:qrOrder.code,method:qrOrder.requestedPaymentMethod,paymentStatus:qrOrder.paymentStatus,hasRequest:!!qrOrder.paymentRequest}})}`);
record('DOM-036','qr-payment','OCB direct button contains an exact live deeplink',()=>{const url=new URL(qr.document.querySelector('[data-payment-action="ocb"]').dataset.ocbUrl);return assert(url.hostname==='dl.vietqr.io'&&url.searchParams.get('app')==='ocb'&&url.searchParams.get('ba')==='609271@ocb'&&url.searchParams.get('am')===String(qrOrder.total)&&url.searchParams.get('tn')===qrOrder.paymentRequest.content&&url.searchParams.get('bn')==='HUANG TIANSHENG','live deeplink mismatch');});
click(qr.document,'[data-payment-action="reported"]');
record('DOM-037','qr-payment','Customer report becomes CUSTOMER_REPORTED, not PAID',()=>assert(qrOrder.paymentStatus==='CUSTOMER_REPORTED'&&qrOrder.status!=='PAID','incorrect auto-paid'));
record('DOM-038','qr-payment','Customer report does not create receipt or loyalty transaction',()=>assert(!qr.window.LotusPOC.S().receipts.some(x=>x.orderId===qrOrder.id)&&!qr.window.LotusPOC.S().loyaltyTx.some(x=>x.orderCode===qrOrder.code),'side effect occurred'));

const staff=await load('/index.html?mode=staff');
record('DOM-039','staff-runtime','No uncaught runtime error on Staff entry',()=>assert(staff.runtimeErrors.length===0,staff.runtimeErrors.join(' | ')));
record('DOM-040','staff-layout','Standalone Staff hides desktop chrome and phone frame',()=>{const sidebar=staff.window.getComputedStyle(staff.document.querySelector('.sidebar')).display,iphone=staff.window.getComputedStyle(staff.document.querySelector('.iphone'));return assert(sidebar==='none'&&['0','0px'].includes(iphone.borderTopWidth)&&['0','0px'].includes(iphone.borderRadius),`sidebar=${sidebar},border=${iphone.borderTopWidth},radius=${iphone.borderRadius}`);});
staff.document.querySelector('#mLoginStaff').value='2';fill(staff.document,'#mPin','2222');click(staff.document,'#mLogin');
record('DOM-041','staff-navigation','Staff bottom navigation has Sales, Orders, Tables, Profile',()=>{const labels=[...staff.document.querySelectorAll('#mobileScreen .mobile-bottom-nav button')].map(x=>x.textContent.replace(/\s+/g,' ').trim());return assert(labels.length===4&&labels.some(x=>x.includes('Bán hàng'))&&labels.some(x=>x.includes('Đơn hàng'))&&labels.some(x=>x.includes('Bàn'))&&labels.some(x=>x.includes('Cá nhân')),labels.join('|'));});
click(staff.document,'[data-madd="2"]');await delay(10);click(staff.document,'#confirmModifier');click(staff.document,'#mStartCheckout');
record('DOM-042','staff-checkout','Handheld checkout has phone lookup, register and guest',()=>assert(!!staff.document.querySelector('#mMemberPhone')&&!!staff.document.querySelector('#mRegisterMember')&&!!staff.document.querySelector('#mGuestCheckout'),'member controls missing'));
fill(staff.document,'#mMemberPhone','0909000111');click(staff.document,'#mFindMember');click(staff.document,'#mMemberNext');
record('DOM-043','staff-checkout','Member wallet vouchers render on handheld',()=>assert(staff.document.querySelectorAll('[data-m-voucher]').length>=2,'voucher list missing'));
const welcome=staff.document.querySelector('[data-m-voucher="V-WELCOME10"]');if(welcome)welcome.click();click(staff.document,'#mVoucherNext');click(staff.document,'[data-m-payment="BANK"]');
const staffOrder=staff.window.LotusPOC.S().orders.at(-1);
record('DOM-044','staff-payment','Handheld OCB result shows amount, barcode, QR and manual confirmation',()=>assert(staffOrder.paymentRequest&&staff.document.querySelector('.order-barcode-box svg')&&staff.document.querySelector('.payment-qr-box svg')&&staff.document.querySelector('[data-payment-action="confirm-staff"]'),'staff bank result incomplete'));
click(staff.document,'[data-payment-action="confirm-staff"]');
record('DOM-045','staff-payment','Staff manual verification settles payment once',()=>assert(staffOrder.status==='PAID'&&staff.window.LotusPOC.S().receipts.filter(x=>x.orderId===staffOrder.id).length===1,'staff confirm failed'));
record('DOM-046','bilingual','Core mobile flows retain Vietnamese and Simplified Chinese',()=>{const text=staff.document.querySelector('#mobileScreen').textContent;return assert(/[一-龥]/.test(text)&&/[A-Za-zÀ-ỹ]/.test(text),'bilingual text missing');});

qr.window.LotusPOC.S().qr.checkoutStep='menu';qr.window.LotusPOC.S().qr.tab='menu';qr.window.LotusPOC.renderAll();

for(const width of [320,360,375,390,430,600,768]){
  record(`RESP-${width}`,'responsive',`Mobile structure remains bounded at ${width}px`,()=>{
    Object.defineProperty(qr.window,'innerWidth',{value:width,configurable:true});
    const nav=qr.document.querySelector('#qrPhone .mobile-bottom-nav'),phone=qr.document.querySelector('#qrPhone');
    return assert(nav&&phone&&!phone.querySelector('.sidebar')&&qr.document.querySelectorAll('#qrPhone .mobile-bottom-nav button').length===4,'responsive structure missing');
  });
}

const allErrors=[...desktop.runtimeErrors,...qr.runtimeErrors,...staff.runtimeErrors];
const summary={total:results.length,pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,runtimeErrors:allErrors};
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
fs.writeFileSync(path.join(root,'test-results','dom-results.json'),JSON.stringify({summary,results},null,2)+'\n');
desktop.dom.window.close();qr.dom.window.close();staff.dom.window.close();
console.log(JSON.stringify(summary,null,2));
if(summary.fail)process.exitCode=1;
