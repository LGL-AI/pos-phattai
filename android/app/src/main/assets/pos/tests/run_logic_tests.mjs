import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mainMarker="<script>\n'use strict';";
const mainStart=html.indexOf(mainMarker)+8;
const mainEnd=html.indexOf('</script>',mainStart);
let mainScript=html.slice(mainStart,mainEnd);
mainScript=mainScript.slice(0,mainScript.indexOf('applyLaunchContext();setupStaticHandlers();renderAll()'));

let enhancement=fs.readFileSync(path.join(root,'lotus-v12.2.1.js'),'utf8');
enhancement=enhancement.slice(0,enhancement.lastIndexOf('addEnhancedTests();'));
enhancement+=`\naddEnhancedTests();\nglobalThis.__lotusApi={S,LotusDB,Bus,seedState,addCartItem,serviceCreateOrder,servicePayOrder,ensurePaymentRequest,markCustomerTransfer,validPaymentCRC,buildVietQRPayload,tlv,applyLaunchContext,TEST_CASES};\nglobalThis.__lotusEnhanced={migrateEnhancedState,licenseExpectedStatus,runLicenseDailyEvaluation,setLicenseScenario,manualLicenseAction,syncLicenseNow,orderCreationBlockReason,convertUnit,calculateInventoryUsage,commitInventoryForOrder,applyInventoryEntry,hasPermission,roleById,barcodeSvg,buildOCBDeeplink,PERMISSIONS};\n})();`;

const storage=new Map();
const elements=new Map();
const bodyClasses=new Set();
function fakeElement(){
  return{
    innerHTML:'',textContent:'',value:'',checked:false,hidden:false,disabled:false,style:{},dataset:{},children:[],
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    querySelectorAll(){return[]},querySelector(){return null},appendChild(child){this.children.push(child);return child},
    insertAdjacentElement(){},addEventListener(){},click(){},select(){},remove(){},reset(){},setAttribute(){},
    getContext(){return null}
  };
}
const sandbox={
  console,Date,Math,JSON,Intl,Blob,URL,URLSearchParams,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,
  alert(){},confirm(){return true},location:{href:'https://demo.local/index.html',protocol:'https:',hostname:'demo.local'},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  document:{
    getElementById(id){if(!elements.has(id))elements.set(id,fakeElement());return elements.get(id)},
    querySelector(){return fakeElement()},querySelectorAll(){return[]},createElement(){return fakeElement()},execCommand(){return true},
    body:{appendChild(){},classList:{add(...names){names.forEach(name=>bodyClasses.add(name))},contains(name){return bodyClasses.has(name)}}}
  },
  navigator:{onLine:true,clipboard:{writeText:async()=>{}},serviceWorker:{register:async()=>({})}},
  addEventListener(){},removeEventListener(){},open(){return{document:{write(){},close(){}}}}
};
sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'qrcode-standalone.js'),'utf8'),sandbox,{filename:'qrcode-standalone.js'});
vm.runInContext(mainScript,sandbox,{filename:'index-inline.js'});
vm.runInContext(enhancement,sandbox,{filename:'lotus-v12.2.1.js'});

const api=sandbox.__lotusApi;
const enhanced=sandbox.__lotusEnhanced;
const failures=[];
const logicResults=[];
for(const test of api.TEST_CASES){
  const timestamp=new Date().toISOString();
  try{
    test.fn();
    test.last='PASS';
    logicResults.push({
      id:test.id,
      layer:test.layer,
      group:test.module,
      steps:[`Run isolated ${test.layer} assertion: ${test.scenario}`],
      input:{fixture:'Fresh seeded LotusPOS state',module:test.module},
      expected:test.expected,
      actual:'All assertions completed without error',
      status:'PASS',
      timestamp,
      errorLog:''
    });
  }catch(error){
    test.last='FAIL';
    failures.push({id:test.id,error:error.message});
    logicResults.push({
      id:test.id,
      layer:test.layer,
      group:test.module,
      steps:[`Run isolated ${test.layer} assertion: ${test.scenario}`],
      input:{fixture:'Fresh seeded LotusPOS state',module:test.module},
      expected:test.expected,
      actual:error.message,
      status:'FAIL',
      timestamp,
      errorLog:error.stack||error.message
    });
  }
}

fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
fs.writeFileSync(path.join(root,'test-results','logic-results.json'),JSON.stringify({
  summary:{total:logicResults.length,pass:logicResults.filter(x=>x.status==='PASS').length,fail:logicResults.filter(x=>x.status==='FAIL').length},
  results:logicResults
},null,2)+'\n');

assert.deepEqual(failures,[]);
assert.ok(api.TEST_CASES.length>=140);

const state=api.S();
enhanced.migrateEnhancedState(state);
assert.equal(state.staff[0].role,'STORE_OWNER');
assert.ok(state.products[0].recipe.length>0);
assert.ok(state.inventory.ingredients.length>=15);
api.LotusDB.state=api.seedState();
sandbox.location.href='file:///android_asset/pos/index.html?mode=staff&native=1';
api.applyLaunchContext();
assert.equal(api.S().mobile.loggedIn,false);
assert.equal(api.S().mobile.authBypass,false);
assert.equal(api.S().mobile.tab,'menu');
assert.equal(enhanced.licenseExpectedStatus('2026-09-30','2026-10-03T04:59'),'GRACE');
assert.equal(enhanced.licenseExpectedStatus('2026-09-30','2026-10-03T05:00'),'SUSPENDED');

const manifestStaff=JSON.parse(fs.readFileSync(path.join(root,'staff.webmanifest'),'utf8'));
const manifestCustomer=JSON.parse(fs.readFileSync(path.join(root,'customer.webmanifest'),'utf8'));
assert.notEqual(manifestStaff.id,manifestCustomer.id);
assert.equal(manifestStaff.display,'standalone');
assert.equal(manifestCustomer.display,'standalone');
for(const manifest of [manifestStaff,manifestCustomer]){
  for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(root,icon.src.replace(/^\//,''))),`missing ${icon.src}`);
}

const requiredFiles=['index.html','qrcode-standalone.js','echo-coffee-logo.jpg','lotus-v12.2.1.js','lotus-v12.2.1.css','sw.js','offline.html','staff/index.html','qr/index.html'];
for(const file of requiredFiles)assert.ok(fs.existsSync(path.join(root,file)),`missing ${file}`);

console.log(JSON.stringify({
  tests:api.TEST_CASES.length,
  failures,
  schemaVersion:state.version,
  roles:state.roles.map(r=>r.id),
  ingredients:state.inventory.ingredients.length,
  manifests:[manifestStaff.id,manifestCustomer.id]
},null,2));
