import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
const LEGACY=readFileSync(new URL('../android/app/src/main/assets/pos/handheld-workflow.js',import.meta.url),'utf8');
const PKG=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const GRADLE=readFileSync(new URL('../android/app/build.gradle.kts',import.meta.url),'utf8');
const MAIN=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java',import.meta.url),'utf8');

test('v1.6.3 release versions align',()=>{
  assert.equal(PKG.version,'2.7.0-phattai.3');
  assert.match(GRADLE,/versionCode = 163/);
  assert.match(GRADLE,/versionName = "1\.6\.3"/);
  assert.match(MAIN,/LotusPOSPhatTai\/1\.6\.3/);
});

test('cloud staff records explicit append target instead of relying on stale selected detail',()=>{
  assert.match(STAFF,/st\.appendTarget=\{id:o\.id,code:o\.code,table:o\.table\}/);
  assert.match(STAFF,/const target=st\.submitDraft\?st\.submitDraft\.target:\(st\.appendTarget\|\|null\)/);
});

test('cloud staff re-reads current order before append and handles closed or changed order',()=>{
  assert.match(STAFF,/api\('GET','\/api\/staff\/orders\/'\+target\.id\)/);
  assert.match(STAFF,/\['ORDER_CLOSED','ORDER_CHANGED'\]\.includes\(e\.code\)/);
  assert.match(STAFF,/latest\.status==='ACCEPTED'&&latest\.paymentStatus!=='PAID'/);
});

test('cloud staff automatically creates a supplementary order when original is closed or split',()=>{
  assert.match(STAFF,/Bổ sung cho '\+target\.code/);
  assert.match(STAFF,/Hệ thống đã tạo đơn bổ sung mới cùng bàn/);
  assert.match(STAFF,/api\('POST','\/api\/staff\/orders',\{\.\.\.draft,table:target\.table\|\|draft\.table/);
});

test('legacy full POS no longer throws closed/split blocker while cart can be recovered',()=>{
  assert.doesNotMatch(LEGACY,/throw new Error\('Đơn đã đóng hoặc đã tách; tạo đơn bổ sung riêng\.'/);
  assert.match(LEGACY,/kind='ĐƠN BỔ SUNG \/ 加单'/);
  assert.match(LEGACY,/recoveredFrom=target&&target\.code\|\|m\.editOrderId/);
  assert.match(LEGACY,/đã tự tạo đơn bổ sung mới cùng bàn/);
});

test('legacy menu clears stale editOrderId before checkout binding',()=>{
  assert.match(LEGACY,/if\(m\.editOrderId\)\{const target=S\(\)\.orders\.find/);
  assert.match(LEGACY,/m\.editOrderId=null;LotusDB\.save\(\)/);
});
