import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentFixture} from './helpers/current-fixture.mjs';

// Owner's requests 05/10/2026 (PT-42, PT-43, PT-44).
const STAFF = readFileSync(new URL('../public/staff/staff.js', import.meta.url), 'utf8');
const APK_STAFF = readFileSync(new URL('../android/app/src/main/assets/staff/staff.js', import.meta.url), 'utf8');

async function refunded(f, cashier, table, key, part) {
  const o = (await f.call('/api/staff/orders', 'POST', {table, items: [{productId: '115', qty: 1, mods: {}}], idempotencyKey: key}, cashier.headers)).data.order;
  const d = (await f.call('/api/staff/orders/' + o.id, 'GET', null, cashier.headers)).data;
  assert.equal((await f.call(`/api/staff/orders/${o.id}/pay`, 'POST', {version: d.order.version, method: 'CASH', received: d.order.total}, cashier.headers)).status, 200);
  if (part) {
    const r = await f.call('/api/staff/refunds', 'POST', {orderId: o.id, amount: Math.round(d.order.total * part), method: 'CASH', reason: 'test', idempotencyKey: key + '_refund'}, f.actor('OWNER').headers);
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.data));
  }
  return d.order;
}

test('PT-42 the order list carries the refunded total of each order', async () => {
  const f = currentFixture(), cashier = f.actor('CASHIER');
  try {
    const full = await refunded(f, cashier, 'T11', 'v182_refund_full_000001', 1);
    const part = await refunded(f, cashier, 'T12', 'v182_refund_part_000001', 0.5);
    const none = await refunded(f, cashier, 'T13', 'v182_refund_none_000001', 0);
    const list = (await f.call('/api/staff/orders', 'GET', null, cashier.headers)).data.orders;
    const by = id => list.find(x => x.id === id);
    assert.equal(by(full.id).refundedAmount, full.total);
    assert.equal(by(part.id).refundedAmount, Math.round(part.total * 0.5));
    assert.equal(by(none.id).refundedAmount, 0);
    const one = (await f.call('/api/staff/orders?code=' + encodeURIComponent(full.code), 'GET', null, cashier.headers)).data.orders;
    assert.equal(one[0].refundedAmount, full.total, 'the search by code carries it too');
    const kitchen = (await f.call('/api/staff/orders', 'GET', null, f.actor('KITCHEN').headers)).data.orders;
    assert.ok(kitchen.every(x => !('refundedAmount' in x)), 'the kitchen still sees no money');
  } finally { f.db.close(); }
});
test('PT-42 a refunded order is drawn in red with its refund state on the order list', () => {
  assert.match(STAFF, /<button class="listButton\$\{back>0\?' refunded':''\}" data-open=/);
  assert.match(STAFF, /'ĐÃ HOÀN TIỀN \/ 已退款':'HOÀN MỘT PHẦN \/ 部分退款'/);
  const css = readFileSync(new URL('../public/staff/staff.css', import.meta.url), 'utf8');
  assert.match(css, /\.listButton\.refunded,body\[data-mode="counter"\] \.listButton\.refunded\{background:#fdecea/);
});
test('PT-43 a render keeps the sideways scroll of the phone menu as well as the counter menu', () => {
  assert.match(STAFF, /navScrollX=oldNav\?\.scrollLeft\|\|0/);
  assert.match(STAFF, /if\(newNav\)\{newNav\.scrollTop=navScroll;newNav\.scrollLeft=navScrollX\}/);
});
test('PT-44 the owner edits dishes and prices from Quản trị; a manager keeps the menu entry', () => {
  assert.match(STAFF, /\.\.\.\(owner\?\[\['owner','Quản trị chủ tiệm \/ 店主管理',null\]\]:\[\['products','Món & giá \/ 菜品与价格','CATALOG_MANAGE'\],\['settings','Thiết bị \/ 设备',null\]\]\)/);
  assert.match(STAFF, /\['products','Món & giá','菜品与价格'/, 'the Quản trị tile is still there');
  assert.equal(APK_STAFF, STAFF, 'the APK carries the same staff UI');
});
