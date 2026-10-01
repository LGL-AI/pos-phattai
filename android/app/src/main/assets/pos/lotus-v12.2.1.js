(function(){
'use strict';

const ENHANCED_VERSION='12.2.3-PHAT-TAI-APK';
const MENU_CATALOG_VERSION='PHAT_TAI_2026_09_22_V1';
const APPROVED_OCB={bankName:'OCB - Ngân hàng TMCP Phương Đông',bankBin:'970448',accountNumber:'609271',accountName:'HUANG TIANSHENG',allowRealDeeplink:true};
const LICENSE_TZ='Asia/Ho_Chi_Minh';
const PERMISSIONS=[
  {id:'manage_staff',vi:'Quản lý nhân viên',cn:'管理员工'},
  {id:'manage_roles',vi:'Tạo vai trò và phân quyền',cn:'创建角色与权限'},
  {id:'manage_tables',vi:'Quản lý bàn',cn:'管理桌台'},
  {id:'manage_products',vi:'Quản lý sản phẩm',cn:'管理商品'},
  {id:'manage_inventory',vi:'Nhập và điều chỉnh kho',cn:'进货与库存调整'},
  {id:'manage_vouchers',vi:'Quản lý voucher',cn:'管理优惠券'},
  {id:'manage_loyalty',vi:'Quản lý loyalty',cn:'管理会员体系'},
  {id:'configure_bank',vi:'Cấu hình OCB cửa hàng',cn:'配置门店OCB账户'},
  {id:'view_reports',vi:'Xem báo cáo',cn:'查看报表'},
  {id:'export_data',vi:'Xuất dữ liệu',cn:'导出数据'},
  {id:'create_orders',vi:'Tạo đơn hàng',cn:'创建订单'},
  {id:'confirm_payments',vi:'Xác nhận thanh toán',cn:'确认收款'},
  {id:'view_store_license',vi:'Xem trạng thái license cửa hàng',cn:'查看门店授权状态'}
];
const ALL_PERMISSION_IDS=PERMISSIONS.map(x=>x.id);
const UNIT_OPTIONS=['g','kg','ml','l','cái'];
const DEFAULT_ROLES=[
  {id:'STORE_OWNER',nameVi:'Chủ cửa hàng',nameCn:'店主',system:true,permissions:[...ALL_PERMISSION_IDS]},
  {id:'MANAGER',nameVi:'Quản lý',nameCn:'经理',system:true,permissions:['manage_staff','manage_tables','manage_products','manage_inventory','manage_vouchers','manage_loyalty','view_reports','export_data','create_orders','confirm_payments','view_store_license']},
  {id:'CASHIER',nameVi:'Thu ngân',nameCn:'收银员',system:true,permissions:['create_orders','confirm_payments']}
];
const DEFAULT_INGREDIENTS=[
  {id:'ING-COFFEE',sku:'NL001',name:'Hạt cà phê',nameCn:'咖啡豆',unit:'g',stock:15000,minStock:3000,expectedRestock:'2026-10-05'},
  {id:'ING-MILK',sku:'NL002',name:'Sữa tươi',nameCn:'鲜奶',unit:'ml',stock:30000,minStock:6000,expectedRestock:'2026-10-03'},
  {id:'ING-WATER',sku:'NL003',name:'Nước lọc',nameCn:'饮用水',unit:'ml',stock:120000,minStock:20000,expectedRestock:'2026-10-04'},
  {id:'ING-ICE',sku:'NL004',name:'Đá viên',nameCn:'冰块',unit:'g',stock:45000,minStock:8000,expectedRestock:'2026-10-02'},
  {id:'ING-TEA',sku:'NL005',name:'Trà',nameCn:'茶叶',unit:'g',stock:7000,minStock:1200,expectedRestock:'2026-10-06'},
  {id:'ING-PEACH',sku:'NL006',name:'Siro đào',nameCn:'桃子糖浆',unit:'ml',stock:8500,minStock:1500,expectedRestock:'2026-10-04'},
  {id:'ING-ORANGE',sku:'NL007',name:'Cam tươi',nameCn:'鲜橙',unit:'g',stock:26000,minStock:5000,expectedRestock:'2026-10-02'},
  {id:'ING-POTATO',sku:'NL008',name:'Khoai tây',nameCn:'土豆',unit:'g',stock:18000,minStock:3500,expectedRestock:'2026-10-03'},
  {id:'ING-OIL',sku:'NL009',name:'Dầu chiên',nameCn:'炸油',unit:'ml',stock:12000,minStock:2200,expectedRestock:'2026-10-03'},
  {id:'ING-BREAD',sku:'NL010',name:'Bánh mì',nameCn:'面包',unit:'g',stock:12000,minStock:2500,expectedRestock:'2026-10-02'},
  {id:'ING-BUTTER',sku:'NL011',name:'Bơ',nameCn:'黄油',unit:'g',stock:4500,minStock:900,expectedRestock:'2026-10-05'},
  {id:'ING-GARLIC',sku:'NL012',name:'Tỏi',nameCn:'大蒜',unit:'g',stock:2500,minStock:400,expectedRestock:'2026-10-05'},
  {id:'ING-CHICKEN',sku:'NL013',name:'Thịt gà',nameCn:'鸡肉',unit:'g',stock:22000,minStock:4500,expectedRestock:'2026-10-02'},
  {id:'ING-RICE',sku:'NL014',name:'Gạo',nameCn:'大米',unit:'g',stock:40000,minStock:7000,expectedRestock:'2026-10-06'},
  {id:'ING-BEEF',sku:'NL015',name:'Thịt bò',nameCn:'牛肉',unit:'g',stock:18000,minStock:3800,expectedRestock:'2026-10-02'},
  {id:'ING-NOODLE',sku:'NL016',name:'Mì',nameCn:'面条',unit:'g',stock:20000,minStock:3500,expectedRestock:'2026-10-05'},
  {id:'ING-BROTH',sku:'NL017',name:'Nước dùng',nameCn:'汤底',unit:'ml',stock:30000,minStock:5500,expectedRestock:'2026-10-03'},
  {id:'ING-SAUCE',sku:'NL018',name:'Sốt',nameCn:'酱汁',unit:'ml',stock:9000,minStock:1600,expectedRestock:'2026-10-04'},
  {id:'ING-PORK-HOCK',sku:'NL019',name:'Giò heo',nameCn:'猪脚',unit:'g',stock:30000,minStock:5000,expectedRestock:'2026-10-03'},
  {id:'ING-DUCK',sku:'NL020',name:'Vịt quay',nameCn:'烧鸭',unit:'g',stock:30000,minStock:5000,expectedRestock:'2026-10-03'},
  {id:'ING-CHARSIU',sku:'NL021',name:'Xá xíu',nameCn:'叉烧',unit:'g',stock:22000,minStock:4000,expectedRestock:'2026-10-03'},
  {id:'ING-INTESTINE',sku:'NL022',name:'Phá lấu',nameCn:'卤大肠',unit:'g',stock:18000,minStock:3000,expectedRestock:'2026-10-03'},
  {id:'ING-SEAFOOD',sku:'NL023',name:'Hải sản',nameCn:'海鲜',unit:'g',stock:18000,minStock:3000,expectedRestock:'2026-10-03'},
  {id:'ING-PORK-SLICE',sku:'NL024',name:'Thịt lát',nameCn:'肉片',unit:'g',stock:18000,minStock:3000,expectedRestock:'2026-10-03'}
];
const DEFAULT_RECIPES={
  1:[{ingredientId:'ING-COFFEE',qty:20,unit:'g'},{ingredientId:'ING-WATER',qty:180,unit:'ml'}],
  2:[{ingredientId:'ING-COFFEE',qty:18,unit:'g'},{ingredientId:'ING-MILK',qty:120,unit:'ml'},{ingredientId:'ING-ICE',qty:120,unit:'g'}],
  3:[{ingredientId:'ING-TEA',qty:8,unit:'g'},{ingredientId:'ING-PEACH',qty:30,unit:'ml'},{ingredientId:'ING-WATER',qty:220,unit:'ml'},{ingredientId:'ING-ICE',qty:100,unit:'g'}],
  4:[{ingredientId:'ING-ORANGE',qty:250,unit:'g'},{ingredientId:'ING-ICE',qty:80,unit:'g'}],
  5:[{ingredientId:'ING-POTATO',qty:200,unit:'g'},{ingredientId:'ING-OIL',qty:20,unit:'ml'}],
  6:[{ingredientId:'ING-BREAD',qty:120,unit:'g'},{ingredientId:'ING-BUTTER',qty:20,unit:'g'},{ingredientId:'ING-GARLIC',qty:5,unit:'g'}],
  7:[{ingredientId:'ING-CHICKEN',qty:180,unit:'g'},{ingredientId:'ING-RICE',qty:200,unit:'g'}],
  8:[{ingredientId:'ING-BEEF',qty:120,unit:'g'},{ingredientId:'ING-NOODLE',qty:180,unit:'g'},{ingredientId:'ING-BROTH',qty:350,unit:'ml'}],
  9:[{ingredientId:'ING-BEEF',qty:180,unit:'g'},{ingredientId:'ING-RICE',qty:200,unit:'g'},{ingredientId:'ING-SAUCE',qty:30,unit:'ml'}],
  10:[],
  101:[{ingredientId:'ING-PORK-HOCK',qty:180,unit:'g'},{ingredientId:'ING-DUCK',qty:120,unit:'g'},{ingredientId:'ING-CHICKEN',qty:120,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  102:[{ingredientId:'ING-PORK-HOCK',qty:160,unit:'g'},{ingredientId:'ING-DUCK',qty:120,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  103:[{ingredientId:'ING-PORK-HOCK',qty:160,unit:'g'},{ingredientId:'ING-CHICKEN',qty:120,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  104:[{ingredientId:'ING-PORK-HOCK',qty:160,unit:'g'},{ingredientId:'ING-CHARSIU',qty:120,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  105:[{ingredientId:'ING-CHICKEN',qty:120,unit:'g'},{ingredientId:'ING-DUCK',qty:120,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  106:[{ingredientId:'ING-DUCK',qty:120,unit:'g'},{ingredientId:'ING-CHARSIU',qty:120,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  107:[{ingredientId:'ING-PORK-HOCK',qty:200,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  108:[{ingredientId:'ING-DUCK',qty:220,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  109:[{ingredientId:'ING-PORK-HOCK',qty:180,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  110:[{ingredientId:'ING-DUCK',qty:180,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  111:[{ingredientId:'ING-INTESTINE',qty:180,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  112:[{ingredientId:'ING-CHICKEN',qty:180,unit:'g'},{ingredientId:'ING-RICE',qty:250,unit:'g'}],
  113:[{ingredientId:'ING-SEAFOOD',qty:150,unit:'g'},{ingredientId:'ING-PORK-SLICE',qty:100,unit:'g'},{ingredientId:'ING-BROTH',qty:350,unit:'ml'}]
};

function clone(value){return JSON.parse(JSON.stringify(value));}
function roleById(id,state=S()){return (state.roles||[]).find(r=>r.id===id);}
function currentStoreActor(state=S()){return state.staff.find(x=>x.id===state.session?.storeStaffId)||state.staff[0];}
function hasPermission(permission,state=S(),staff=currentStoreActor(state)){
  if(!staff)return false;
  const role=roleById(staff.role,state);
  return !!role?.permissions?.includes(permission);
}
function roleLabel(id,state=S()){
  const r=roleById(id,state);
  return r?`${r.nameVi} / ${r.nameCn}`:id;
}
function ingredient(id,state=S()){return state.inventory?.ingredients?.find(x=>x.id===id);}
function localDateAdd(date,days){
  const [y,m,d]=String(date).split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
}
function dayNumber(date){
  const [y,m,d]=String(date).split('-').map(Number);
  return Math.floor(Date.UTC(y,m-1,d)/86400000);
}
function vietnamNowString(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:LICENSE_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}
function parseLocalMoment(value){
  const safe=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value||''))?String(value):vietnamNowString();
  return{raw:safe,date:safe.slice(0,10),time:safe.slice(11,16)};
}
function migrateEnhancedState(state){
  state.version=ENHANCED_VERSION;
  state.settings=state.settings||{};
  if(!state.settings.storeName||state.settings.storeName==='LOTUS DEMO CAFE')state.settings.storeName='TIỆM SÍU LẬP PHÁT TÀI';
  if(!state.settings.phone||state.settings.phone==='0900 000 000')state.settings.phone='038-288-4612';
  const previousBank=state.settings.bankPayment||{};
  const previousAccount=String(previousBank.accountNumber||'').replace(/\s/g,'');
  if(!previousAccount||/^0+$/.test(previousAccount))state.settings.bankPayment=clone(APPROVED_OCB);
  else state.settings.bankPayment=Object.assign({bankName:'OCB - Ngân hàng TMCP Phương Đông',bankBin:'970448',allowRealDeeplink:false},previousBank);
  if(/^0+$/.test(String(state.settings.bankPayment.accountNumber||'')))state.settings.bankPayment.allowRealDeeplink=false;
  state.roles=Array.isArray(state.roles)&&state.roles.length?state.roles:clone(DEFAULT_ROLES);
  for(const fixed of DEFAULT_ROLES){
    const existing=state.roles.find(r=>r.id===fixed.id);
    if(!existing)state.roles.push(clone(fixed));
    else{
      existing.nameVi=existing.nameVi||fixed.nameVi;
      existing.nameCn=existing.nameCn||fixed.nameCn;
      existing.permissions=Array.isArray(existing.permissions)?existing.permissions:clone(fixed.permissions);
      existing.system=existing.id==='STORE_OWNER'?true:existing.system!==false;
    }
  }
  for(const staff of state.staff||[]){
    if(staff.role==='Admin')staff.role='STORE_OWNER';
    if(staff.role==='Manager')staff.role='MANAGER';
    if(staff.role==='Cashier')staff.role='CASHIER';
    if(!roleById(staff.role,state))staff.role='CASHIER';
  }
  state.session=state.session||{};
  if(state.session.storeStaffId==null)state.session.storeStaffId=state.staff?.[0]?.id||1;
  state.inventory=state.inventory||{};
  state.inventory.ingredients=Array.isArray(state.inventory.ingredients)&&state.inventory.ingredients.length?state.inventory.ingredients:clone(DEFAULT_INGREDIENTS);
  for(const fixedIngredient of DEFAULT_INGREDIENTS){
    if(!state.inventory.ingredients.some(item=>item.id===fixedIngredient.id))state.inventory.ingredients.push(clone(fixedIngredient));
  }
  state.inventory.movements=Array.isArray(state.inventory.movements)?state.inventory.movements:[];
  state.inventory.restockPlans=Array.isArray(state.inventory.restockPlans)?state.inventory.restockPlans:[];
  if(state.menuCatalogVersion!==MENU_CATALOG_VERSION&&Array.isArray(window.PHAT_TAI_PRODUCTS)){
    state.products=clone(window.PHAT_TAI_PRODUCTS);
    state.posCart=[];
    if(state.mobile){state.mobile.cart=[];state.mobile.customerCart=[];state.mobile.checkout={step:'member',customerId:null,voucherId:null,paymentMethod:null,orderId:null};}
    if(state.qr){state.qr.cart=[];state.qr.checkoutStep='menu';state.qr.lastOrderId=null;}
    state.menuCatalogVersion=MENU_CATALOG_VERSION;
  }
  for(const p of state.products||[]){
    if(!Array.isArray(p.recipe))p.recipe=clone(DEFAULT_RECIPES[p.id]||[]);
  }
  state.connectivity=state.connectivity||{};
  if(state.connectivity.offline==null)state.connectivity.offline=false;
  if(!state.connectivity.lastOnlineAt)state.connectivity.lastOnlineAt=nowISO();
  state.qr=state.qr||{};
  if(!state.qr.tab)state.qr.tab='menu';
  if(!['menu','cart','offers','account'].includes(state.qr.tab))state.qr.tab='menu';
  state.mobile=state.mobile||{};
  let nativePosApp=false;
  try{nativePosApp=new URL(window.location.href).searchParams.get('native')==='1';}catch(error){}
  if(nativePosApp){if(!['checkout','menu','orders','tables','profile'].includes(state.mobile.tab))state.mobile.tab='menu';state.mobile.authBypass=false;}
  if(state.mobile.tab==='cart')state.mobile.tab='menu';
  state.license=state.license||{};
  const licenseDefaults={tenantId:'TENANT-ECHO-001',status:'ACTIVE',expiryDate:'2026-09-30',virtualNow:'2026-09-26T10:00',serverReachable:true,lastSuccessfulLicenseSyncAt:'2026-09-21T05:00',lastEvaluatedBusinessDate:null,suspensionReason:null,deviceConfirmedLocked:false,jobRuns:[],audit:[]};
  for(const [key,value] of Object.entries(licenseDefaults))if(state.license[key]===undefined)state.license[key]=clone(value);
  state.license.jobRuns=Array.isArray(state.license.jobRuns)?state.license.jobRuns:[];
  state.license.audit=Array.isArray(state.license.audit)?state.license.audit:[];
  state.licenseDemo=state.licenseDemo||{};
  if(state.licenseDemo.systemAdminSession==null)state.licenseDemo.systemAdminSession=false;
  if(state.licenseDemo.lastManualActionToken===undefined)state.licenseDemo.lastManualActionToken=null;
  return state;
}

migrateEnhancedState(S());
LotusDB.save();
const originalReset=LotusDB.reset.bind(LotusDB);
LotusDB.reset=function(){
  this.state=seedState();
  migrateEnhancedState(this.state);
  this.save();
  Bus.emit('db.reset',{});
  renderAll();
};

function licenseExpectedStatus(expiryDate,localMoment){
  const m=parseLocalMoment(localMoment);
  const diff=dayNumber(m.date)-dayNumber(expiryDate);
  const atFive=m.time>='05:00';
  if(diff<-3)return 'ACTIVE';
  if(diff===-3&&!atFive)return 'ACTIVE';
  if(diff<0)return 'EXPIRING_SOON';
  if(diff===0&&!atFive)return 'EXPIRING_SOON';
  if(diff<3)return 'GRACE';
  if(diff===3&&!atFive)return 'GRACE';
  return 'SUSPENDED';
}
function licenseStatusMessage(status){
  const map={
    ACTIVE:['License đang hoạt động','授权有效'],
    EXPIRING_SOON:['License sắp hết hạn. Vui lòng chuẩn bị gia hạn.','授权即将到期，请准备续期。'],
    GRACE:['Hệ thống sẽ giữ quyền sử dụng trong 2 ngày, vui lòng thanh toán sớm','系统将保留两天使用权限，请尽快付款。'],
    SUSPENDED:['Đã ngừng nhận đơn mới; dữ liệu và đơn cũ vẫn xem/xử lý được.','已停止接收新订单；历史数据与旧订单仍可处理。'],
    OFFLINE_LOCKED:['Thiết bị quá 10 ngày chưa đồng bộ License Server; đã ngừng nhận đơn mới.','设备超过10天未同步授权服务器；已停止接收新订单。']
  };
  return map[status]||map.ACTIVE;
}
function addLicenseAudit(state,type,details={}){
  const l=state.license;
  l.audit.unshift({id:uid('LA'),type,actor:details.actor||'LICENSE_SCHEDULER',at:details.at||l.virtualNow||vietnamNowString(),details:clone(details)});
  l.audit=l.audit.slice(0,100);
}
function runLicenseDailyEvaluation(state=S(),localMoment=state.license.virtualNow){
  migrateEnhancedState(state);
  const l=state.license,m=parseLocalMoment(localMoment||vietnamNowString());
  l.virtualNow=m.raw;
  if(m.time<'05:00')return{ran:false,reason:'BEFORE_05',status:l.status};
  const key=`${l.tenantId}|${m.date}|DAILY_LICENSE`;
  const existing=l.jobRuns.find(x=>x.key===key);
  if(existing)return{ran:false,reason:'IDEMPOTENT',status:l.status,job:existing};
  const before=l.status;
  let calculated=licenseExpectedStatus(l.expiryDate,m.raw);
  let offlineDays=0;
  if(l.serverReachable){
    l.lastSuccessfulLicenseSyncAt=`${m.date}T05:00`;
    l.deviceConfirmedLocked=false;
    if(l.suspensionReason==='MANUAL')calculated='SUSPENDED';
  }else{
    offlineDays=dayNumber(m.date)-dayNumber(String(l.lastSuccessfulLicenseSyncAt||m.date).slice(0,10));
    if(offlineDays>10){calculated='OFFLINE_LOCKED';l.deviceConfirmedLocked=true;}
  }
  l.status=calculated;
  l.lastEvaluatedBusinessDate=m.date;
  const job={id:uid('LJOB'),key,tenantId:l.tenantId,businessDate:m.date,jobType:'DAILY_LICENSE',effectiveAt:`${m.date}T05:00`,executedAt:m.raw,delayed:m.time!=='05:00',statusBefore:before,statusAfter:l.status,serverReachable:l.serverReachable,offlineDays,result:'SUCCESS'};
  l.jobRuns.unshift(job);
  l.jobRuns=l.jobRuns.slice(0,100);
  addLicenseAudit(state,'DAILY_EVALUATION',{at:m.raw,statusBefore:before,statusAfter:l.status,businessDate:m.date,offlineDays,delayed:job.delayed});
  return{ran:true,status:l.status,job};
}
function setLicenseScenario(name,state=S()){
  const l=state.license,D=l.expiryDate;
  const scenarios={
    D_MINUS_4:`${localDateAdd(D,-4)}T05:00`,D_MINUS_3:`${localDateAdd(D,-3)}T05:00`,D:`${D}T05:00`,
    D_PLUS_1:`${localDateAdd(D,1)}T05:00`,D_PLUS_2:`${localDateAdd(D,2)}T05:00`,D_PLUS_3_0459:`${localDateAdd(D,3)}T04:59`,D_PLUS_3_0500:`${localDateAdd(D,3)}T05:00`
  };
  if(name==='OFFLINE_10'||name==='OFFLINE_11'){
    l.serverReachable=false;
    l.lastSuccessfulLicenseSyncAt='2026-10-01T05:00';
    l.virtualNow=name==='OFFLINE_10'?'2026-10-11T05:00':'2026-10-12T05:00';
  }else{
    l.serverReachable=true;
    l.virtualNow=scenarios[name]||vietnamNowString();
  }
  l.status='ACTIVE';
  l.suspensionReason=null;
  l.lastEvaluatedBusinessDate=null;
  l.jobRuns=[];
  l.deviceConfirmedLocked=false;
  if(parseLocalMoment(l.virtualNow).time>='05:00')runLicenseDailyEvaluation(state,l.virtualNow);
  LotusDB.save();
  Bus.emit('license.scenario',{name,virtualNow:l.virtualNow,status:l.status});
  return l.status;
}
function requireSystemAdmin(state=S()){
  if(!state.licenseDemo?.systemAdminSession)throw new Error('SYSTEM_ADMIN_REQUIRED');
}
function manualLicenseAction(action,options={},state=S()){
  requireSystemAdmin(state);
  const l=state.license,token=options.token||uid('ACTION');
  const prior=l.audit.find(x=>x.details?.token===token);
  if(prior)return{changed:false,idempotent:true,status:l.status};
  const before=l.status,oldExpiry=l.expiryDate;
  if(action==='RENEW'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(options.newExpiry||''))throw new Error('NEW_EXPIRY_REQUIRED');
    l.expiryDate=options.newExpiry;l.status='ACTIVE';l.suspensionReason=null;l.deviceConfirmedLocked=false;
  }else if(action==='SUSPEND'){
    l.status='SUSPENDED';l.suspensionReason='MANUAL';
  }else if(action==='RESTORE'){
    if(options.newExpiry)l.expiryDate=options.newExpiry;
    l.status=licenseExpectedStatus(l.expiryDate,l.virtualNow||vietnamNowString());
    if(l.status==='SUSPENDED')throw new Error('EXPIRY_MUST_BE_EXTENDED');
    l.suspensionReason=null;l.deviceConfirmedLocked=false;
  }else throw new Error('ACTION_NOT_SUPPORTED');
  addLicenseAudit(state,`MANUAL_${action}`,{actor:'SYSTEM_ADMIN_DEMO',token,reference:options.reference||'',statusBefore:before,statusAfter:l.status,oldExpiry,newExpiry:l.expiryDate,at:l.virtualNow});
  LotusDB.save();
  Bus.emit('license.manual_action',{action,status:l.status});
  return{changed:true,status:l.status};
}
function syncLicenseNow(state=S()){
  const l=state.license,m=parseLocalMoment(l.virtualNow||vietnamNowString());
  if(!l.serverReachable){addLicenseAudit(state,'MANUAL_SYNC_FAILED',{actor:currentStoreActor(state)?.role||'DEVICE',at:m.raw});return false;}
  l.lastSuccessfulLicenseSyncAt=m.raw;
  const calculated=licenseExpectedStatus(l.expiryDate,m.raw);
  l.status=l.suspensionReason==='MANUAL'?'SUSPENDED':calculated;
  l.deviceConfirmedLocked=false;
  addLicenseAudit(state,'MANUAL_SYNC_SUCCESS',{actor:currentStoreActor(state)?.role||'DEVICE',at:m.raw,statusAfter:l.status});
  LotusDB.save();return true;
}
function orderCreationBlockReason(state=S()){
  if(state.connectivity?.offline)return 'OFFLINE_DEMO_ORDER_BLOCKED';
  if(['SUSPENDED','OFFLINE_LOCKED'].includes(state.license?.status))return 'LICENSE_NEW_ORDERS_BLOCKED';
  return null;
}

function convertUnit(qty,from,to){
  const value=Number(qty||0);
  if(from===to)return value;
  if(from==='kg'&&to==='g')return value*1000;
  if(from==='g'&&to==='kg')return value/1000;
  if(from==='l'&&to==='ml')return value*1000;
  if(from==='ml'&&to==='l')return value/1000;
  throw new Error(`UNIT_MISMATCH:${from}:${to}`);
}
function calculateInventoryUsage(state,cart){
  const usage=new Map();
  for(const line of cart){
    const p=product(line.productId,state);
    for(const r of p?.recipe||[]){
      const ing=ingredient(r.ingredientId,state);
      if(!ing)throw new Error('INGREDIENT_NOT_FOUND');
      const baseQty=convertUnit(Number(r.qty)*Number(line.qty),r.unit,ing.unit);
      usage.set(ing.id,(usage.get(ing.id)||0)+baseQty);
    }
  }
  return [...usage].map(([ingredientId,qty])=>({ingredientId,qty}));
}
function commitInventoryForOrder(state,order){
  if(order.inventoryCommittedAt)return order.inventoryUsage||[];
  const usage=calculateInventoryUsage(state,order.items);
  for(const u of usage){
    const ing=ingredient(u.ingredientId,state);
    if(Number(ing.stock)<u.qty)throw new Error(`INGREDIENT_OUT_OF_STOCK:${ing.name}`);
  }
  for(const line of order.items){
    const p=product(line.productId,state);
    if(p)p.stock=Math.max(0,Number(p.stock)-Number(line.qty));
  }
  for(const u of usage){
    const ing=ingredient(u.ingredientId,state);
    ing.stock=Math.max(0,Number(ing.stock)-u.qty);
    state.inventory.movements.unshift({id:uid('MOV'),ingredientId:ing.id,qty:-u.qty,unit:ing.unit,type:'ORDER_ESTIMATE',reference:order.code,staffName:order.staffId?state.staff.find(x=>x.id===order.staffId)?.name||'Staff':'System',at:order.createdAt});
  }
  order.inventoryUsage=usage;
  order.inventoryCommittedAt=order.createdAt;
  return usage;
}
function responsibleStaffForDate(date,state=S()){
  const open=state.shifts.find(x=>x.status==='OPEN');
  if(open)return state.staff.find(x=>x.id===open.staffId)||state.staff[0];
  const schedule=state.schedules.find(x=>x.date===date&&x.type!=='LEAVE');
  return state.staff.find(x=>x.id===schedule?.staffId)||state.staff[0];
}
function applyInventoryEntry(data,state=S()){
  if(!hasPermission('manage_inventory',state))throw new Error('PERMISSION_DENIED');
  const ing=ingredient(data.ingredientId,state);
  if(!ing)throw new Error('INGREDIENT_NOT_FOUND');
  const date=data.date||today(),staff=responsibleStaffForDate(date,state);
  if(data.type==='PLAN'){
    const plan={id:uid('PLAN'),ingredientId:ing.id,qty:Number(data.qty),unit:data.unit,date,status:'SCHEDULED',staffId:staff.id,staffName:staff.name,supplier:data.supplier||'Nhà cung cấp / 供应商'};
    state.inventory.restockPlans.push(plan);
    return plan;
  }
  const baseQty=convertUnit(Number(data.qty),data.unit,ing.unit);
  const signed=data.type==='ADJUST_MINUS'?-Math.abs(baseQty):Math.abs(baseQty);
  if(Number(ing.stock)+signed<0)throw new Error('STOCK_CANNOT_BE_NEGATIVE');
  ing.stock=Number(ing.stock)+signed;
  const movement={id:uid('MOV'),ingredientId:ing.id,qty:signed,unit:ing.unit,type:data.type,reference:data.reference||data.supplier||'',staffId:staff.id,staffName:staff.name,at:nowISO()};
  state.inventory.movements.unshift(movement);
  return movement;
}

const coreServiceCreateOrder=serviceCreateOrder;
const coreServicePayOrder=servicePayOrder;
window.serviceCreateOrder=function(state,args){
  migrateEnhancedState(state);
  const blocked=orderCreationBlockReason(state);
  if(blocked)throw new Error(blocked);
  const usage=calculateInventoryUsage(state,args.cart||[]);
  for(const u of usage){const ing=ingredient(u.ingredientId,state);if(Number(ing.stock)<u.qty)throw new Error(`INGREDIENT_OUT_OF_STOCK:${ing.name}`);}
  const order=coreServiceCreateOrder(state,args);
  commitInventoryForOrder(state,order);
  return order;
};
window.servicePayOrder=function(state,orderId,method='CASH',received=0){
  migrateEnhancedState(state);
  const o=state.orders.find(x=>x.id===orderId);
  if(!o)throw new Error('ORDER_NOT_FOUND');
  if(o.status==='PAID')throw new Error('ALREADY_PAID');
  if(method==='CASH'&&Number(received||0)<o.total)throw new Error('INSUFFICIENT_CASH');
  if(!o.inventoryCommittedAt)commitInventoryForOrder(state,o);
  if(o.voucherId){
    const v=voucher(o.voucherId,state),c=customer(o.customerId,state),check=isVoucherEligible(v,c,o.subtotal,state);
    if(!check[0])throw new Error('VOUCHER_AT_PAYMENT:'+check[1]);
    v.qtyUsed++;
  }
  o.status='PAID';o.paymentStatus='PAID';if(o.paymentRequest)o.paymentRequest.status='PAID';
  o.payment={method,received:Number(received||o.total),change:method==='CASH'?Math.max(0,Number(received||0)-o.total):0};
  o.paidAt=nowISO();
  if(o.customerId){
    const c=customer(o.customerId,state),pts=Math.floor(o.total/Number(state.settings.pointsPer||10000));
    c.points+=pts;c.spend+=o.total;c.orders+=1;c.lastVisit=today();
    state.loyaltyTx.push({id:uid('LTX'),customerId:c.id,orderCode:o.code,points:pts,amount:o.total,at:nowISO()});
  }
  state.receipts.push({id:uid('REC'),orderId:o.id,orderCode:o.code,createdAt:nowISO()});
  return o;
};

const CODE39={
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
};
function barcodeSvg(value,height=78){
  const clean=String(value||'').toUpperCase().replace(/[^0-9A-Z. \-$\/+%]/g,'-');
  const encoded=`*${clean}*`;let x=10,bars='';
  for(const ch of encoded){
    const pattern=CODE39[ch]||CODE39['-'];
    for(let i=0;i<pattern.length;i++){
      const width=pattern[i]==='w'?3:1;
      if(i%2===0)bars+=`<rect x="${x}" y="4" width="${width}" height="${height-24}"/>`;
      x+=width;
    }
    x+=1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x+10} ${height}" role="img" aria-label="Mã vạch đơn ${esc(clean)}"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${bars}</g><text x="${(x+10)/2}" y="${height-5}" text-anchor="middle" font-family="monospace" font-size="11" fill="#111">${esc(clean)}</text></svg>`;
}
function buildOCBDeeplink(order,state=S()){
  const req=ensurePaymentRequest(order,state),bank=req.bank||{};
  const account=String(bank.accountNumber||'').replace(/\s/g,'');
  if(isDemoBank(bank)||!/^\d{6,24}$/.test(account)||!bank.allowRealDeeplink&&!state.settings.bankPayment.allowRealDeeplink)return null;
  const url=new URL('https://dl.vietqr.io/pay');
  url.searchParams.set('app','ocb');
  url.searchParams.set('ba',`${account}@ocb`);
  url.searchParams.set('am',String(Math.round(req.amount)));
  url.searchParams.set('tn',req.content);
  url.searchParams.set('bn',bank.accountName||'HUANG TIANSHENG');
  return url.toString();
}
function copyOne(label,value){
  const textValue=String(value??'');
  const done=()=>alert(`${label}: đã sao chép / 已复制`);
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(textValue).then(done).catch(()=>fallbackCopy(textValue,done));
  fallbackCopy(textValue,done);
}
function fallbackCopy(value,done){
  const t=document.createElement('textarea');t.value=value;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();done();
}
let bankSimulatorOrderId=null;
function openBankSimulator(order){
  const req=ensurePaymentRequest(order),link=buildOCBDeeplink(order);
  if(link){
    if(!confirm(`Mở OCB OMNI để thanh toán ${fmt(req.amount)} cho ${req.bank.accountName} · ${req.bank.accountNumber}?\nHãy kiểm tra đúng tên người nhận trong OCB trước khi xác nhận. Hệ thống vẫn chờ nhân viên kiểm tra tiền vào.\n\n打开OCB OMNI向 ${req.bank.accountName} · ${req.bank.accountNumber} 支付 ${fmt(req.amount)}？请在银行App内核对收款人，系统仍等待员工确认到账。`))return;
    req.deeplinkOpenedAt=nowISO();LotusDB.save();Bus.emit('payment.ocb_deeplink_opened',{code:order.code,amount:req.amount,account:req.bank.accountNumber});
    location.assign(link);
    return;
  }
  bankSimulatorOrderId=order.id;
  $('bankSimulatorBody').innerHTML=`<div class="demo-boundary"><b>DEMO — KHÔNG CHUYỂN TIỀN THẬT</b><span class="bi-cn">演示模式——不会发生真实转账</span></div><div class="bank-sim-screen" style="margin-top:12px"><div style="font-size:12px;opacity:.8">OCB OMNI · PAYMENT PREVIEW</div><h3 style="margin:7px 0 14px">${fmt(req.amount)}</h3><div class="sim-row"><span>Người nhận / 收款方</span><b>${esc(req.bank.accountName)}</b></div><div class="sim-row"><span>Tài khoản / 账号</span><b>${esc(req.bank.accountNumber)}</b></div><div class="sim-row"><span>Nội dung / 附言</span><b>${esc(req.content)}</b></div><div class="sim-row"><span>Mã đơn / 订单号</span><b>${esc(order.code)}</b></div></div><div class="bank-sim-warning">Bấm nút dưới đây chỉ mô phỏng khách đã báo chuyển khoản. Trạng thái vẫn là chờ nhân viên kiểm tra, không phải PAID.<span class="bi-cn" style="color:inherit">下方按钮只模拟顾客报告已转账，仍需员工核对，不会自动标记为已付款。</span></div><div class="form-actions"><button class="secondary" id="bankSimReturn">Quay lại / 返回</button><button class="good" id="bankSimReported">Tôi đã chuyển khoản / 我已转账</button></div>`;
  $('bankSimulatorModal').classList.add('show');
  $('bankSimReturn').onclick=()=>$('bankSimulatorModal').classList.remove('show');
  $('bankSimReported').onclick=()=>{
    markCustomerTransfer(order);LotusDB.save();Bus.emit('payment.customer_reported',{code:order.code,amount:order.total,source:'BANK_SIMULATOR'});
    $('bankSimulatorModal').classList.remove('show');renderAll();
  };
}
window.paymentCardHTML=function(order,mode='customer'){
  const req=ensurePaymentRequest(order),st=paymentStatusMeta(order),bank=req.bank||{},paid=st.cls==='paid',reported=st.cls==='reported',demo=isDemoBank(bank),direct=buildOCBDeeplink(order);
  return `<div class="payment-qr-card ${mode==='staff'?'compact-qr':''}"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="text-align:left"><small>Mã đơn / 订单号</small><div class="payment-code">${esc(order.code)}</div></div>${demo?'<span class="demo-ribbon">DEMO · 演示</span>':'<span class="license-state active">OCB · LIVE QR</span>'}</div><div class="payment-identifiers"><div class="order-barcode-box"><b>Mã vạch đơn hàng / 订单条码</b>${barcodeSvg(order.code,88)}</div><div><div class="payment-qr-box">${qrSvg(req.payload,220)}</div><b>QR ngân hàng / 银行二维码</b></div></div><div class="payment-amount">${fmt(req.amount)}</div><div class="payment-bank"><span>Ngân hàng / 银行</span><span>${esc(bank.bankName||bank.bankBin)}</span><span>Số tài khoản / 账号</span><span>${esc(bank.accountNumber)}</span><span>Chủ tài khoản / 户名</span><span>${esc(bank.accountName)}</span><span>Nội dung / 附言</span><span class="payment-code">${esc(req.content)}</span></div>${!demo?'<div class="notice goodn" style="text-align:left"><b>Tài khoản nhận tiền thật / 真实收款账户</b><span class="bi-cn" style="color:inherit">Vui lòng kiểm tra tên HUANG TIANSHENG trong ứng dụng ngân hàng trước khi xác nhận. / 付款前请在银行App内核对收款人姓名。</span></div>':''}<div class="payment-status-card ${st.cls}"><b>${st.vi}</b><span class="bi-cn" style="color:inherit">${st.cn}</span>${reported&&!paid?'<div class="tiny" style="margin-top:5px;color:inherit">Không tự động xác nhận đã thanh toán. / 系统不会自动确认到账。</div>':''}</div>${demo?'<div class="notice warnn" style="text-align:left">Tài khoản OCB demo 0000000000: nút bên dưới chỉ mở BANK SIMULATOR, không phát lệnh chuyển tiền thật.<span class="bi-cn" style="color:inherit">OCB演示账号：按钮只打开银行模拟器，不会发起真实转账。</span></div>':''}<button class="ocb-direct wide" data-payment-action="ocb" data-ocb-url="${esc(direct||'')}" ${paid?'disabled':''}>${direct?'CHUYỂN KHOẢN NGAY · OCB OMNI':'MỞ OCB OMNI · DEMO AN TOÀN'}<span class="bi-cn" style="color:inherit">${direct?'立即转账':'打开安全演示'}</span></button><div class="payment-fallbacks"><button class="secondary" data-payment-action="download">Tải ảnh QR / 下载二维码</button><button class="secondary" data-payment-action="copy-account">Sao chép tài khoản / 复制账号</button><button class="secondary" data-payment-action="copy-amount">Sao chép số tiền / 复制金额</button><button class="secondary" data-payment-action="copy-note">Sao chép nội dung / 复制附言</button></div>${mode==='customer'&&!paid?`<button class="good wide" data-payment-action="reported" style="margin-top:8px" ${reported?'disabled':''}>${reported?'ĐÃ BÁO NHÂN VIÊN / 已通知员工':'TÔI ĐÃ CHUYỂN KHOẢN / 我已转账'}</button>`:''}${mode==='staff'&&!paid?'<button class="good wide" data-payment-action="confirm-staff" style="margin-top:8px">ĐÃ KIỂM TRA TIỀN VÀO — XÁC NHẬN / 核对到账并确认</button>':''}<div class="payment-change-row"><button class="secondary" data-payment-action="change">Đổi phương thức / 更换方式</button>${mode==='customer'?`<button class="secondary" data-payment-action="new">${paid?'Đơn mới / 继续点餐':'Về menu / 返回菜单'}</button>`:''}</div></div>`;
};
window.cashResultHTML=function(order,mode='customer'){
  const paid=order.status==='PAID';
  return `<div class="cash-result"><div style="font-size:34px">${paid?'✓':'💵'}</div><small>Mã đơn / 订单号</small><div class="payment-code">${esc(order.code)}</div><div class="order-barcode-box" style="margin:10px 0">${barcodeSvg(order.code,88)}</div><div>${paid?'Đã nhận tiền mặt / 已收现金':'Thanh toán tiền mặt tại quầy / 到柜台支付现金'}</div><div class="payment-amount">${fmt(order.total)}</div><div class="payment-status-card ${paid?'paid':'pending'}"><b>${paid?'Thanh toán hoàn tất':'Đưa mã vạch hoặc mã đơn cho nhân viên'}</b><span class="bi-cn" style="color:inherit">${paid?'付款完成':'请向员工出示订单条码或订单号'}</span></div>${mode==='staff'&&!paid?'<button class="good wide" data-staff-cash-paid>XÁC NHẬN ĐÃ NHẬN TIỀN / 确认收现</button>':''}</div>`;
};
window.bindPaymentCard=function(scope,order,onNew,onChange){
  if(!scope)return;
  scope.querySelectorAll('[data-payment-action]').forEach(button=>button.onclick=()=>{
    const action=button.dataset.paymentAction,req=ensurePaymentRequest(order);
    if(action==='ocb')openBankSimulator(order);
    if(action==='download')downloadPaymentQR(order);
    if(action==='copy-account')copyOne('Số tài khoản',req.bank.accountNumber);
    if(action==='copy-amount')copyOne('Số tiền',String(Math.round(req.amount)));
    if(action==='copy-note')copyOne('Nội dung',req.content);
    if(action==='reported'){$('bankSimulatorModal').classList.remove('show');markCustomerTransfer(order);LotusDB.save();Bus.emit('payment.customer_reported',{code:order.code,amount:order.total});renderAll();}
    if(action==='confirm-staff'){
      if(!confirm('Chỉ xác nhận sau khi đã kiểm tra tiền vào tài khoản.\n请确认银行账户已到账。'))return;
      try{servicePayOrder(S(),order.id,'BANK',order.total);LotusDB.save();Bus.emit('payment.completed',{code:order.code,total:order.total,method:'BANK',channel:'MOBILE'});renderAll();}catch(error){alert(error.message);}
    }
    if(action==='change'){
      if(onChange)return onChange(order);
      order.requestedPaymentMethod='CASH';order.paymentStatus='PAY_AT_COUNTER';if(order.paymentRequest)order.paymentRequest.status='CANCELLED';LotusDB.save();renderAll();
    }
    if(action==='new'&&onNew)onNew();
  });
};

function mobileHeader(title,subtitle,badge='ONLINE'){
  return `<div class="m-head"><div style="display:flex;justify-content:space-between;gap:8px"><div><h3>${esc(title)}</h3><div class="m-small">${esc(subtitle)}</div></div><span class="m-pill">${esc(badge)}</span></div></div>`;
}
function staffSalesHTML(){
  const m=S().mobile,blocked=orderCreationBlockReason(),count=m.cart.reduce((sum,x)=>sum+x.qty,0);
  return `${blocked?'<div class="closed-card"><b>Cửa hàng tạm thời ngừng nhận đơn mới</b><span class="bi-cn">门店暂时停止接收新订单</span></div>':''}<div class="m-card"><div style="display:flex;gap:7px;align-items:center"><select id="mTable" style="flex:1"><option>T01</option><option>T02</option><option>T03</option><option>TAKEAWAY</option></select><span class="m-pill">${count} món / 件</span></div></div>${S().products.filter(p=>p.active).map(p=>`<div class="m-product"><div><b>${esc(p.name)}</b><div class="prod-cn">${esc(p.nameCn)}</div><small>${productPriceLabel(p)} · ${p.station} · ${p.stock}</small></div><button class="primary" data-madd="${p.id}" ${blocked||p.stock<=0?'disabled':''}>+</button></div>`).join('')}${m.cart.length?`<div class="m-card"><b>Giỏ hàng / 购物车</b>${m.cart.map((line,index)=>`<div class="qr-cart-line"><div><b>${esc(line.name)}</b><div class="tiny">${fmt(line.price*line.qty)}</div></div><div class="qty"><button data-mdec="${index}">−</button><b>${line.qty}</b><button data-minc="${index}">+</button></div></div>`).join('')}</div>`:''}<div class="cart-dock"><div><b>${count} món / 件</b><div>${fmt(cartTotal(m.cart))}</div></div><button class="good" id="mStartCheckout" ${m.cart.length&&!blocked?'':'disabled'}>Thanh toán / 结账</button></div>`;
}
function staffTablesHTML(){
  const current=S().mobile.table;
  return `<div class="m-card"><b>Chọn bàn phục vụ / 选择桌台</b><span class="bi-cn">Đơn mới sẽ gắn với bàn đang chọn / 新订单将关联当前桌台</span></div><div class="table-grid-mobile">${Array.from({length:16},(_,i)=>'T'+String(i+1).padStart(2,'0')).concat('TAKEAWAY').map(t=>`<button class="table-card-mobile ${current===t?'active':''}" data-m-table-card="${t}"><b>${t==='TAKEAWAY'?'Mang đi / 外带':`Bàn ${t} / ${t}桌`}</b><small style="display:block;margin-top:5px">${S().orders.filter(o=>o.table===t&&!['PAID','CANCELLED','SPLIT'].includes(o.status)).length} đơn đang mở / 进行中</small></button>`).join('')}</div>`;
}
function enhancedRenderMobile(){
  const m=S().mobile;
  if($('mobileModeStaff')){$('mobileModeStaff').classList.toggle('active',m.mode!=='customer');$('mobileModeCustomer').classList.toggle('active',m.mode==='customer');}
  if(m.mode==='customer'){renderMobileCustomer();return;}
  const staff=S().staff.find(x=>x.id===m.staffId)||S().staff[0];let html='';
  if(!m.loggedIn){
    html=`<div class="staff-shell">${mobileHeader('Phát Tài POS','POS cầm tay / 手持POS','LOGIN')}<div class="staff-main-scroll"><div class="m-card"><b>Đăng nhập nhân viên / 员工登录</b><div class="field" style="margin-top:10px"><label>Nhân viên / 员工</label><select id="mLoginStaff">${S().staff.map(s=>`<option value="${s.id}">${s.code} · ${esc(s.name)} · ${esc(roleLabel(s.role))}</option>`).join('')}</select></div><div class="field"><label>PIN</label><input id="mPin" value="2222" type="password" inputmode="numeric"></div><button class="primary wide" id="mLogin" style="margin-top:9px">Đăng nhập / 登录</button></div></div></div>`;
  }else if(m.tab==='checkout'){
    html=`<div class="staff-shell">${mobileHeader('Thanh toán / 结账',`${staff.name} · ${m.table}`,'CHECKOUT')}<div class="staff-main-scroll" style="padding-bottom:calc(18px + var(--safe-bottom))">${mobileStaffCheckoutHTML()}</div></div>`;
  }else{
    if(!['menu','orders','tables','profile'].includes(m.tab))m.tab='menu';
    const content=m.tab==='menu'?staffSalesHTML():m.tab==='orders'?mobileOrdersHTML():m.tab==='tables'?staffTablesHTML():mobileProfileHTML();
    html=`<div class="staff-shell">${mobileHeader(staff.name,`${roleLabel(staff.role)} · ${m.table}`)}<div class="staff-main-scroll">${content}</div><nav class="mobile-bottom-nav" aria-label="Điều hướng nhân viên / 员工导航"><button class="${m.tab==='menu'?'active':''}" data-mtab="menu"><span class="nav-icon">▦</span>Bán hàng<br><small>销售</small></button><button class="${m.tab==='orders'?'active':''}" data-mtab="orders"><span class="nav-icon">▤</span>Đơn hàng<br><small>订单</small></button><button class="${m.tab==='tables'?'active':''}" data-mtab="tables"><span class="nav-icon">▦</span>Bàn<br><small>桌台</small></button><button class="${m.tab==='profile'?'active':''}" data-mtab="profile"><span class="nav-icon">♙</span>Cá nhân<br><small>我的</small></button></nav></div>`;
  }
  $('mobileScreen').innerHTML=html;
  if($('mobileInspector'))$('mobileInspector').textContent=`Staff PWA · ${staff.code} · ${staff.role} · ${m.table}`;
  enhancedBindMobile();
}
function enhancedBindMobile(){
  const m=S().mobile;
  if(!m.loggedIn){
    if($('mLogin'))$('mLogin').onclick=()=>{const sid=Number($('mLoginStaff').value),st=S().staff.find(x=>x.id===sid);if(st&&st.pin===$('mPin').value){m.loggedIn=true;m.staffId=sid;m.tab='menu';LotusDB.save();Bus.emit('mobile.login',{staff:st.name});renderAll();}else alert('Sai PIN / PIN错误');};
    return;
  }
  if(m.tab==='checkout'){bindMobileStaffCheckout();return;}
  $$('[data-mtab]').forEach(b=>b.onclick=()=>{m.tab=b.dataset.mtab;LotusDB.save();renderMobile();});
  if($('mTable')){$('mTable').value=m.table;$('mTable').onchange=e=>{m.table=e.target.value;LotusDB.save();renderAll();};}
  $$('[data-m-table-card]').forEach(b=>b.onclick=()=>{m.table=b.dataset.mTableCard;m.tab='menu';LotusDB.save();Bus.emit('mobile.table.selected',{table:m.table});renderAll();});
  $$('[data-madd]').forEach(b=>b.onclick=()=>openModifier(product(b.dataset.madd),'MOBILE'));
  $$('[data-minc]').forEach(b=>b.onclick=()=>{m.cart[Number(b.dataset.minc)].qty++;LotusDB.save();renderAll();});
  $$('[data-mdec]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.mdec);m.cart[i].qty--;if(m.cart[i].qty<=0)m.cart.splice(i,1);LotusDB.save();renderAll();});
  if($('mStartCheckout'))$('mStartCheckout').onclick=()=>{if(orderCreationBlockReason())return alert('Cửa hàng tạm thời ngừng nhận đơn mới / 门店暂时停止接收新订单');m.checkout={step:'member',customerId:null,voucherId:null,paymentMethod:null,orderId:null};m.tab='checkout';LotusDB.save();Bus.emit('mobile.checkout.started',{staffId:m.staffId,table:m.table});renderAll();};
  if($('mClock'))$('mClock').onclick=()=>{const st=S().staff.find(x=>x.id===m.staffId),att=S().attendance.find(a=>a.staffId===st.id&&!a.clockOut);if(att){att.clockOut=nowISO();Bus.emit('attendance.out',{staff:st.name});}else{S().attendance.push({id:Date.now(),staffId:st.id,staffName:st.name,clockIn:nowISO(),clockOut:null});Bus.emit('attendance.in',{staff:st.name});}LotusDB.save();renderAll();};
  if($('mLogout'))$('mLogout').onclick=()=>{m.loggedIn=false;LotusDB.save();renderAll();};
}
window.renderMobile=enhancedRenderMobile;
window.bindMobile=enhancedBindMobile;

function qrHeader(title,subtitle){
  const q=S().qr;
  return `<div class="qr-hero"><div style="display:flex;justify-content:space-between;gap:8px"><div><b style="font-size:20px">${esc(title)}</b><div style="font-size:11px;opacity:.82">${esc(subtitle)}</div></div><div style="text-align:right">Bàn / 桌号<br><b>${esc(q.table)}</b></div></div></div>`;
}
const MOBILE_CATEGORY_LABELS={'Tất cả':'Tất cả / 全部','Đồ uống nóng':'Nóng / 热饮','Đồ uống lạnh':'Lạnh / 冷饮','Đồ ăn nhẹ':'Ăn nhẹ / 小吃','Đồ ăn no':'Món no / 主食','Dịch vụ':'Dịch vụ / 服务'};
function qrMenuContent(){
  const q=S().qr,blocked=orderCreationBlockReason();
  return `${blocked?'<div class="closed-card"><b>Cửa hàng tạm thời ngừng nhận đơn mới</b><span class="bi-cn">门店暂时停止接收新订单</span></div>':''}<div class="category-row">${categories().map(cat=>`<button class="cat-btn ${qrSelectedCat===cat?'active':''}" data-qrcat="${esc(cat)}">${esc(MOBILE_CATEGORY_LABELS[cat]||`${cat} / ${GROUP_CN[cat]||cat}`)}</button>`).join('')}</div>${S().products.filter(p=>p.active&&(qrSelectedCat==='Tất cả'||p.group===qrSelectedCat)).map(p=>`<div class="qr-product"><div><b>${esc(p.name)}</b><div class="prod-cn">${esc(p.nameCn)}</div><small>${productPriceLabel(p)} · ${p.stock>0?'Còn hàng / 有货':'Hết / 售罄'}</small></div><button class="primary" data-qradd="${p.id}" ${blocked||p.stock<=0?'disabled':''}>+</button></div>`).join('')}`;
}
function qrCartContent(){
  const q=S().qr,blocked=orderCreationBlockReason(),tot=cartTotal(q.cart);
  if(!q.cart.length)return '<div class="empty"><b>Giỏ hàng đang trống</b><span class="bi-cn">购物车为空</span></div>';
  return `<div class="qr-cart-list">${q.cart.map((line,index)=>`<div class="qr-cart-line"><div><b>${esc(line.name)}</b><div class="prod-cn">${esc(line.nameCn)}</div><div class="tiny">${fmt(line.price*line.qty)}</div></div><div class="qty"><button data-qrdec="${index}">−</button><b>${line.qty}</b><button data-qrinc="${index}">+</button></div></div>`).join('')}</div><div class="checkout-summary"><div class="checkout-summary-row total"><span>Tổng tạm tính / 暂计</span><span>${fmt(tot)}</span></div></div>${blocked?'<div class="closed-card">Cửa hàng tạm thời ngừng nhận đơn mới<span class="bi-cn">门店暂时停止接收新订单</span></div>':''}<button class="good wide" id="qrCheckout" ${blocked?'disabled':''}>THANH TOÁN / 结账</button>`;
}
function qrOffersContent(){
  const c=customer(S().qr.customerId);
  if(!c)return `<div class="m-card"><b>Đăng nhập để xem ưu đãi / 登录查看优惠</b><button class="primary wide" id="qrTabLogin" style="margin-top:9px">Đăng nhập / 登录</button><button class="purple wide" id="qrTabRegister" style="margin-top:8px">Đăng ký / 注册</button></div>`;
  return `<div class="loyalty-card"><b>${esc(c.name)}</b><div>${c.code} · ${tierFor(c.points)} · ${c.points} pts</div></div>${c.wallet.map(id=>voucher(id)).filter(Boolean).map(v=>`<div class="voucher-mini ${voucherRemaining(v)<=0?'disabled':''}"><b>${esc(v.code)} · ${esc(v.name)}</b><div class="prod-cn">${esc(v.nameCn)}</div><small>Min ${fmt(v.minSpend)} · Còn ${voucherRemaining(v)}</small></div>`).join('')||'<div class="empty">Chưa có ưu đãi / 暂无优惠</div>'}`;
}
function qrAccountContent(){
  const c=customer(S().qr.customerId);
  if(!c)return `<div class="m-card"><b>Tài khoản thành viên / 会员账户</b><p class="tiny">Đăng nhập hoặc đăng ký để tích điểm và dùng voucher.</p><button class="primary wide" id="qrTabLogin">Đăng nhập / 登录</button><button class="purple wide" id="qrTabRegister" style="margin-top:8px">Đăng ký khách mới / 注册新会员</button></div><div class="notice">Bạn vẫn có thể đặt món như khách vãng lai. / 游客也可以点餐。</div>`;
  return `<div class="loyalty-card"><b>${esc(c.name)}</b><div>${esc(c.phone)} · ${esc(c.code)}</div><div style="display:flex;justify-content:space-between;margin-top:10px"><span><b style="font-size:24px">${c.points}</b> pts</span><span>${tierFor(c.points)}</span></div></div><div class="m-card"><b>Lịch sử / 历史</b><div>${c.orders} đơn · ${fmt(c.spend)}</div></div><button class="secondary wide" id="qrLogout">Đăng xuất / 退出</button>`;
}
function enhancedRenderQR(){
  const q=S().qr;
  if(q.checkoutStep&&q.checkoutStep!=='menu'){renderQRCheckout();renderQRInspector();renderTierMap();return;}
  const count=q.cart.reduce((sum,x)=>sum+x.qty,0),content=q.tab==='cart'?qrCartContent():q.tab==='offers'?qrOffersContent():q.tab==='account'?qrAccountContent():qrMenuContent();
  $('qrPhone').innerHTML=`<div class="qr-shell">${qrHeader('Echo Coffee','Quét QR gọi món · 扫码点餐')}<div class="qr-main-scroll">${S().connectivity.offline?'<div class="offline-card"><b>Đang ngoại tuyến — chỉ xem menu đã lưu</b><span class="bi-cn">当前离线——仅可查看已缓存菜单</span></div>':''}${content}</div><nav class="mobile-bottom-nav" aria-label="Điều hướng khách hàng / 顾客导航"><button class="${q.tab==='menu'?'active':''}" data-qr-tab="menu"><span class="nav-icon">☕</span>Menu<br><small>菜单</small></button><button class="${q.tab==='cart'?'active':''}" data-qr-tab="cart"><span class="nav-icon">▣</span>Giỏ ${count}<br><small>购物车</small></button><button class="${q.tab==='offers'?'active':''}" data-qr-tab="offers"><span class="nav-icon">◇</span>Ưu đãi<br><small>优惠</small></button><button class="${q.tab==='account'?'active':''}" data-qr-tab="account"><span class="nav-icon">♙</span>Tài khoản<br><small>账户</small></button></nav></div>`;
  enhancedBindQR();renderQRInspector();renderTierMap();
}
function enhancedBindQR(){
  const q=S().qr;
  $$('[data-qr-tab]').forEach(b=>b.onclick=()=>{q.tab=b.dataset.qrTab;LotusDB.save();renderQR();});
  $$('[data-qrcat]').forEach(b=>b.onclick=()=>{qrSelectedCat=b.dataset.qrcat;renderQR();});
  $$('[data-qradd]').forEach(b=>b.onclick=()=>openModifier(product(b.dataset.qradd),'QR'));
  $$('[data-qrinc]').forEach(b=>b.onclick=()=>{q.cart[Number(b.dataset.qrinc)].qty++;LotusDB.save();renderAll();});
  $$('[data-qrdec]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.qrdec);q.cart[i].qty--;if(q.cart[i].qty<=0)q.cart.splice(i,1);LotusDB.save();renderAll();});
  if($('qrCheckout'))$('qrCheckout').onclick=()=>{if(orderCreationBlockReason())return alert('Cửa hàng tạm thời ngừng nhận đơn mới / 门店暂时停止接收新订单');q.checkoutStep='member';LotusDB.save();renderAll();};
  if($('qrTabLogin'))$('qrTabLogin').onclick=()=>openAuthModal('QR','login');
  if($('qrTabRegister'))$('qrTabRegister').onclick=()=>openAuthModal('QR','register');
  if($('qrLogout'))$('qrLogout').onclick=()=>{q.customerId=null;q.voucherId=null;LotusDB.save();Bus.emit('customer.logout',{context:'QR'});renderAll();};
  if($('qrCheckoutLogin'))$('qrCheckoutLogin').onclick=()=>openAuthModal('QR_CHECKOUT','login');
  if($('qrCheckoutRegister'))$('qrCheckoutRegister').onclick=()=>openAuthModal('QR_CHECKOUT','register');
  if($('qrGuestNext'))$('qrGuestNext').onclick=()=>{q.customerId=null;q.checkoutStep='voucher';LotusDB.save();renderAll();};
  if($('qrMemberNext'))$('qrMemberNext').onclick=()=>{q.checkoutStep='voucher';LotusDB.save();renderAll();};
  if($('qrChangeMember'))$('qrChangeMember').onclick=()=>{q.customerId=null;q.voucherId=null;LotusDB.save();renderAll();};
  $$('[data-qr-checkout-voucher]').forEach(b=>b.onclick=()=>{q.voucherId=b.dataset.qrCheckoutVoucher||null;LotusDB.save();renderAll();});
  if($('qrVoucherNext'))$('qrVoucherNext').onclick=()=>{q.checkoutStep='payment';LotusDB.save();renderAll();};
  $$('[data-qr-payment]').forEach(b=>b.onclick=()=>finalizeQRCheckout(b.dataset.qrPayment));
  $$('[data-qr-back]').forEach(b=>b.onclick=()=>{q.checkoutStep=b.dataset.qrBack;if(q.checkoutStep==='menu')q.tab='cart';LotusDB.save();renderAll();});
}
window.renderQR=enhancedRenderQR;
window.bindQR=enhancedBindQR;
window.renderQRInspector=function(){
  const root=$('qrAccountInspector');if(!root)return;
  const c=customer(S().qr.customerId),bank=S().settings.bankPayment;
  root.innerHTML=`${c?`<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><small>Điểm</small><strong>${c.points}</strong></div><div class="kpi"><small>Tier</small><strong>${tierFor(c.points)}</strong></div><div class="kpi"><small>Voucher</small><strong>${c.wallet.length}</strong></div></div><div class="notice goodn">${esc(c.name)} · ${esc(c.phone)}</div>`:'<div class="notice">Khách chưa đăng nhập / 顾客尚未登录</div>'}<div class="m-card" style="margin-top:12px"><b>Thông tin nhận tiền chỉ đọc / 收款信息只读</b><div class="payment-bank"><span>Ngân hàng / 银行</span><span>OCB · ${esc(bank.bankBin)}</span><span>Tài khoản / 账号</span><span>${esc(bank.accountNumber)}</span><span>Chủ tài khoản / 户名</span><span>${esc(bank.accountName)}</span></div><div class="tiny">Chỉ Store Settings mới được sửa cấu hình này. / 仅可在门店设置中修改。</div></div>`;
};

function ingredientOptions(selected=''){
  return S().inventory.ingredients.map(i=>`<option value="${i.id}" ${i.id===selected?'selected':''}>${esc(i.sku)} · ${esc(i.name)} / ${esc(i.nameCn)}</option>`).join('');
}
function addRecipeRow(value={ingredientId:'',qty:1,unit:'g'}){
  const row=document.createElement('div');row.className='recipe-row';
  row.innerHTML=`<select class="recipe-ingredient">${ingredientOptions(value.ingredientId)}</select><input class="recipe-qty" type="number" min="0.001" step="0.001" value="${Number(value.qty||1)}"><select class="recipe-unit">${UNIT_OPTIONS.map(u=>`<option ${u===value.unit?'selected':''}>${u}</option>`).join('')}</select><button type="button" class="danger recipe-remove">×</button>`;
  row.querySelector('.recipe-remove').onclick=()=>row.remove();
  $('pRecipeRows').appendChild(row);
}
function readRecipeRows(){
  return $$('#pRecipeRows .recipe-row').map(row=>({ingredientId:row.querySelector('.recipe-ingredient').value,qty:Number(row.querySelector('.recipe-qty').value),unit:row.querySelector('.recipe-unit').value})).filter(x=>x.ingredientId&&x.qty>0);
}
const baseResetProductForm=resetProductForm;
window.resetProductForm=function(){baseResetProductForm();if($('pRecipeRows')){$('pRecipeRows').innerHTML='';addRecipeRow();}};
const baseEditProduct=editProduct;
window.editProduct=function(id){baseEditProduct(id);$('pRecipeRows').innerHTML='';const recipe=product(id).recipe||[];(recipe.length?recipe:[{}]).forEach(addRecipeRow);};
function bindEnhancedProductForm(){
  if($('addRecipeRow'))$('addRecipeRow').onclick=()=>addRecipeRow();
  if(!$('pRecipeRows').children.length)addRecipeRow();
  $('newProductBtn').onclick=resetProductForm;$('cancelProductBtn').onclick=resetProductForm;
  $('productForm').onsubmit=e=>{
    e.preventDefault();
    if(!hasPermission('manage_products'))return alert('Không có quyền / 无权限');
    const id=Number($('pId').value),old=id?product(id):null;
    const obj={id:id||Date.now(),sku:$('pSku').value.trim(),icon:$('pIcon').value.trim()||'◼',name:$('pName').value.trim(),nameCn:$('pNameCn').value.trim(),group:$('pGroup').value,station:$('pStation').value,price:Number($('pPrice').value||0),largePrice:Number(old?.largePrice||$('pPrice').value||0),stock:Number($('pStock').value||0),active:old?.active!==false,image:$('pImageData').value||'',size:$('pSize').value==='true',spicy:old?.spicy===true,sugar:$('pSugar').value==='true',recipe:readRecipeRows()};
    const index=S().products.findIndex(x=>x.id===id);if(index>=0)S().products[index]=obj;else S().products.push(obj);
    LotusDB.save();Bus.emit('product.saved',{sku:obj.sku,recipeLines:obj.recipe.length});resetProductForm();renderAll();
  };
}
function renderInventory(){
  const root=$('inventoryRoot');if(!root)return;
  const can=hasPermission('manage_inventory'),actor=currentStoreActor(),openShift=S().shifts.find(x=>x.status==='OPEN'),movements=S().inventory.movements.slice(0,15),plans=[...S().inventory.restockPlans].sort((a,b)=>a.date.localeCompare(b.date));
  root.innerHTML=`<div class="inventory-grid"><div class="panel panel-pad"><div class="section-title"><div><h3>Kho nguyên liệu / 原料库存</h3><div class="meta">Ước tính trừ ngay khi tạo đơn; thanh toán không trừ lần hai. / 创建订单时预扣，付款时不重复扣减。</div></div><span class="chip">${S().inventory.ingredients.length} nguyên liệu</span></div><div class="table-wrap"><table class="table"><thead><tr><th>SKU</th><th>Nguyên liệu / 原料</th><th>Tồn</th><th>Mức tối thiểu</th><th>Dự kiến nhập</th></tr></thead><tbody>${S().inventory.ingredients.map(i=>`<tr><td>${esc(i.sku)}</td><td><b>${esc(i.name)}</b><div class="prod-cn">${esc(i.nameCn)}</div></td><td class="stock-number ${i.stock<=i.minStock?'stock-low':'stock-ok'}">${money(i.stock)} ${i.unit}</td><td>${money(i.minStock)} ${i.unit}</td><td>${esc(i.expectedRestock||'—')}</td></tr>`).join('')}</tbody></table></div></div><div class="settings-stack"><div class="panel panel-pad"><h3 style="margin-top:0">Nhập/điều chỉnh kho / 入库与调整</h3><div class="notice">Người phụ trách tự lấy từ ca đang mở: <b>${esc(openShift?.staffName||actor?.name||'—')}</b><span class="bi-cn" style="color:inherit">负责人按当前班次自动确定</span></div><div class="field" style="margin-top:9px"><label>Nguyên liệu / 原料</label><select id="invIngredient">${ingredientOptions()}</select></div><div class="form-grid" style="margin-top:8px"><div class="field"><label>Loại / 类型</label><select id="invType"><option value="RECEIPT">Nhập hàng / 入库</option><option value="ADJUST_PLUS">Tăng điều chỉnh / 调增</option><option value="ADJUST_MINUS">Giảm điều chỉnh / 调减</option><option value="PLAN">Lập lịch nhập / 进货计划</option></select></div><div class="field"><label>Số lượng / 数量</label><input id="invQty" type="number" min="0.001" step="0.001" value="1000"></div><div class="field"><label>Đơn vị / 单位</label><select id="invUnit">${UNIT_OPTIONS.map(u=>`<option>${u}</option>`).join('')}</select></div><div class="field"><label>Ngày dự kiến / 预计日期</label><input id="invDate" type="date" value="${today()}"></div><div class="field full"><label>Nhà cung cấp/chứng từ / 供应商或单据</label><input id="invReference" placeholder="Fresh Milk VN / NK-001"></div></div><button class="primary wide" id="saveInventoryEntry" style="margin-top:9px" ${can?'':'disabled'}>Ghi nhận / 保存记录</button>${can?'':'<div class="tiny" style="color:#b91c1c;margin-top:6px">Vai trò hiện tại không có quyền kho / 当前角色无库存权限</div>'}</div><div class="panel panel-pad"><h3 style="margin-top:0">Lịch nhập sắp tới / 近期进货</h3>${plans.length?plans.map(p=>{const i=ingredient(p.ingredientId);return `<div class="movement"><span>◷</span><div><b>${esc(i?.name||p.ingredientId)}</b><div class="tiny">${esc(p.supplier)} · ${esc(p.staffName)}</div></div><strong>${p.date}<br>${p.qty} ${p.unit}</strong></div>`}).join(''):'<div class="empty">Chưa có lịch / 暂无计划</div>'}</div></div></div><div class="panel panel-pad" style="margin-top:16px"><h3 style="margin-top:0">Biến động kho gần nhất / 最近库存变动</h3><div class="movement-list">${movements.length?movements.map(m=>{const i=ingredient(m.ingredientId);return `<div class="movement"><strong class="${m.qty>=0?'in':'out'}">${m.qty>=0?'+':''}${money(m.qty)} ${m.unit}</strong><div><b>${esc(i?.name||m.ingredientId)}</b><div class="tiny">${esc(m.type)} · ${esc(m.reference||'—')}</div></div><small>${esc(m.staffName||'System')}<br>${new Date(m.at).toLocaleString('vi-VN')}</small></div>`}).join(''):'<div class="empty">Chưa có biến động / 暂无变动</div>'}</div></div>`;
  if($('saveInventoryEntry'))$('saveInventoryEntry').onclick=()=>{try{applyInventoryEntry({ingredientId:$('invIngredient').value,type:$('invType').value,qty:Number($('invQty').value),unit:$('invUnit').value,date:$('invDate').value,reference:$('invReference').value,supplier:$('invReference').value});LotusDB.save();Bus.emit('inventory.entry',{type:$('invType').value,ingredientId:$('invIngredient').value});renderAll();}catch(error){alert(error.message);}};
}

function permissionsMatrixHTML(canEdit){
  const roles=S().roles;
  return `<div class="table-wrap"><table class="permission-matrix"><thead><tr><th>Quyền / 权限</th>${roles.map(r=>`<th>${esc(r.nameVi)}<span class="bi-cn">${esc(r.nameCn)}</span></th>`).join('')}</tr></thead><tbody>${PERMISSIONS.map(p=>`<tr><td><b>${esc(p.vi)}</b><span class="bi-cn">${esc(p.cn)}</span></td>${roles.map(r=>{const checked=r.permissions.includes(p.id),locked=r.id==='STORE_OWNER'||!canEdit;return `<td>${locked?`<span class="locked-cell">${checked?'✓':'—'}</span>`:`<input type="checkbox" data-role-permission="${r.id}|${p.id}" ${checked?'checked':''} aria-label="${esc(r.nameVi)} ${esc(p.vi)}">`}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderStoreSettings(){
  const root=$('storeSettingsRoot');if(!root)return;
  const actor=currentStoreActor(),canRoles=hasPermission('manage_roles'),canStaff=hasPermission('manage_staff'),canBank=hasPermission('configure_bank'),bank=S().settings.bankPayment,l=S().license,msg=licenseStatusMessage(l.status);
  root.innerHTML=`<div class="section-title"><div><h3>Cài đặt cửa hàng / 门店设置</h3><div class="meta">Quyền nội bộ của tenant; không phải LotusAI System Admin. / 门店内部权限，不等同于平台系统管理员。</div></div><div class="field"><label>Vai trò đang mô phỏng / 当前演示身份</label><select id="storeActor">${S().staff.map(s=>`<option value="${s.id}" ${s.id===actor.id?'selected':''}>${esc(s.name)} · ${esc(roleLabel(s.role))}</option>`).join('')}</select></div></div><div class="settings-grid"><div class="settings-stack"><div class="panel panel-pad"><div class="section-title"><div><h3>Ma trận phân quyền / 权限矩阵</h3><div class="meta">Chủ cửa hàng có thể ủy quyền Manager hoặc vai trò tự tạo.</div></div><span class="chip">${canRoles?'Có quyền sửa / 可编辑':'Chỉ xem / 只读'}</span></div>${permissionsMatrixHTML(canRoles)}<div class="panel" style="padding:12px;margin-top:12px;background:#f8fafc"><h4 style="margin:0 0 8px">Tạo vai trò mới / 创建新角色</h4><div class="form-grid"><div class="field"><label>Tên VN</label><input id="newRoleVi"></div><div class="field"><label>中文名称</label><input id="newRoleCn"></div></div><div class="permission-grid">${PERMISSIONS.map(p=>`<label class="permission-check"><input type="checkbox" data-new-role-permission="${p.id}"><span>${esc(p.vi)}<small>${esc(p.cn)}</small></span></label>`).join('')}</div><button class="primary" id="createRole" ${canRoles?'':'disabled'}>Tạo vai trò / 创建角色</button></div></div><div class="panel panel-pad"><h3 style="margin-top:0">Nhân viên & vai trò / 员工与角色</h3><div class="table-wrap"><table class="table"><thead><tr><th>Mã</th><th>Nhân viên</th><th>Vai trò</th></tr></thead><tbody>${S().staff.map((s,index)=>`<tr><td>${esc(s.code)}</td><td>${esc(s.name)}</td><td><select data-staff-role="${s.id}" ${!canStaff||index===0?'disabled':''}>${S().roles.map(r=>`<option value="${r.id}" ${r.id===s.role?'selected':''}>${esc(r.nameVi)} / ${esc(r.nameCn)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Mã nhân viên</label><input id="newStaffCode"></div><div class="field"><label>Tên nhân viên / 员工姓名</label><input id="newStaffName"></div><div class="field"><label>PIN</label><input id="newStaffPin" type="password" inputmode="numeric"></div><div class="field"><label>Vai trò / 角色</label><select id="newStaffRole">${S().roles.filter(r=>r.id!=='STORE_OWNER').map(r=>`<option value="${r.id}">${esc(r.nameVi)} / ${esc(r.nameCn)}</option>`).join('')}</select></div></div><button class="primary" id="createStaff" style="margin-top:9px" ${canStaff?'':'disabled'}>Thêm nhân viên / 新增员工</button></div></div><div class="settings-stack"><div class="panel panel-pad"><h3 style="margin-top:0">Tài khoản nhận tiền OCB / OCB收款账户</h3><div class="notice goodn"><b>Đang dùng tài khoản nhận tiền thật / 当前使用真实收款账户</b><span class="bi-cn" style="color:inherit">Tiền khách mua hàng đi vào tài khoản OCB chủ tiệm; không liên quan phí license LotusAI. / 顾客款项进入店主OCB账户，与软件授权费无关。</span></div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Ngân hàng / 银行</label><input value="OCB - Ngân hàng TMCP Phương Đông" readonly></div><div class="field"><label>BIN</label><input value="970448" readonly></div><div class="field full"><label>Số tài khoản / 账号</label><input id="settingsBankAccount" inputmode="numeric" value="${esc(bank.accountNumber)}" ${canBank?'':'readonly'}></div><div class="field full"><label>Chủ tài khoản / 户名</label><input id="settingsBankName" value="${esc(bank.accountName)}" ${canBank?'':'readonly'}></div><label class="permission-check full"><input id="allowRealDeeplink" type="checkbox" ${bank.allowRealDeeplink?'checked':''} ${canBank&&!isDemoBank(bank)?'':'disabled'}><span>Cho phép nút Chuyển khoản ngay qua OCB OMNI<small>允许通过OCB OMNI立即转账</small></span></label></div><button class="primary wide" id="saveBankSettings" style="margin-top:9px" ${canBank?'':'disabled'}>Lưu cấu hình OCB / 保存OCB配置</button><div class="tiny" style="margin-top:7px">Trước khi nhận tiền, luôn kiểm tra OCB hiển thị đúng HUANG TIANSHENG. Không lưu OTP, PIN hoặc khóa ngân hàng trong POC.</div></div><div class="panel panel-pad"><div class="section-title"><h3>License cửa hàng / 门店授权</h3><span class="license-state ${l.status.toLowerCase()}">${l.status}</span></div><b>Hạn / 到期: ${esc(l.expiryDate)}</b><p>${esc(msg[0])}<span class="bi-cn">${esc(msg[1])}</span></p><button class="secondary" id="syncLicenseNow">Đồng bộ license ngay / 立即同步授权</button><div class="tiny" style="margin-top:7px">Chỉ xem. Gia hạn/tạm ngưng/khôi phục thuộc LotusAI System Admin.</div></div><div class="panel panel-pad"><h3 style="margin-top:0">Dữ liệu & PWA / 数据与PWA</h3><div class="form-actions"><button class="secondary" id="exportStoreData">Xuất backup JSON / 导出备份</button><button class="primary" id="installPwa">Cài ứng dụng / 安装应用</button></div><div class="install-help" style="margin-top:10px"><div class="install-step"><b>1</b><span>Android/SUNMI: mở bằng Chrome tương thích → Install app.<span class="bi-cn">使用兼容Chrome并选择安装应用。</span></span></div><div class="install-step"><b>2</b><span>iPhone: Safari → Chia sẻ → Thêm vào Màn hình chính.<span class="bi-cn">Safari → 分享 → 添加到主屏幕。</span></span></div></div><div class="tiny" style="margin-top:8px">PWA không phải APK; máy in/scanner SUNMI cần native bridge/SDK và UAT phần cứng.</div></div></div></div>`;
  bindStoreSettings();
}
function bindStoreSettings(){
  $('storeActor').onchange=e=>{S().session.storeStaffId=Number(e.target.value);LotusDB.save();Bus.emit('demo.actor.changed',{staffId:S().session.storeStaffId});renderAll();};
  $$('[data-role-permission]').forEach(input=>input.onchange=()=>{if(!hasPermission('manage_roles'))return;const [roleId,permission]=input.dataset.rolePermission.split('|'),role=roleById(roleId);role.permissions=input.checked?[...new Set([...role.permissions,permission])]:role.permissions.filter(x=>x!==permission);LotusDB.save();Bus.emit('role.permission.changed',{roleId,permission,enabled:input.checked});renderAll();});
  $$('[data-staff-role]').forEach(select=>select.onchange=()=>{if(!hasPermission('manage_staff'))return;const st=S().staff.find(x=>x.id===Number(select.dataset.staffRole));if(st&&st!==S().staff[0]){st.role=select.value;LotusDB.save();Bus.emit('staff.role.changed',{staffId:st.id,role:st.role});renderAll();}});
  $('createRole').onclick=()=>{if(!hasPermission('manage_roles'))return alert('Không có quyền / 无权限');const vi=$('newRoleVi').value.trim(),cn=$('newRoleCn').value.trim();if(!vi||!cn)return alert('Nhập đủ tên VN và 中文');const id=`CUSTOM_${Date.now().toString(36).toUpperCase()}`,permissions=$$('[data-new-role-permission]:checked').map(x=>x.dataset.newRolePermission);S().roles.push({id,nameVi:vi,nameCn:cn,system:false,permissions});LotusDB.save();Bus.emit('role.created',{roleId:id});renderAll();};
  $('createStaff').onclick=()=>{if(!hasPermission('manage_staff'))return alert('Không có quyền / 无权限');const code=$('newStaffCode').value.trim(),name=$('newStaffName').value.trim(),pin=$('newStaffPin').value.trim();if(!code||!name||pin.length<4)return alert('Nhập mã, tên và PIN tối thiểu 4 số');if(S().staff.some(x=>x.code===code))return alert('Mã nhân viên đã tồn tại');S().staff.push({id:Date.now(),code,name,pin,role:$('newStaffRole').value,active:true});LotusDB.save();Bus.emit('staff.created',{code});renderAll();};
  $('saveBankSettings').onclick=()=>{if(!hasPermission('configure_bank'))return alert('Không có quyền / 无权限');const account=$('settingsBankAccount').value.replace(/\s/g,''),accountName=$('settingsBankName').value.trim();if(!/^\d{6,24}$/.test(account)||!accountName)return alert('Thông tin tài khoản không hợp lệ / 账户信息无效');const demo=/^0+$/.test(account),allow=!demo&&$('allowRealDeeplink').checked;if(allow&&!confirm('Chỉ bật sau khi đã UAT OCB OMNI trên thiết bị thật. Tiếp tục?\n仅在真实设备验收后启用。继续？'))return;S().settings.bankPayment={bankName:'OCB - Ngân hàng TMCP Phương Đông',bankBin:'970448',accountNumber:account,accountName,allowRealDeeplink:allow};LotusDB.save();Bus.emit('payment.bank_config.updated',{bankBin:'970448',demo});renderAll();};
  $('syncLicenseNow').onclick=()=>{const ok=syncLicenseNow();alert(ok?'Đồng bộ thành công / 同步成功':'Không thể kết nối License Server demo / 无法连接授权服务器');renderAll();};
  $('exportStoreData').onclick=()=>{if(!hasPermission('export_data'))return alert('Không có quyền xuất dữ liệu / 无导出权限');const blob=new Blob([JSON.stringify(S(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`lotus-pos-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  $('installPwa').onclick=async()=>{if(window.__lotusInstallPrompt){window.__lotusInstallPrompt.prompt();await window.__lotusInstallPrompt.userChoice;window.__lotusInstallPrompt=null;}else alert('Dùng menu trình duyệt → Cài ứng dụng/Thêm vào màn hình chính. PWA cần HTTPS hoặc localhost.\n请使用浏览器菜单安装应用，需HTTPS或localhost。');};
}

function licenseAuditHTML(){
  const l=S().license;
  return l.audit.length?l.audit.map(a=>`<div class="audit-item"><b>${esc(a.type)}</b> · ${esc(a.actor)}<div>${esc(a.at)}</div><code>${esc(JSON.stringify(a.details))}</code></div>`).join(''):'<div class="empty">Chưa có audit / 暂无审计记录</div>';
}
function renderLicenseSimulator(){
  const root=$('licenseSimulatorRoot');if(!root)return;
  const l=S().license,m=parseLocalMoment(l.virtualNow),offlineDays=dayNumber(m.date)-dayNumber(String(l.lastSuccessfulLicenseSyncAt).slice(0,10)),msg=licenseStatusMessage(l.status),admin=S().licenseDemo.systemAdminSession;
  root.innerHTML=`<div class="section-title"><div><h3>LotusAI Admin Console — DEMO</h3><div class="meta">Mô phỏng browser-local; không phải backend khóa từ xa thật. / 浏览器本地模拟，并非真实远程授权服务。</div></div><span class="license-state ${l.status.toLowerCase()}">${l.status}</span></div><div class="demo-boundary"><b>RANH GIỚI DEMO / 演示边界</b><div>Bất kỳ ai xem source đều có thể vượt qua mô phỏng này. Không dùng để quản lý khách thật; production cần VPS, MFA, signed lease và RBAC backend.</div><span class="bi-cn" style="color:inherit">静态源码可被绕过，不可用于真实客户管理；生产环境需要VPS、MFA、签名租约及后端权限控制。</span></div><div class="system-admin-bar ${admin?'signed-in':''}" style="margin-top:14px"><div><b>${admin?'SYSTEM_ADMIN DEMO đang hoạt động':'Chưa mở phiên SYSTEM_ADMIN DEMO'}</b><span class="bi-cn">${admin?'系统管理员演示会话已开启':'尚未开启系统管理员演示会话'}</span></div><button class="${admin?'secondary':'primary'}" id="toggleSystemAdmin">${admin?'Đóng phiên / 退出':'Mở phiên DEMO / 开启演示'}</button></div><div class="license-sim-grid"><div class="settings-stack"><div class="panel panel-pad"><div class="section-title"><h3>Virtual clock · ${LICENSE_TZ}</h3><span class="chip">1 lần/ngày · 05:00</span></div><div class="license-clock"><input id="licenseVirtualNow" type="datetime-local" value="${esc(l.virtualNow)}"><button class="primary" id="runLicenseJob">Chạy lượt 05:00 / 执行</button></div><label class="permission-check" style="margin-top:9px"><input id="licenseServerReachable" type="checkbox" ${l.serverReachable?'checked':''}><span>License Server kết nối được<small>授权服务器可连接</small></span></label><div class="scenario-grid" style="margin-top:10px">${[['D_MINUS_4','D−4 · 05:00'],['D_MINUS_3','D−3 · 05:00'],['D','D · 05:00'],['D_PLUS_1','D+1 · 05:00'],['D_PLUS_2','D+2 · 05:00'],['D_PLUS_3_0459','D+3 · 04:59'],['D_PLUS_3_0500','D+3 · 05:00'],['OFFLINE_10','Offline đúng 10 ngày'],['OFFLINE_11','Offline quá 10 ngày']].map(x=>`<button class="secondary" data-license-scenario="${x[0]}">${x[1]}</button>`).join('')}</div></div><div class="panel panel-pad"><div class="section-title"><h3>Trạng thái tenant / 租户状态</h3><span class="license-state ${l.status.toLowerCase()}">${l.status}</span></div><div class="kpi-grid" style="grid-template-columns:repeat(2,1fr)"><div class="kpi"><small>Ngày hết hạn</small><strong style="font-size:17px">${esc(l.expiryDate)}</strong></div><div class="kpi"><small>Virtual now</small><strong style="font-size:14px">${esc(l.virtualNow)}</strong></div><div class="kpi"><small>Last sync</small><strong style="font-size:14px">${esc(l.lastSuccessfulLicenseSyncAt)}</strong></div><div class="kpi"><small>Không liên lạc</small><strong>${Math.max(0,offlineDays)} ngày</strong></div></div><div class="notice ${['SUSPENDED','OFFLINE_LOCKED'].includes(l.status)?'warnn':'goodn'}">${esc(msg[0])}<span class="bi-cn" style="color:inherit">${esc(msg[1])}</span></div><div class="contact-state ${!l.serverReachable?'lost':''}" style="margin-top:10px"><span class="indicator"></span><span>${l.serverReachable?'Đang liên lạc / 已连接':l.deviceConfirmedLocked?'Đã nhận xác nhận khóa / 已确认设备锁定':'Nghi ngờ bị khóa do offline / 疑似因离线被锁'}</span></div></div><div class="panel panel-pad"><h3 style="margin-top:0">Thao tác thủ công SYSTEM_ADMIN / 系统管理员手动操作</h3><div class="form-grid"><div class="field"><label>Hạn mới / 新到期日</label><input id="licenseNewExpiry" type="date" value="${localDateAdd(l.expiryDate,30)}"></div><div class="field"><label>Chứng từ/ghi chú / 凭证备注</label><input id="licenseReference" value="DEMO-RECEIPT-001"></div></div><div class="system-admin-controls" style="margin-top:10px"><button class="good" data-license-action="RENEW" ${admin?'':'disabled'}>Gia hạn & mở lại / 续期并恢复</button><button class="danger" data-license-action="SUSPEND" ${admin?'':'disabled'}>Tạm ngưng / 暂停</button><button class="secondary" data-license-action="RESTORE" ${admin?'':'disabled'}>Khôi phục / 恢复</button><button class="secondary" id="clearLicenseDemo" ${admin?'':'disabled'}>Reset simulator / 重置模拟</button></div></div></div><div class="settings-stack"><div class="panel panel-pad"><h3 style="margin-top:0">Job runs · idempotency</h3><div class="audit-list">${l.jobRuns.length?l.jobRuns.map(j=>`<div class="audit-item"><b>${esc(j.businessDate)} · ${esc(j.statusBefore)} → ${esc(j.statusAfter)}</b><div>${j.delayed?'BACKFILL / CHẠY BÙ':'05:00 ON TIME'} · ${j.serverReachable?'ONLINE':'OFFLINE'} · ${j.offlineDays} ngày</div><code>${esc(j.key)}</code></div>`).join(''):'<div class="empty">Chưa chạy / 尚未执行</div>'}</div></div><div class="panel panel-pad"><h3 style="margin-top:0">License audit / 授权审计</h3><div class="audit-list">${licenseAuditHTML()}</div></div></div></div>`;
  bindLicenseSimulator();
}
function bindLicenseSimulator(){
  $('toggleSystemAdmin').onclick=()=>{S().licenseDemo.systemAdminSession=!S().licenseDemo.systemAdminSession;LotusDB.save();Bus.emit('license.admin_demo_session',{open:S().licenseDemo.systemAdminSession});renderAll();};
  $('licenseServerReachable').onchange=e=>{S().license.serverReachable=e.target.checked;LotusDB.save();renderLicenseSimulator();};
  $('runLicenseJob').onclick=()=>{S().license.virtualNow=$('licenseVirtualNow').value;const result=runLicenseDailyEvaluation();LotusDB.save();Bus.emit('license.daily_evaluated',{status:S().license.status,reason:result.reason||'RUN'});renderAll();};
  $$('[data-license-scenario]').forEach(b=>b.onclick=()=>{setLicenseScenario(b.dataset.licenseScenario);renderAll();});
  $$('[data-license-action]').forEach(b=>b.onclick=()=>{try{const token=`${b.dataset.licenseAction}|${$('licenseReference').value}|${$('licenseNewExpiry').value}`;manualLicenseAction(b.dataset.licenseAction,{newExpiry:$('licenseNewExpiry').value,reference:$('licenseReference').value,token});renderAll();}catch(error){alert(error.message);}});
  $('clearLicenseDemo').onclick=()=>{if(!S().licenseDemo.systemAdminSession)return;S().license=Object.assign(S().license,{status:'ACTIVE',expiryDate:'2026-09-30',virtualNow:'2026-09-26T10:00',serverReachable:true,lastSuccessfulLicenseSyncAt:'2026-09-21T05:00',lastEvaluatedBusinessDate:null,suspensionReason:null,deviceConfirmedLocked:false,jobRuns:[],audit:[]});LotusDB.save();Bus.emit('license.simulator.reset',{});renderAll();};
}

const baseRenderNav=renderNav;
window.renderNav=function(){
  baseRenderNav();
  const titles={settings:'Cài đặt cửa hàng / 门店设置',license:'LotusAI Admin DEMO / 授权管理演示'};
  if(titles[S().activeView])$('pageTitle').textContent=titles[S().activeView];
};
function renderLicenseBanner(){
  let banner=$('licenseNoticeBanner');
  if(!banner){banner=document.createElement('div');banner.id='licenseNoticeBanner';const top=document.querySelector('.topbar');top?.insertAdjacentElement('afterend',banner);}
  const actor=currentStoreActor(),role=actor?.role,status=S().license.status;
  if(!['STORE_OWNER','MANAGER'].includes(role)||status==='ACTIVE'||document.body.classList.contains('standalone-qr')||document.body.classList.contains('standalone-staff')){banner.hidden=true;return;}
  const msg=licenseStatusMessage(status);banner.hidden=false;banner.className=`license-banner ${['SUSPENDED','OFFLINE_LOCKED'].includes(status)?'locked':''}`;banner.innerHTML=`<div><strong>${esc(msg[0])}</strong><span class="bi-cn">${esc(msg[1])}</span></div><span class="license-state ${status.toLowerCase()}">${status}</span>`;
}
function updateOrderButtonsForState(){
  const blocked=!!orderCreationBlockReason();
  if($('posCreateOrder')){$('posCreateOrder').disabled=blocked||!S().posCart.length;$('posCreateOrder').title=blocked?'Cửa hàng tạm ngừng nhận đơn mới':'';}
}
function updatePwaBanner(){
  const banner=$('pwaStatusBanner');if(!banner)return;
  if(S().connectivity.offline){banner.hidden=false;banner.className='pwa-status-banner offline';banner.innerHTML='Đang ngoại tuyến — chỉ xem dữ liệu đã lưu; không thể gửi đơn mới. / 当前离线，仅可查看缓存数据，无法提交新订单。';return;}
  banner.hidden=true;
}
const baseRenderAll=renderAll;
window.renderAll=function(){
  migrateEnhancedState(S());
  baseRenderAll();
  renderInventory();renderStoreSettings();renderLicenseSimulator();renderLicenseBanner();updateOrderButtonsForState();updatePwaBanner();
  bindEnhancedProductForm();
  LotusDB.save();
};

function bindPosMemberQuickActions(){
  $('posLookupMember').onclick=()=>{const phone=$('posMemberPhone').value.trim(),c=S().customers.find(x=>x.phone===phone);if(!c)return alert('Không tìm thấy thành viên / 未找到会员');S().posCustomerId=c.id;LotusDB.save();Bus.emit('pos.customer.lookup',{customerId:c.id});renderAll();};
  $('posRegisterMember').onclick=()=>openAuthModal('POS','register');
}
const originalAssignAuthenticatedCustomer=assignAuthenticatedCustomer;
window.assignAuthenticatedCustomer=function(customerId){
  if(authContext==='POS'){S().posCustomerId=customerId;return;}
  originalAssignAuthenticatedCustomer(customerId);
};

function setupPwa(){
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();window.__lotusInstallPrompt=event;});
  const updateConnectivity=()=>{S().connectivity.offline=navigator.onLine===false;if(!S().connectivity.offline)S().connectivity.lastOnlineAt=nowISO();LotusDB.save();updatePwaBanner();if(typeof renderQR==='function')renderQR();if(typeof renderMobile==='function')renderMobile();};
  window.addEventListener('online',updateConnectivity);window.addEventListener('offline',updateConnectivity);updateConnectivity();
  const allowed=location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname);
  if(allowed&&'serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('SW registration failed',error));
}

function addEnhancedTests(){
  const add=(id,layer,module,scenario,expected,fn)=>{if(!TEST_CASES.some(x=>x.id===id))tc(id,layer,module,scenario,expected,fn);};
  add('PWA-01','Frontend','PWA','Hai manifest định danh khác nhau','Staff và Customer có ID khác nhau',()=>assert('staff-pwa'!=='customer-pwa'));
  add('PAY-01','Logic','OCB demo','Tài khoản toàn số 0 là demo','Không tạo deeplink thật',()=>{const s=testState();migrateEnhancedState(s);const c=[];addCartItem(c,s.products[0],{});const o=serviceCreateOrder(s,{cart:c});s.settings.bankPayment={bankName:'OCB',bankBin:'970448',accountNumber:'0000000000',accountName:'DEMO',allowRealDeeplink:false};ensurePaymentRequest(o,s);assert(buildOCBDeeplink(o,s)===null);});
  add('PAY-02','Logic','OCB payment','QR giữ đúng amount và note','Amount/note khớp order',()=>{const s=testState();migrateEnhancedState(s);const c=[];addCartItem(c,s.products[0],{});const o=serviceCreateOrder(s,{cart:c}),r=ensurePaymentRequest(o,s);assert(r.amount===o.total&&r.content.includes(o.code)&&r.payload.includes(tlv('54',String(o.total))));});
  add('PAY-03','Logic','OCB simulator','Mở simulator không đánh dấu paid','Order vẫn NEW/PENDING',()=>{const s=testState();migrateEnhancedState(s);const c=[];addCartItem(c,s.products[0],{});const o=serviceCreateOrder(s,{cart:c});ensurePaymentRequest(o,s);assert(o.status==='NEW'&&o.paymentStatus==='PENDING');});
  add('PAY-04','Logic','Payment state','Customer reported không tạo loyalty','Không trừ voucher/không cộng điểm',()=>{const s=testState();migrateEnhancedState(s);const c=[];addCartItem(c,s.products[0],{});const cus=s.customers[0],pts=cus.points,o=serviceCreateOrder(s,{cart:c,customerId:cus.id});markCustomerTransfer(o,s);assert(o.paymentStatus==='CUSTOMER_REPORTED'&&cus.points===pts);});
  add('PAY-05','Integration','Payment','Nhân viên xác nhận chỉ ghi nhận một lần','PAID và đúng một receipt',()=>{const s=testState();migrateEnhancedState(s);const c=[];addCartItem(c,s.products[0],{});const o=serviceCreateOrder(s,{cart:c});servicePayOrder(s,o.id,'BANK');assert(o.status==='PAID'&&s.receipts.filter(r=>r.orderId===o.id).length===1);});
  add('PAY-06','Backend','Idempotency','Confirm lặp không nhân đôi','Lần hai bị ALREADY_PAID',()=>{const s=testState();migrateEnhancedState(s);const c=[];addCartItem(c,s.products[0],{});const o=serviceCreateOrder(s,{cart:c});servicePayOrder(s,o.id,'BANK');let ok=false;try{servicePayOrder(s,o.id,'BANK');}catch(e){ok=e.message==='ALREADY_PAID';}assert(ok&&s.receipts.filter(r=>r.orderId===o.id).length===1);});
  add('PAY-07','Integration','OCB live QR','Tài khoản OCB thật nằm trong QR và deeplink','BIN, account, amount, note và name khớp order',()=>{const s=testState();migrateEnhancedState(s);const c=[];addCartItem(c,s.products[0],{});const o=serviceCreateOrder(s,{cart:c}),r=ensurePaymentRequest(o,s),link=new URL(buildOCBDeeplink(o,s));assert(r.bank.bankBin==='970448'&&r.bank.accountNumber==='609271'&&r.bank.accountName==='HUANG TIANSHENG'&&r.payload.includes('609271')&&link.searchParams.get('app')==='ocb'&&link.searchParams.get('ba')==='609271@ocb'&&link.searchParams.get('am')===String(o.total)&&link.searchParams.get('tn')===r.content&&link.searchParams.get('bn')==='HUANG TIANSHENG');});
  add('LIC-01','Logic','License','D-4 và D-3 05:00 đúng cảnh báo','ACTIVE rồi EXPIRING_SOON',()=>assert(licenseExpectedStatus('2026-09-30','2026-09-26T05:00')==='ACTIVE'&&licenseExpectedStatus('2026-09-30','2026-09-27T05:00')==='EXPIRING_SOON'));
  add('LIC-02','Logic','License','D 05:00 bắt đầu grace','GRACE và vẫn tạo order',()=>assert(licenseExpectedStatus('2026-09-30','2026-09-30T05:00')==='GRACE'));
  add('LIC-03','Logic','License','D+3 biên 04:59/05:00','GRACE rồi SUSPENDED',()=>assert(licenseExpectedStatus('2026-09-30','2026-10-03T04:59')==='GRACE'&&licenseExpectedStatus('2026-09-30','2026-10-03T05:00')==='SUSPENDED'));
  add('LIC-04','Backend','License scheduler','Một job mỗi business date','Lần hai idempotent',()=>{const s=testState();migrateEnhancedState(s);s.license.virtualNow='2026-09-27T05:00';const a=runLicenseDailyEvaluation(s),b=runLicenseDailyEvaluation(s);assert(a.ran&&!b.ran&&b.reason==='IDEMPOTENT'&&s.license.jobRuns.length===1);});
  add('LIC-05','Backend','License scheduler','Chạy bù sau 05:00 được ghi delayed','Job delayed=true',()=>{const s=testState();migrateEnhancedState(s);const r=runLicenseDailyEvaluation(s,'2026-09-27T09:30');assert(r.ran&&r.job.delayed);});
  add('LIC-06','Logic','Offline lease','Đúng 10 ngày chưa khóa, ngày 11 khóa','GRACE/ACTIVE rồi OFFLINE_LOCKED',()=>{const a=testState();migrateEnhancedState(a);a.license.serverReachable=false;a.license.lastSuccessfulLicenseSyncAt='2026-10-01T05:00';runLicenseDailyEvaluation(a,'2026-10-11T05:00');const ten=a.license.status;const b=testState();migrateEnhancedState(b);b.license.serverReachable=false;b.license.lastSuccessfulLicenseSyncAt='2026-10-01T05:00';runLicenseDailyEvaluation(b,'2026-10-12T05:00');assert(ten!=='OFFLINE_LOCKED'&&b.license.status==='OFFLINE_LOCKED');});
  add('LIC-09','Authorization','RBAC','Store Owner không thể gọi manual license','SYSTEM_ADMIN_REQUIRED',()=>{const s=testState();migrateEnhancedState(s);let ok=false;try{manualLicenseAction('SUSPEND',{},s);}catch(e){ok=e.message==='SYSTEM_ADMIN_REQUIRED';}assert(ok);});
  add('LIC-10','Backend','License action','Manual renew idempotent theo token','Audit chỉ ghi một lần',()=>{const s=testState();migrateEnhancedState(s);s.licenseDemo.systemAdminSession=true;manualLicenseAction('RENEW',{newExpiry:'2026-12-31',token:'ONE'},s);const count=s.license.audit.length;const r=manualLicenseAction('RENEW',{newExpiry:'2026-12-31',token:'ONE'},s);assert(r.idempotent&&s.license.audit.length===count);});
  add('LIC-11','Integration','License scope','Khóa chặn order mới nhưng cho settle đơn cũ','Create denied, pay existing succeeds',()=>{const s=testState();migrateEnhancedState(s);const c=[];addCartItem(c,s.products[0],{});const o=serviceCreateOrder(s,{cart:c});s.license.status='SUSPENDED';let denied=false;try{serviceCreateOrder(s,{cart:c});}catch(e){denied=e.message==='LICENSE_NEW_ORDERS_BLOCKED';}servicePayOrder(s,o.id,'BANK');assert(denied&&o.status==='PAID');});
  add('REG-07','Integration','Inventory','Order creation commits ingredient estimate once','Ingredient and product stock reduced once',()=>{const s=testState();migrateEnhancedState(s);const p=s.products[0],line=p.recipe[0],ing=ingredient(line.ingredientId,s),p0=p.stock,i0=ing.stock,c=[];addCartItem(c,p,{});const o=serviceCreateOrder(s,{cart:c});servicePayOrder(s,o.id,'BANK');assert(p.stock===p0-1&&ing.stock<i0&&o.inventoryCommittedAt);});
  add('MENU-01','Logic','Phát Tài menu','Menu ảnh được migrate đầy đủ','Có đúng 13 món và giá đúng',()=>{const s=testState();migrateEnhancedState(s);assert(s.products.length===13&&s.products[0].price===130000&&s.products[12].largePrice===120000);});
  add('MENU-02','Logic','Phát Tài menu','Canh size đại dùng đúng giá cao','Size 大 bằng 120K',()=>{const s=testState(),cart=[];migrateEnhancedState(s);addCartItem(cart,s.products[12],{size:'大',spice:'中'});assert(cart[0].price===120000);});
  add('MENU-03','Logic','Phát Tài menu','Size và độ cay đi cùng dòng món','Modifier được lưu trên cart',()=>{const s=testState(),cart=[];migrateEnhancedState(s);addCartItem(cart,s.products[1],{size:'中',spice:'小'});assert(cart[0].mods.size==='中'&&cart[0].mods.spice==='小');});
  add('RBAC-01','Authorization','Roles','Admin cũ migrate thành STORE_OWNER','Không cấp SYSTEM_ADMIN',()=>{const s=testState();migrateEnhancedState(s);assert(s.staff[0].role==='STORE_OWNER'&&!s.roles.some(r=>r.id==='SYSTEM_ADMIN'));});
  add('RBAC-02','Authorization','Roles','Vai trò tự tạo chỉ nhận quyền được tích','Không có quyền ngầm',()=>{const s=testState();migrateEnhancedState(s);s.roles.push({id:'CUSTOM',nameVi:'Barista',nameCn:'咖啡师',permissions:['create_orders']});s.staff.push({id:88,role:'CUSTOM'});s.session.storeStaffId=88;assert(hasPermission('create_orders',s)&&!hasPermission('configure_bank',s));});
  add('INV-01','Logic','Recipe units','kg chuyển sang g chính xác','1kg = 1000g',()=>assert(convertUnit(1,'kg','g')===1000));
  add('INV-02','Backend','Inventory','Kho không cho âm','Báo STOCK_CANNOT_BE_NEGATIVE',()=>{const s=testState();migrateEnhancedState(s);s.session.storeStaffId=1;let ok=false;try{applyInventoryEntry({ingredientId:'ING-COFFEE',type:'ADJUST_MINUS',qty:999999,unit:'g'},s);}catch(e){ok=e.message==='STOCK_CANNOT_BE_NEGATIVE';}assert(ok);});
}

addEnhancedTests();
bindPosMemberQuickActions();
bindEnhancedProductForm();
setupPwa();
renderAll();

window.LotusEnhanced={
  version:ENHANCED_VERSION,migrateEnhancedState,licenseExpectedStatus,runLicenseDailyEvaluation,setLicenseScenario,manualLicenseAction,syncLicenseNow,
  orderCreationBlockReason,convertUnit,calculateInventoryUsage,commitInventoryForOrder,applyInventoryEntry,hasPermission,roleById,barcodeSvg,buildOCBDeeplink,PERMISSIONS
};
Object.assign(window.LotusPOC,{serviceCreateOrder,servicePayOrder,renderAll,licenseExpectedStatus,runLicenseDailyEvaluation,manualLicenseAction,orderCreationBlockReason,calculateInventoryUsage,barcodeSvg,buildOCBDeeplink,enhanced:true});
})();
