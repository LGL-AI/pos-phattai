import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentFixture} from './helpers/current-fixture.mjs';

// Bugs PT-23..PT-31 of docs/LotusPOS_BugList.xlsx: found in the Lotus POS SaaS code that grew out of
// Phát Tài, checked here and fixed in Phát Tài.

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const STAFF = read('public/staff/staff.js');
const absent = (src, re, msg) => assert.ok(!re.test(src), msg + ': ' + (src.match(re) || [''])[0]);
const detail = async (f, a, id) => (await f.call('/api/staff/orders/' + id, 'GET', null, a.headers)).data;
const ownerHeaders = async f => {
  const r = await f.call('/api/staff/login', 'POST', {username: 'huang', password: f.env.POS_STAFF_PASSWORD});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return {Authorization: 'Bearer ' + r.data.token};
};

test('PT-20 a device left open past midnight moves the dates nobody touched to the new Vietnam day', async () => {
  const vm = await import('node:vm');
  const start = STAFF.indexOf('const vnToday='), end = STAFF.indexOf('return true}', start) + 'return true}'.length;
  assert.ok(start > 0 && end > start);
  let now = Date.parse('2026-10-04T16:59:00Z'); // 23:59 on 04/10 in Vietnam
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const st = {reportDay: '2026-10-04', shiftFrom: '2026-10-04', opsFrom: '2026-09-27', opsTo: '2026-10-18', dailyReport: {}, reportShiftKey: 'CA1', reportStaffId: 'x'};
  const ctx = vm.createContext({st, Date: FakeDate, Intl});
  vm.runInContext(STAFF.slice(start, end) + ';globalThis.rollDay=rollDay', ctx);
  assert.equal(ctx.rollDay(), false, 'same day: nothing moves');
  now = Date.parse('2026-10-04T17:01:00Z'); // 00:01 on 05/10 in Vietnam
  assert.equal(ctx.rollDay(), true);
  assert.deepEqual({...st}, {reportDay: '2026-10-05', shiftFrom: '2026-10-05', opsFrom: '2026-09-28', opsTo: '2026-10-19', dailyReport: null, reportShiftKey: '', reportStaffId: ''});
  st.reportDay = '2026-10-01'; // the owner picked a past day on purpose
  now = Date.parse('2026-10-05T17:01:00Z');
  ctx.rollDay();
  assert.equal(st.reportDay, '2026-10-01', 'a day the user chose is kept');
  assert.equal(st.shiftFrom, '2026-10-06');
});

test('PT-23 forms are told apart by their id attribute: a field named "id" shadows form.id', () => {
  assert.match(STAFF, /<form id="product-form"[^>]*>.*<input name="id"/, 'the product form really has a field named id');
  const from = STAFF.indexOf("document.addEventListener('submit'"), submit = STAFF.slice(from, STAFF.indexOf("document.addEventListener('input'", from));
  assert.ok(submit.length > 1000, 'submit listener found');
  absent(submit, /\bf\.id\b/, 'submit listener reads f.id');
  absent(STAFF, /form\??\.id\b/, 'staff.js reads form.id');
  const list = submit.match(/\[([^\]]+)\]\.includes\(fid\)/);
  assert.ok(list, 'submit allow-list reads fid');
  const allowed = new Set([...list[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1]));
  const handled = new Set([...submit.matchAll(/fid==='([a-z-]+)'/g)].map(m => m[1]));
  assert.ok(handled.has('product-form') && handled.has('role-create'));
  for (const id of handled) assert.ok(allowed.has(id), `form #${id} has a handler but is not in the allow-list`);
});

test('PT-24 every pattern="" compiles with the v flag that current Chrome uses', () => {
  const sources = [STAFF, read('public/assets/app.js'), read('public/staff/index.html'), read('public/counter/index.html'), read('public/qr/index.html')];
  let n = 0;
  for (const src of sources) for (const [, p] of src.matchAll(/pattern="([^"]+)"/g)) {
    n++;
    const compiled = p.replace(/\\\\/g, '\\');
    assert.doesNotThrow(() => new RegExp(`^(?:${compiled})$`, 'v'), p);
  }
  assert.ok(n >= 5);
});

