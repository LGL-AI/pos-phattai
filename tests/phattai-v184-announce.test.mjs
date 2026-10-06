import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// PT-48 (owner's request 06/10/2026): new customer orders are read out in Chinese by the handheld paired with a
// Bluetooth speaker; off by default on every device; the screen stays awake while it is on.
const STAFF = readFileSync(new URL('../public/staff/staff.js', import.meta.url), 'utf8');
const APK = readFileSync(new URL('../android/app/src/main/assets/staff/staff.js', import.meta.url), 'utf8');
const MAIN = readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java', import.meta.url), 'utf8');
const MANIFEST = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

function harness(kitchen = false) {
  const said = [], slice = (a, b) => STAFF.slice(STAFF.indexOf(a), STAFF.indexOf(b));
  const code = slice('const announce={', 'function chime(){') + slice('function announceOrders(list){', '// Keeps listening');
  const ctx = {native: null, st: {token: 't1'}, store: {get: () => 'on'}, kitchenOnly: () => kitchen, Date, Number, String, Set, Array};
  vm.createContext(ctx);
  vm.runInContext(code + ';globalThis.say=t=>said.push(t);globalThis.t={announceOrders,announce,orderPhrase,tableWords};', Object.assign(ctx, {said}));
  return {t: ctx.t, said};
}
const now = () => new Date().toISOString(), old = () => new Date(Date.now() - 20 * 60000).toISOString();

test('PT-48 what was there when the device opened is not read out; a new customer QR order is, in Chinese', () => {
  const {t, said} = harness();
  t.announceOrders([{id: 'a', source: 'QR', table: 'T03', status: 'NEW', createdAt: now()}]);
  assert.deepEqual(said, [], 'the first list only sets the starting point');
  t.announceOrders([{id: 'a', source: 'QR', table: 'T03', status: 'NEW', createdAt: now()}, {id: 'b', source: 'QR', table: 'T05', status: 'NEW', createdAt: now()},
    {id: 'c', source: 'QR', table: 'TAKEAWAY', status: 'NEW', createdAt: now()}, {id: 'd', source: 'POS', table: 'T07', status: 'ACCEPTED', createdAt: now()},
    {id: 'e', source: 'QR', table: 'T08', status: 'CANCELLED', createdAt: now()}, {id: 'f', source: 'QR', table: 'T09', status: 'NEW', createdAt: old()}]);
  assert.deepEqual(said, ['5号桌，有新订单', '外带，有新订单'], 'staff orders, cancelled and old orders are not read out');
  t.announceOrders([{id: 'b', source: 'QR', table: 'T05', status: 'NEW', createdAt: now()}]);
  assert.equal(said.length, 2, 'never twice');
});
test('PT-48 the kitchen account hears every new order, its own staff orders included', () => {
  const {t, said} = harness(true);
  t.announceOrders([]);
  t.announceOrders([{id: 'x', table: 'T12', status: 'NEW', createdAt: now()}]);
  assert.deepEqual(said, ['12号桌，有新订单']);
});
test('PT-48 off by default, turned on per device; the APK reads Chinese, chimes and keeps the screen awake', () => {
  assert.match(STAFF, /const announceOn=\(\)=>store\.get\('announce'\)==='on';/);
  assert.match(STAFF, /native\?\.keepScreenOn\?\.\(announceOn\(\)&&!!st\.token\)/);
  assert.match(STAFF, /\$\{announceCard\(\)\}\$\{updateLink\(\)\}/);
  assert.match(MAIN, /tts\.setLanguage\(Locale\.SIMPLIFIED_CHINESE\)/);
  assert.match(MAIN, /@JavascriptInterface public String speak\(String text\)/);
  assert.match(MAIN, /@JavascriptInterface public void keepScreenOn\(boolean on\)/);
  assert.match(MAIN, /FLAG_KEEP_SCREEN_ON/);
  assert.match(MAIN, /s\.setMediaPlaybackRequiresUserGesture\(false\)/);
  assert.match(MAIN, /if\(tts!=null\)tts\.shutdown\(\)/);
  assert.match(MANIFEST, /<action android:name="android\.intent\.action\.TTS_SERVICE" \/>/, 'Android 11+ only sees the TTS engine when it is declared');
  assert.equal(APK, STAFF);
});
