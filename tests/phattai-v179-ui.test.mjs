import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Bugs found by the handover simulation (05/10/2026); scripts/sim-browser.mjs exercises them in a browser.
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const STAFF = read('public/staff/staff.js'), QR = read('public/assets/app.js'), WORKER = read('src/worker.js');

test('PT-34 every async call returned from inside a try block is awaited, so its failure becomes a JSON answer', () => {
  for (const [file, src] of [['src/worker.js', WORKER], ['src/staff.js', read('src/staff.js')], ['src/ops.js', read('src/ops.js')]]) {
    for (const fn of ['register', 'login', 'logout', 'getOrder', 'overview', 'inventory', 'deps.register', 'deps.login']) {
      const bare = new RegExp(`(return|\\?)\\s*${fn.replace('.', '\\.')}\\(env`, 'g');
      assert.equal((src.match(bare) || []).length, 0, `${file}: ${fn}(…) returned without await`);
    }
  }
  assert.match(WORKER, /if\(typeof parsed!=='object'\|\|parsed===null\)throw Error\('BAD_JSON'\)/, 'a JSON body of null or a number is refused as bad JSON');
});
test('PT-35 the QR page tells an offline customer the order was not sent instead of showing the demo screen', () => {
  assert.match(QR, /const offlineNow=\(\)=>navigator\.onLine===false\|\|!state\.serverOnline;/);
  assert.match(QR, /if\(!isReady\(\)\)\{if\(offlineNow\(\)\)\{toast\(/);
  assert.match(QR, /offlineNow\(\)\?'Mất kết nối – chưa gửi được/);
  assert.match(QR, /!isReady\(\)&&!offlineNow\(\)\?`<p class="sub"[^`]*demoBadge/);
});
test('PT-38 the QR option sheet offers a bowl size only for dishes that have one', () => {
  assert.match(QR, /\$\{p\.size\?`<div class="field"><label>\$\{bi\('size'\)\}<\/label>/);
});
test('PT-36 the sign-in screen keeps what was typed when it is redrawn', () => {
  assert.match(STAFF, /function renderLogin\(\)\{\/\*[^*]*\*\/const typing=typingField\(\);app\.innerHTML=/);
  assert.match(STAFF, /keepDrafts\(\);keepTyping\(typing\);if\(counter\)\{const title=\$\('#counter-page-title'\);if\(title\)title\.textContent='Đăng nhập/);
});
test('PT-37 a network error notice is removed once requests work again', () => {
  assert.match(STAFF, /function connection\(\)\{[^\n]*if\(st\.online&&!wasOnline&&\/Không kết nối được Worker\|Failed to fetch\|Không kiểm tra được lệnh in bếp\/\.test/);
});