test('PT-25 a render keeps the field being typed in, and the background sync looks again before rendering', () => {
  assert.match(STAFF, /function render\(\)\{[^\n]*typing=typingField\(\);app\.innerHTML=/);
  assert.match(STAFF, /function render\(\)\{[^\n]*keepTyping\(typing\);/);
  assert.match(STAFF, /e\.preventDefault\(\);document\.activeElement\?\.blur\?\.\(\);const field=/);
  assert.match(STAFF, /!formActive&&!document\.activeElement\?\.closest\?\.\('form'\)\)render\(\)/);
});

test('PT-32 typed form values survive a re-render until the form is saved or the screen changes', () => {
  assert.match(STAFF, /function render\(\)\{[^\n]*keepDrafts\(\);keepTyping\(typing\);/, 'render puts the drafts back, then the caret');
  assert.match(STAFF, /document\.addEventListener\('input',e=>\{const el=e\.target,f=el\?\.form,key=draftKey\(f\)/, 'every edit of a form field is kept');
  assert.match(STAFF, /'password'\]\.includes\(el\.type\)/, 'passwords are never kept');
  assert.match(STAFF, /dkey=draftKey\(f\),dsaved=formDrafts\.get\(dkey\);formDrafts\.delete\(dkey\);try\{/, 'a submitted form starts empty after a successful save');
  assert.match(STAFF, /\}catch\(err\)\{if\(dsaved&&!formDrafts\.has\(dkey\)\)formDrafts\.set\(dkey,dsaved\);message\(err\.message\)\}/, 'a refused save keeps what was typed');
  assert.match(STAFF, /st\.screen=b\.dataset\.screen;formDrafts\.clear\(\);/, 'changing screen drops drafts');
  assert.match(read('scripts/e2e-staff.mjs'), /what the owner typed survives the list arriving late/, 'E2E types while the product list answers late');
});

test('PT-26 a soup or combo is not stored as "Tô thường · Cay vừa"; a rice plate keeps its options', async () => {
  const f = currentFixture(), a = f.actor();
  try {
    const plain = f.db.prepare('SELECT id,size,spicy FROM pos_products WHERE id=?').get('115');
    assert.deepEqual({...plain}, {id: '115', size: 0, spicy: 0});
    const r = await f.call('/api/staff/orders', 'POST', {table: 'T02', items: [{productId: '115', qty: 1, mods: {size: '中', spice: '中', note: ''}}, f.item(1)], idempotencyKey: crypto.randomUUID()}, a.headers);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const [soup, rice] = r.data.order.items;
    assert.equal(soup.mods.size, undefined);
    assert.equal(soup.mods.spice, undefined);
    assert.equal(rice.mods.size, '中');
    assert.equal(rice.mods.spice, '中');
    const bad = await f.call('/api/staff/orders', 'POST', {table: 'T02', items: [{productId: '115', qty: 1, mods: {size: '大'}}], idempotencyKey: crypto.randomUUID()}, a.headers);
    assert.equal(bad.status, 400, 'a large bowl of a one-size soup is still refused');
    assert.match(read('public/assets/app.js'), /if\(hasSize\|\|hasSpice\)\{add\(join\(sizeVi,spiceVi\),21\)/);
  } finally { f.db.close(); }
});

test('PT-27 the counter title shows the open order code and table', () => {
  assert.match(STAFF, /open=st\.selected&&st\.detail\?\.order;if\(title\)title\.textContent=open\?`\$\{open\.code\} · /);
  assert.match(read('public/counter/poc-counter.css'), /#app>h1\{display:none\}/, 'the page heading is hidden on the counter, so the title must carry the code');
});

test('PT-28 what GET /api/staff/store returns can be sent back to PUT unchanged', async () => {
  const f = currentFixture();
  try {
    const h = await ownerHeaders(f);
    const got = (await f.call('/api/staff/store', 'GET', null, h)).data.store;
    assert.equal(got.storeName, got.name);
    const put = await f.call('/api/staff/store', 'PUT', {...got, address: 'Địa chỉ mới'}, h);
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.equal(put.data.store.storeName, got.name);
    const named = await f.call('/api/staff/store', 'PUT', {...put.data.store, storeName: undefined, name: 'Tên theo name'}, h);
    assert.equal(named.status, 200, JSON.stringify(named.data));
    assert.equal(named.data.store.name, 'Tên theo name');
  } finally { f.db.close(); }
});

test('PT-29 paying an order and a split bill records who took the money; a rename does not change past sales', async () => {
  const f = currentFixture(), a = f.actor();
  try {
    f.db.prepare('UPDATE pos_staff_users SET display_name=? WHERE id=?').run('Thu ngân Lan', a.id);
    const order = (await f.order(a)).data.order;
    let d = await detail(f, a, order.id);
    assert.equal((await f.call(`/api/staff/orders/${order.id}/pay`, 'POST', {version: d.order.version, method: 'CASH', received: d.order.total}, a.headers)).status, 200);
    assert.equal((await detail(f, a, order.id)).order.paidByName, 'Thu ngân Lan');
    f.db.prepare('UPDATE pos_staff_users SET display_name=? WHERE id=?').run('Lan (đổi tên)', a.id);
    assert.equal((await detail(f, a, order.id)).order.paidByName, 'Thu ngân Lan');

    const two = (await f.call('/api/staff/orders', 'POST', {table: 'T03', items: [f.item(2)], idempotencyKey: crypto.randomUUID()}, a.headers)).data.order;
    d = await detail(f, a, two.id);
    const split = await f.call(`/api/staff/orders/${two.id}/split`, 'POST', {version: d.order.version, parts: [[{index: 0, qty: 1}], [{index: 0, qty: 1}]]}, a.headers);
    assert.equal(split.status, 200, JSON.stringify(split.data));
    const bill = split.data.bills[0];
    assert.equal((await f.call(`/api/staff/bills/${bill.id}/pay`, 'POST', {method: 'CASH', received: bill.total}, a.headers)).status, 200);
    assert.equal((await detail(f, a, two.id)).bills.find(b => b.id === bill.id).paidByName, 'Lan (đổi tên)');
  } finally { f.db.close(); }
});

test('PT-29 every print path calls the paper a receipt, says it is not an invoice and names the cashier', () => {
  assert.match(STAFF, /title:'BIÊN LAI THU TIỀN \/ 收款收据',notice:'Không phải hóa đơn \/ 本单据不是发票',cashierName:x\.paidByName\|\|''/);
  absent(STAFF, /browserPrint\('HÓA ĐƠN/, 'invoice title');
  assert.equal((STAFF.match(/;browserReceipt\(p\);/g) || []).length, 2, 'both browser print buttons use one layout');
  const counter = read('public/counter/devices.js');
  assert.match(counter, /p\.title\|\|'BIÊN LAI THU TIỀN/);
  assert.match(counter, /'Người thu: '\+p\.cashierName/);
  assert.doesNotMatch(counter, /HÓA ĐƠN|Mã HĐ/);
  const sunmi = read('android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java');
  assert.match(sunmi, /p\.optString\("title", "BIEN LAI THU TIEN/);
  assert.match(sunmi, /p\.optString\("cashierName"\)/);
  assert.doesNotMatch(sunmi, /PHIEU THANH TOAN/);
  const bitmap = read('android/app/src/main/java/vn/lotusai/pos/phattaiapp/TicketBitmap.java');
  assert.match(bitmap, /p\.optString\("title","BIÊN LAI THU TIỀN/);
  assert.doesNotMatch(bitmap, /HÓA ĐƠN/);
});

test('PT-30 receipts thank customers with the shop name from D1, never a name written into the print code', () => {
  assert.match(STAFF, /thanks:'Cảm ơn quý khách đã ghé '\+storeName\+'! \/ 谢谢光临'/);
  for (const file of ['public/counter/devices.js', 'android/app/src/main/java/vn/lotusai/pos/phattaiapp/TicketBitmap.java', 'android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java']) {
    assert.doesNotMatch(read(file), /PHÁT TÀI|Phát Tài|SÍU LẬP|Síu Lập|PHAT TAI/, file);
  }
});

test('PT-31 static pages are served without the Worker and keep their security headers', () => {
  const wrangler = read('wrangler.jsonc');
  assert.match(wrangler, /"run_worker_first": \["\/api\/\*", "\/app", "\/app\/", "\/releases\/\*", "\/kitchen", "\/kitchen\/\*", "\/assets\/kitchen\*"\]/);
  const headers = read('public/_headers');
  for (const path of ['/', '/index.html', '/offline.html', '/qr/*', '/staff/*', '/counter/*', '/display/*']) {
    const block = headers.split(/\n(?=\/)/).find(b => b.startsWith(path + '\n'));
    assert.ok(block, path);
    assert.match(block, /Content-Security-Policy: default-src 'self'.*frame-ancestors 'none'/, path);
    assert.match(block, /X-Content-Type-Options: nosniff/, path);
  }
  assert.match(headers, /\/counter\/\*\n[^/]*connect-src 'self' http:\/\/127\.0\.0\.1:18181/, 'the counter page may reach the local print bridge');
});
