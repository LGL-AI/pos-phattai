import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const STAFF = readFileSync(new URL('../public/staff/staff.js', import.meta.url), 'utf8');
const APK_STAFF = readFileSync(new URL('../android/app/src/main/assets/staff/staff.js', import.meta.url), 'utf8');
const ACTIVITY = readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java', import.meta.url), 'utf8');

// Owner's request (05/10/2026): the download link is too long to type on a handheld, so Settings and Store setup carry
// an "Update phiên bản 更新軟件" button straight to the APK download page.
test('the handheld Settings and Store screens carry the update button to the APK download page', () => {
  assert.match(STAFF, /const UPDATE_PAGE=native\?'https:\/\/pos-phattai\.lgl247-ai\.workers\.dev\/app':'\/app';/);
  assert.match(STAFF, /const updateLink=\(\)=>counter\?'':`<div class="card"><a class="linkButton primary" data-update-link href="\$\{UPDATE_PAGE\}"/);
  assert.match(STAFF, />Update phiên bản 更新軟件<\/a>/);
  assert.match(STAFF, /<h1>Quản lý tiệm · chủ tiệm<\/h1>\$\{updateLink\(\)\}/, 'Store setup');
  assert.match(STAFF, /\$\{counter\?deviceForm\(\):''\}\$\{updateLink\(\)\}/, 'Settings & devices, every account');
  assert.equal(APK_STAFF, STAFF, 'the APK carries the same staff UI');
});
test('inside the APK the download page opens in the phone browser, not inside the POS WebView', () => {
  assert.match(ACTIVITY, /shouldOverrideUrlLoading\(WebView view, WebResourceRequest request\) \{\s*return external\(request\.getUrl\(\)\);/);
  assert.match(ACTIVITY, /startActivity\(new Intent\(Intent\.ACTION_VIEW, uri\)\)/);
});
