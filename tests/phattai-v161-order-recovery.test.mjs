import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
const PKG=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const GRADLE=readFileSync(new URL('../android/app/build.gradle.kts',import.meta.url),'utf8');
const MAIN=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java',import.meta.url),'utf8');

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

