import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentFixture} from './helpers/current-fixture.mjs';

// PT-40 (owner's decision, 05/10/2026): the kitchen account sees only the customer's name, the order code,
// the table and the dishes ordered. No price, total, discount, tax, payment, phone, points or customer records.
const MONEY = ['price', 'subtotal', 'discount', 'total', 'taxAmount', 'taxRate', 'taxMode', 'paymentStatus', 'paymentMethod', 'cashReceived',
  'cashChange', 'bankPayment', 'paymentPreference', 'paidByName', 'pointsEarned', 'refundedAmount', 'voucherCode', 'memberPhone', 'phone', 'points'];
const leaks = (value, path = '') => {
  if (Array.isArray(value)) return value.flatMap((x, i) => leaks(x, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => (MONEY.includes(k) ? [path + '.' + k] : []).concat(leaks(v, path + '.' + k)));
  return [];
};
async function shop() {
  const f = currentFixture(), cashier = f.actor('CASHIER'), kitchen = f.actor('KITCHEN');
  const reg = await f.call('/api/member/register', 'POST', {phone: '0933111222', name: 'Chị Hoa'}, {'CF-Connecting-IP': '10.9.9.9'});
  const cookie = reg.data && f.db.prepare('SELECT id FROM members').get();
  const open = (await f.call('/api/staff/orders', 'POST', {table: 'T05', memberId: cookie.id, note: 'ít hành', items: [{productId: '110', qty: 2, mods: {size: '大', spice: '小', note: 'không da'}}, {productId: '115', qty: 1, mods: {}}], idempotencyKey: 'kitchen_view_open_00001'}, cashier.headers)).data.order;
  const paid = (await f.call('/api/staff/orders', 'POST', {table: 'T06', items: [{productId: '112', qty: 1, mods: {size: '中', spice: '中', note: ''}}], idempotencyKey: 'kitchen_view_paid_00001'}, cashier.headers)).data.order;
  const d = (await f.call('/api/staff/orders/' + paid.id, 'GET', null, cashier.headers)).data;
  assert.equal((await f.call(`/api/staff/orders/${paid.id}/pay`, 'POST', {version: d.order.version, method: 'CASH', received: d.order.total}, cashier.headers)).status, 200);
  return {f, cashier, kitchen, open, paid};
}

test('PT-40 the kitchen order list shows code, table, customer name and dishes only — and no paid orders', async () => {
  const {f, kitchen, open, paid} = await shop();
  try {
    const r = await f.call('/api/staff/orders', 'GET', null, kitchen.headers);
    assert.equal(r.status, 200);
    assert.deepEqual(leaks(r.data), [], 'no money or payment field');
    const o = r.data.orders.find(x => x.id === open.id);
    assert.equal(o.code, open.code); assert.equal(o.table, 'T05'); assert.equal(o.memberName, 'Chị Hoa'); assert.equal(o.note, 'ít hành');
    assert.deepEqual(o.items.map(x => [x.name, x.qty, x.mods.size, x.mods.spice, x.mods.note]), [['Cơm vịt quay', 2, '大', '小', 'không da'], ['Canh gà hầm hoa đông trùng hạ thảo', 1, undefined, undefined, '']]);
    assert.ok(!r.data.orders.some(x => x.id === paid.id), 'paid orders are not listed for the kitchen');
  } finally { f.db.close(); }
});
test('PT-40 an order opened by the kitchen carries its kitchen slips but no bills, prices or payments', async () => {
  const {f, kitchen, open, paid} = await shop();
  try {
    const r = await f.call('/api/staff/orders/' + open.id, 'GET', null, kitchen.headers);
    assert.equal(r.status, 200);
    assert.deepEqual(leaks(r.data), []);
    assert.deepEqual(r.data.bills, []);
    assert.ok(r.data.jobs.length >= 1 && r.data.jobs[0].items[0].name === 'Cơm vịt quay');
    assert.equal((await f.call('/api/staff/orders/' + paid.id, 'GET', null, kitchen.headers)).status, 404, 'a paid order is not opened');
  } finally { f.db.close(); }
});
test('PT-40 the kitchen print queue carries dishes without prices', async () => {
  const {f, kitchen} = await shop();
  try {
    const r = await f.call('/api/staff/paid-labels', 'GET', null, kitchen.headers);
    assert.equal(r.status, 200);
    assert.ok(r.data.jobs.length >= 1);
    assert.deepEqual(leaks(r.data), []);
  } finally { f.db.close(); }
});
test('PT-40 the kitchen cannot read the customer list, a customer, the member lookup or the day summary', async () => {
  const {f, kitchen, cashier} = await shop();
  try {
    const id = f.db.prepare('SELECT id FROM members').get().id;
    for (const path of ['/api/staff/customers', '/api/staff/customers/' + id, '/api/staff/members?phone=0933111222', '/api/staff/summary']) {
      const r = await f.call(path, 'GET', null, kitchen.headers);
      assert.equal(r.status, 403, path + ' ' + JSON.stringify(r.data));
      assert.equal(r.data.ok, false);
    }
    assert.equal((await f.call('/api/staff/customers', 'GET', null, cashier.headers)).status, 200, 'the cashier still can');
    assert.equal((await f.call('/api/staff/members?phone=0933111222', 'GET', null, cashier.headers)).status, 200);
  } finally { f.db.close(); }
});
test('PT-40 the cashier and owner still see prices and payments', async () => {
  const {f, cashier, open} = await shop();
  try {
    const r = await f.call('/api/staff/orders/' + open.id, 'GET', null, cashier.headers);
    assert.ok(r.data.order.total > 0 && r.data.order.items[0].price > 0 && r.data.order.paymentStatus === 'UNPAID');
  } finally { f.db.close(); }
});
test('PT-40 the staff app hides money, customers and the dashboard from the kitchen account', () => {
  const STAFF = readFileSync(new URL('../public/staff/staff.js', import.meta.url), 'utf8');
  assert.match(STAFF, /const kitchenOnly=\(\)=>!!st\.staff&&!can\('PAYMENT_CONFIRM'\)&&!can\('ORDER_EDIT'\);/);
  assert.match(STAFF, /!\(kitchenOnly\(\)&&\['customers','dashboard','qrorders'\]\.includes\(x\[0\]\)\)/);
  assert.match(STAFF, /if\(kitchenOnly\(\)\)return kitchenDetail\(d\);/);
  assert.match(STAFF, /\$\{x\.price===undefined\?'':fmt\(x\.price\*x\.qty\)\}/);
});
test('PT-39 a mainland China mobile (+86, 11 digits, 14 characters) can register', async () => {
  const f = currentFixture();
  try {
    const r = await f.call('/api/member/register', 'POST', {phone: '+86 138 1234 5678', name: 'Wang'}, {'CF-Connecting-IP': '10.8.8.8'});
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(f.db.prepare('SELECT phone FROM members').get().phone, '+8613812345678');
    assert.equal((await f.call('/api/member/login', 'POST', {phone: '+8613812345678', password: '345678'}, {'CF-Connecting-IP': '10.8.8.9'})).status, 200);
    assert.equal((await f.call('/api/member/register', 'POST', {phone: '+861381234567890', name: 'Too long'}, {'CF-Connecting-IP': '10.8.8.10'})).status, 400);
  } finally { f.db.close(); }
});
