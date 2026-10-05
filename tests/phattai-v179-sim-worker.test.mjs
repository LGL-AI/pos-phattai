import test from 'node:test';
import assert from 'node:assert/strict';
import {currentFixture} from './helpers/current-fixture.mjs';

// Handover simulation (05/10/2026), Worker side: the QR ordering page and the handheld POS talk to these
// endpoints. Generated cases: every dish, bad customer input, random order lifecycles checked against
// money invariants, taxes and vouchers, member phone formats, auth on every route, and races.

const VN = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'}).format(new Date());
let ipSeq = 0;
const nextIp = () => `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;
const key = p => (p + '_' + crypto.randomUUID().replaceAll('-', '')).slice(0, 60);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, list) => list[Math.floor(r() * list.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

function setup() {
  const f = currentFixture(), owner = f.actor('OWNER'), cashier = f.actor('CASHIER');
  const products = f.db.prepare('SELECT * FROM pos_products WHERE active=1').all().map(p => ({...p}));
  const qr = (body, headers = {}) => f.call('/api/orders', 'POST', body, {'CF-Connecting-IP': nextIp(), ...headers});
  const detail = async (id, a = cashier) => (await f.call('/api/staff/orders/' + id, 'GET', null, a.headers)).data;
  const daily = async () => (await f.call('/api/staff/reports/daily?date=' + VN(), 'GET', null, owner.headers)).data;
  return {f, owner, cashier, products, qr, detail, daily};
}
const modsFor = (p, r) => ({...(p.size ? {size: pick(r, ['中', '大'])} : {}), ...(p.spicy ? {spice: pick(r, ['不辣', '小', '中', '大'])} : {}), note: ''});
const assertJsonError = (res, status, label) => {
  assert.equal(res.status, status, `${label}: ${JSON.stringify(res.data)}`);
  assert.equal(res.data.ok, false, label);
  assert.ok(typeof res.data.code === 'string' && res.data.code.length, label + ' has a code');
};

// ---------- 1. Every dish on the menu can be ordered from the QR page, with every option it offers ----------
{
  const {f, products} = setup();
  f.db.close();
  for (const p of products) {
    test(`SIM QR dish ${p.id} ${p.name}: every size/spice it offers is accepted and priced, and nothing it lacks is stored`, async () => {
      const {f, qr} = setup();
      try {
        const sizes = p.size ? ['中', '大'] : [undefined], spices = p.spicy ? ['不辣', '小', '中', '大'] : [undefined];
        for (const size of sizes) for (const spice of spices) {
          const mods = {...(size ? {size} : {}), ...(spice ? {spice} : {}), note: ''};
          const res = await qr({table: 'T03', idempotencyKey: key('dish'), items: [{productId: p.id, qty: 2, mods}]});
          assert.equal(res.status, 201, JSON.stringify(res.data));
          const it = res.data.order.items[0], price = size === '大' ? p.large_price : p.price;
          assert.equal(it.price, price);
          assert.equal(res.data.order.total, price * 2);
          assert.equal(it.mods.size, size);
          assert.equal(it.mods.spice, spice);
        }
        if (!p.size) assert.equal((await qr({table: 'T03', idempotencyKey: key('big'), items: [{productId: p.id, qty: 1, mods: {size: '大'}}]})).status, 400, 'no large bowl of a one-size dish');
        if (!p.spicy) assert.equal((await qr({table: 'T03', idempotencyKey: key('hot'), items: [{productId: p.id, qty: 1, mods: {spice: '大'}}]})).status, 400, 'no spice level for a dish without one');
      } finally { f.db.close(); }
    });
  }
}

// ---------- 2. Customer input the QR page must refuse (or accept) cleanly ----------
const qrCases = [
  ['table T01', {table: 'T01'}, 201], ['table t09 lower case', {table: 't09'}, 201], ['table T99', {table: 'T99'}, 201],
  ['take-away', {table: 'TAKEAWAY'}, 201], ['take-away lower case', {table: 'takeaway'}, 201],
  ['table T00', {table: 'T00'}, 400], ['table T100', {table: 'T100'}, 400], ['empty table', {table: ''}, 400],
  ['table missing', {table: undefined}, 400], ['table as a number', {table: 5}, 400], ['table X1', {table: 'X1'}, 400],
  ['table with spaces is trimmed', {table: ' T05 '}, 201], ['table script', {table: '<script>'}, 400],
  ['qty 1', {qty: 1}, 201], ['qty 30', {qty: 30}, 201], ['qty 0', {qty: 0}, 400], ['qty -1', {qty: -1}, 400],
  ['qty 1.5', {qty: 1.5}, 400], ['qty 31', {qty: 31}, 400], ['qty "2" as text', {qty: '2'}, 400], ['qty null', {qty: null}, 400],
  ['unknown dish', {productId: '999'}, 400], ['dish id as number', {productId: 101}, 201], ['empty dish id', {productId: ''}, 400],
  ['mods missing', {mods: undefined}, 201], ['mods null', {mods: null}, 201], ['mods array', {mods: []}, 400], ['mods string', {mods: 'x'}, 400],
  ['size unknown', {mods: {size: 'XL'}}, 400], ['spice unknown', {mods: {spice: '超辣'}}, 400],
  ['note 100 chars', {mods: {note: 'a'.repeat(100)}}, 201], ['note 500 chars is cut', {mods: {note: 'b'.repeat(500)}}, 201],
  ['note Chinese and emoji', {mods: {note: '少辣 🌶️ không hành'}}, 201], ['note with HTML', {mods: {note: '<img src=x onerror=alert(1)>'}}, 201],
  ['note as number', {mods: {note: 12345}}, 201],
];
for (const [name, patch, status] of qrCases) {
  test(`SIM QR input: ${name} → ${status}`, async () => {
    const {f, qr} = setup();
    try {
      const item = {productId: '101', qty: 1, mods: {size: '中', spice: '中', note: ''}};
      for (const k of ['productId', 'qty', 'mods']) if (k in patch) { if (patch[k] === undefined) delete item[k]; else item[k] = patch[k]; }
      const body = {table: 'table' in patch ? patch.table : 'T02', idempotencyKey: key('input'), items: [item]};
      if (body.table === undefined) delete body.table;
      const res = await qr(body);
      if (status === 201) {
        assert.equal(res.status, 201, JSON.stringify(res.data));
        const it = res.data.order.items[0];
        assert.ok(typeof it.mods.note === 'string' && it.mods.note.length <= 100, 'note is text of at most 100 characters');
        assert.equal(res.data.order.total, it.price * it.qty);
        assert.match(res.data.order.table, /^(T\d\d|TAKEAWAY)$/);
      } else assertJsonError(res, status, name);
    } finally { f.db.close(); }
  });
}
const cartCases = [
  ['empty cart', () => [], 400], ['cart not a list', () => 'x', 400], ['30 lines', () => Array.from({length: 30}, () => ({productId: '113', qty: 1, mods: {spice: '中'}})), 201],
  ['31 lines', () => Array.from({length: 31}, () => ({productId: '113', qty: 1, mods: {}})), 400],
  ['60 portions', () => [{productId: '115', qty: 30}, {productId: '116', qty: 30}], 201], ['61 portions', () => [{productId: '115', qty: 30}, {productId: '116', qty: 30}, {productId: '117', qty: 1}], 400],
  ['a null line', () => [null], 400], ['every dish once', null, 201],
];
for (const [name, items, status] of cartCases) {
  test(`SIM QR cart: ${name} → ${status}`, async () => {
    const {f, qr, products} = setup();
    try {
      const list = items ? items() : products.map(p => ({productId: p.id, qty: 1, mods: modsFor(p, rng(1))}));
      const res = await qr({table: 'T04', idempotencyKey: key('cart'), items: list});
      if (status === 201) {
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.order.total, res.data.order.items.reduce((s, x) => s + x.price * x.qty, 0));
      } else assertJsonError(res, status, name);
    } finally { f.db.close(); }
  });
}
test('SIM QR idempotency: a retried submission returns the same order; a reused key with another cart is refused', async () => {
  const {f, qr} = setup();
  try {
    const k = key('retry'), body = {table: 'T06', idempotencyKey: k, items: [{productId: '110', qty: 1, mods: {size: '中', spice: '小', note: ''}}]};
    const a = await qr(body), b = await qr(body);
    assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.data.duplicate, true); assert.equal(b.data.order.id, a.data.order.id);
    assertJsonError(await qr({...body, items: [{...body.items[0], qty: 2}]}), 409, 'reused key');
    for (const bad of ['short', 'x'.repeat(101), 'has space here 123456', '', null]) assertJsonError(await qr({...body, idempotencyKey: bad}), 400, 'bad key ' + bad);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM qr_orders').get().n, 1);
  } finally { f.db.close(); }
});
test('SIM QR the customer can read their own order with its token and nobody else can', async () => {
  const {f, qr} = setup();
  try {
    const res = await qr({table: 'T07', idempotencyKey: key('read'), items: [{productId: '112', qty: 1, mods: {size: '中', spice: '中', note: ''}}]});
    const id = res.data.order.id, token = res.data.orderToken;
    assert.ok(token);
    assert.equal((await f.call('/api/orders/' + id, 'GET', null, {'x-order-token': token})).status, 200);
    assertJsonError(await f.call('/api/orders/' + id, 'GET', null, {'x-order-token': token + 'x'}), 403, 'wrong token');
    assertJsonError(await f.call('/api/orders/' + id, 'GET'), 400, 'no token');
    assertJsonError(await f.call('/api/orders/' + crypto.randomUUID(), 'GET', null, {'x-order-token': token}), 404, 'other order');
  } finally { f.db.close(); }
});
test('SIM QR one phone cannot flood the kitchen: orders from one address are limited, other tables still order', async () => {
  const {f} = setup();
  try {
    const statuses = [];
    for (let i = 0; i < 64; i++) statuses.push((await f.call('/api/orders', 'POST', {table: 'T08', idempotencyKey: key('flood'), items: [{productId: '113', qty: 1, mods: {}}]}, {'CF-Connecting-IP': '203.0.113.9'})).status);
    assert.deepEqual(statuses.slice(0, 60), Array(60).fill(201), 'a whole shop on one Wi-Fi can send 60 orders in 15 minutes');
    assert.deepEqual(statuses.slice(60), Array(4).fill(429), 'then the flood is stopped');
    assert.equal((await f.call('/api/orders', 'POST', {table: 'T09', idempotencyKey: key('other'), items: [{productId: '113', qty: 1, mods: {}}]}, {'CF-Connecting-IP': '203.0.113.10'})).status, 201);
  } finally { f.db.close(); }
});

// ---------- 3. Random order lifecycles on the handheld, checked against money invariants ----------
async function lifecycle(seed, {taxMode = 'INCLUSIVE', taxRate = 0} = {}) {
  const r = rng(seed), {f, owner, cashier, products, qr, detail, daily} = setup();
  try {
    f.db.prepare('UPDATE pos_store_config SET tax_mode=?,tax_rate=?').run(taxMode, taxRate);
    const line = () => { const p = pick(r, products); return {productId: p.id, qty: int(r, 1, 3), mods: modsFor(p, r)}; };
    const fromQr = r() < 0.5, items = Array.from({length: int(r, 1, 4)}, line);
    const created = fromQr ? await qr({table: 'T' + String(int(r, 1, 30)).padStart(2, '0'), idempotencyKey: key('life'), items})
      : await f.call('/api/staff/orders', 'POST', {table: 'T11', items, idempotencyKey: key('life')}, cashier.headers);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const id = created.data.order.id;
    const check = d => {
      const o = d.order, sub = o.items.reduce((s, x) => s + x.price * x.qty, 0);
      assert.equal(o.subtotal, sub, 'subtotal = sum of lines');
      const base = sub - o.discount, tax = taxMode === 'EXCLUSIVE' ? Math.round(base * taxRate / 10000) : Math.round(base * taxRate / (10000 + taxRate));
      assert.equal(o.taxAmount, tax, 'tax');
      assert.equal(o.total, base + (taxMode === 'EXCLUSIVE' ? tax : 0), 'total');
    };
    let d = await detail(id); check(d);
    for (let i = int(r, 0, 2); i > 0; i--) {
      const res = await f.call(`/api/staff/orders/${id}/append`, 'POST', {version: d.order.version, items: [line()], idempotencyKey: key('add')}, cashier.headers);
      assert.equal(res.status, 200, JSON.stringify(res.data)); d = res.data; check(d);
    }
    assertJsonError(await f.call(`/api/staff/orders/${id}/append`, 'POST', {version: d.order.version - 1, items: [line()]}, cashier.headers), 409, 'stale version');
    for (let i = int(r, 0, 2); i > 0 && d.order.items.reduce((n, x) => n + x.qty, 0) > 1; i--) {
      const res = await f.call(`/api/staff/orders/${id}/cancel-unit`, 'POST', {version: d.order.version, index: int(r, 0, d.order.items.length - 1), reason: 'khách đổi ý'}, cashier.headers);
      assert.equal(res.status, 200, JSON.stringify(res.data)); d = res.data; check(d);
    }
    const units = d.order.items.reduce((n, x) => n + x.qty, 0);
    let paid = 0;
    if (units >= 2 && r() < 0.5) {
      const k = int(r, 2, Math.min(units, 4)), parts = Array.from({length: k}, () => []), flat = [];
      d.order.items.forEach((x, index) => { for (let q = 0; q < x.qty; q++) flat.push(index); });
      flat.forEach((index, n) => { const part = n < k ? parts[n] : pick(r, parts); const hit = part.find(y => y.index === index); if (hit) hit.qty++; else part.push({index, qty: 1}); });
      const res = await f.call(`/api/staff/orders/${id}/split`, 'POST', {version: d.order.version, parts}, cashier.headers);
      assert.equal(res.status, 200, JSON.stringify(res.data)); d = res.data;
      assert.equal(d.bills.reduce((s, b) => s + b.total, 0), d.order.total, 'bills add up to the order');
      assert.equal(d.bills.reduce((s, b) => s + b.taxAmount, 0), d.order.taxAmount, 'bill taxes add up');
      if (d.bills.length > 2 && r() < 0.5) {
        const m = await f.call(`/api/staff/orders/${id}/merge-bills`, 'POST', {version: d.order.version, billIds: [d.bills[0].id, d.bills[1].id]}, cashier.headers);
        assert.equal(m.status, 200, JSON.stringify(m.data)); d = m.data;
        assert.equal(d.bills.filter(b => b.paymentStatus === 'UNPAID').reduce((s, b) => s + b.total, 0), d.order.total, 'merged bills still add up');
      }
      for (const b of d.bills.filter(x => x.paymentStatus === 'UNPAID')) {
        const method = r() < 0.5 ? 'CASH' : 'BANK', received = b.total + int(r, 0, 5) * 10000;
        const res2 = await f.call(`/api/staff/bills/${b.id}/pay`, 'POST', {method, received}, cashier.headers);
        assert.equal(res2.status, 200, JSON.stringify(res2.data)); paid += b.total;
        assertJsonError(await f.call(`/api/staff/bills/${b.id}/pay`, 'POST', {method, received}, cashier.headers), 409, 'bill paid twice');
      }
      d = await detail(id);
      assert.equal(d.order.paymentStatus, 'PAID', 'the order is paid once every bill is');
    } else {
      if (d.order.total > 0) assertJsonError(await f.call(`/api/staff/orders/${id}/pay`, 'POST', {version: d.order.version, method: 'CASH', received: d.order.total - 1}, cashier.headers), 400, 'cash short by 1 đ');
      const method = r() < 0.5 ? 'CASH' : 'BANK', received = d.order.total + int(r, 0, 9) * 5000;
      const res = await f.call(`/api/staff/orders/${id}/pay`, 'POST', {version: d.order.version, method, received}, cashier.headers);
      assert.equal(res.status, 200, JSON.stringify(res.data)); d = res.data; paid = d.order.total;
      if (method === 'CASH') { assert.equal(d.order.cashChange, received - d.order.total); }
      assertJsonError(await f.call(`/api/staff/orders/${id}/pay`, 'POST', {version: d.order.version, method, received}, cashier.headers), 409, 'paid twice');
      assertJsonError(await f.call(`/api/staff/orders/${id}/append`, 'POST', {version: d.order.version, items: [line()]}, cashier.headers), 409, 'no adding to a paid order');
    }
    const rep = await daily();
    assert.equal(rep.ok, true, JSON.stringify(rep));
    const text = JSON.stringify(rep);
    assert.ok(text.includes(String(paid)) || paid === 0, `daily report shows the ${paid} đ taken`);
    return {paid, report: rep};
  } finally { f.db.close(); }
}
for (let seed = 1; seed <= 40; seed++) test(`SIM lifecycle seed ${seed}: order, add, cancel, split/merge, pay — totals, taxes and bills always add up`, () => lifecycle(seed));
for (let seed = 101; seed <= 115; seed++) test(`SIM lifecycle seed ${seed} with 8% tax added on top`, () => lifecycle(seed, {taxMode: 'EXCLUSIVE', taxRate: 800}));
for (let seed = 201; seed <= 210; seed++) test(`SIM lifecycle seed ${seed} with 10% tax included`, () => lifecycle(seed, {taxMode: 'INCLUSIVE', taxRate: 1000}));

test('SIM the daily report counts exactly what was paid: 12 orders, mixed cash/bank, one cancelled, one unpaid', async () => {
  const {f, cashier, owner, detail} = setup();
  try {
    let cash = 0, bank = 0;
    for (let i = 0; i < 12; i++) {
      const o = (await f.call('/api/staff/orders', 'POST', {table: 'T' + String(i + 1).padStart(2, '0'), items: [{productId: '110', qty: i + 1, mods: {size: '中', spice: '中', note: ''}}], idempotencyKey: key('day')}, cashier.headers)).data.order;
      const d = await detail(o.id);
      if (i === 10) { assert.equal((await f.call(`/api/staff/orders/${o.id}/cancel`, 'POST', {version: d.order.version, reason: 'khách về'}, cashier.headers)).status, 200); continue; }
      if (i === 11) continue;
      const method = i % 2 ? 'BANK' : 'CASH';
      assert.equal((await f.call(`/api/staff/orders/${o.id}/pay`, 'POST', {version: d.order.version, method, received: d.order.total}, cashier.headers)).status, 200);
      if (method === 'CASH') cash += d.order.total; else bank += d.order.total;
    }
    const rep = (await f.call('/api/staff/reports/daily?date=' + VN(), 'GET', null, owner.headers)).data;
    const text = JSON.stringify(rep);
    assert.ok(text.includes(String(cash + bank)), `total ${cash + bank} in ${text.slice(0, 400)}`);
    assert.ok(text.includes(String(cash)) && text.includes(String(bank)), 'cash and bank totals');
  } finally { f.db.close(); }
});

// ---------- 4. Vouchers on the QR page ----------
const voucherCases = [
  ['fixed 20k, spend enough', {kind: 'FIXED', value: 20000, minSpend: 100000}, [['110', 2]], 201, 20000],
  ['fixed 20k, below min spend', {kind: 'FIXED', value: 20000, minSpend: 200000}, [['110', 1]], 'VOUCHER_MIN', 0],
  ['10% off', {kind: 'PERCENT', value: 10, minSpend: 0}, [['101', 1]], 201, 13000],
  ['10% off capped at 5k', {kind: 'PERCENT', value: 10, minSpend: 0, maxDiscount: 5000}, [['101', 1]], 201, 5000],
  ['fixed bigger than the bill', {kind: 'FIXED', value: 500000, minSpend: 0}, [['113', 1]], 201, 50000],
  ['inactive voucher', {kind: 'FIXED', value: 10000, minSpend: 0, active: false}, [['110', 1]], 'INVALID_VOUCHER', 0],
  ['expired voucher', {kind: 'FIXED', value: 10000, minSpend: 0, endsAt: new Date(Date.now() - 60000).toISOString()}, [['110', 1]], 'INVALID_VOUCHER', 0],
  ['not started yet', {kind: 'FIXED', value: 10000, minSpend: 0, startsAt: new Date(Date.now() + 3600000).toISOString()}, [['110', 1]], 'INVALID_VOUCHER', 0],
  ['members only, guest', {kind: 'FIXED', value: 10000, minSpend: 0, memberOnly: true}, [['110', 1]], 'MEMBER_REQUIRED', 0],
  ['used up', {kind: 'FIXED', value: 10000, minSpend: 0, maxUses: 1, useFirst: true}, [['110', 1]], 'VOUCHER_FULL', 0],
];
for (const [name, v, lines, status, discount] of voucherCases) {
  test(`SIM QR voucher: ${name} → ${status}`, async () => {
    const {f, owner, qr} = setup();
    try {
      const code = ('QA' + crypto.randomUUID().replaceAll('-', '').slice(0, 8)).toUpperCase();
      const made = await f.call('/api/staff/vouchers', 'POST', {code, titleVi: 'QA', titleZh: 'QA', kind: v.kind, value: v.value, minSpend: v.minSpend, maxDiscount: v.maxDiscount || 0, memberOnly: !!v.memberOnly, active: v.active !== false, listed: true, startsAt: v.startsAt || new Date(Date.now() - 3600000).toISOString(), endsAt: v.endsAt || new Date(Date.now() + 86400000).toISOString(), maxUses: v.maxUses || 0, perMemberLimit: 0}, owner.headers);
      assert.ok([200, 201].includes(made.status), JSON.stringify(made.data));
      const items = lines.map(([productId, qty]) => ({productId, qty, mods: {size: '中', spice: '中', note: ''}}));
      if (v.useFirst) assert.equal((await qr({table: 'T10', idempotencyKey: key('v1'), voucherCode: code, items})).status, 201);
      const res = await qr({table: 'T10', idempotencyKey: key('v'), voucherCode: code.toLowerCase(), items});
      if (status === 201) {
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.order.discount, discount);
        assert.equal(res.data.order.total, res.data.order.subtotal - discount);
      } else {
        assert.ok(res.status >= 400 && res.status < 500, `${name}: ${res.status} ${JSON.stringify(res.data)}`);
        assert.equal(res.data.code, status, name);
        assert.ok(res.data.message, 'the customer is told why');
      }
    } finally { f.db.close(); }
  });
}

// ---------- 5. Member phone numbers and first password ----------
const phones = [
  ['0909123456', '0909123456'], ['09091234567', '09091234567'], ['+84909123456', '0909123456'], ['84909123456', '0909123456'],
  ['+840909123456', '0909123456'], ['0909 123 456', '0909123456'], ['0909-123-456', '0909123456'], ['(0909) 123.456', '0909123456'],
  ['+886912345678', '+886912345678'], ['+886 912 345 678', '+886912345678'], ['+8613812345678', '+8613812345678'], ['+86 138 1234 5678', '+8613812345678'], ['+861381234567890', ''], // PT-39: mainland China mobile, + and 13 digits = 14 characters ['+12025550123', '+12025550123'],
  ['+6591234567', ''], ['090912345', ''], ['090912345678', ''], ['9091234567', ''], ['+0909123456', ''], ['+88691234567890', ''],
  ['abc', ''], ['', ''], ['0909１２３４５６', ''], ['+84 0909 123 456', '0909123456'],
];
for (const [input, stored] of phones) {
  test(`SIM member phone "${input}" → ${stored || 'refused'}; the first password is the last 6 digits`, async () => {
    const {f} = setup();
    try {
      const ip = nextIp(), res = await f.call('/api/member/register', 'POST', {phone: input, name: 'Khách Thử'}, {'CF-Connecting-IP': ip});
      if (!stored) { assertJsonError(res, 400, input); return; }
      assert.ok([200, 201].includes(res.status), JSON.stringify(res.data));
      assert.equal(f.db.prepare('SELECT phone FROM members').get().phone, stored);
      const six = stored.replace(/\D/g, '').slice(-6);
      assert.equal((await f.call('/api/member/login', 'POST', {phone: input, password: six}, {'CF-Connecting-IP': nextIp()})).status, 200, 'last 6 digits');
      assert.equal((await f.call('/api/member/login', 'POST', {phone: stored, password: six}, {'CF-Connecting-IP': nextIp()})).status, 200, 'stored form');
      assertJsonError(await f.call('/api/member/login', 'POST', {phone: input, password: '000000'}, {'CF-Connecting-IP': nextIp()}), 401, 'wrong password');
      assertJsonError(await f.call('/api/member/register', 'POST', {phone: input, name: 'Lần hai'}, {'CF-Connecting-IP': nextIp()}), 409, 'registered twice');
    } finally { f.db.close(); }
  });
}
test('SIM member names: too short, too long, HTML and Chinese', async () => {
  const {f} = setup();
  try {
    const reg = (phone, name) => f.call('/api/member/register', 'POST', {phone, name}, {'CF-Connecting-IP': nextIp()});
    assertJsonError(await reg('0911000001', 'A'), 400, 'one letter');
    assertJsonError(await reg('0911000002', ''), 400, 'empty');
    assert.ok([200, 201].includes((await reg('0911000003', '陈小姐')).status));
    assert.ok([200, 201].includes((await reg('0911000004', '<b>Lan</b>')).status));
    const long = await reg('0911000005', 'N'.repeat(200));
    assert.ok([200, 201, 400].includes(long.status), JSON.stringify(long.data));
    if (long.status !== 400) 
    assert.ok(f.db.prepare("SELECT display_name FROM members WHERE phone='0911000005'").get().display_name.length <= 80);
  } finally { f.db.close(); }
});
test('SIM member password guessing is stopped after 8 tries from one phone, and a right password later still works', async () => {
  const {f} = setup();
  try {
    await f.call('/api/member/register', 'POST', {phone: '0922333444', name: 'Khách'}, {'CF-Connecting-IP': nextIp()});
    const ip = '198.51.100.7', st = [];
    for (let i = 0; i < 10; i++) st.push((await f.call('/api/member/login', 'POST', {phone: '0922333444', password: String(100000 + i)}, {'CF-Connecting-IP': ip})).status);
    assert.deepEqual(st.slice(0, 8), Array(8).fill(401)); assert.equal(st[9], 429);
    assert.equal((await f.call('/api/member/login', 'POST', {phone: '0922333444', password: '333444'}, {'CF-Connecting-IP': nextIp()})).status, 200);
  } finally { f.db.close(); }
});

// ---------- 6. Every staff route refuses strangers and answers in JSON ----------
const staffGets = ['/api/staff/me', '/api/staff/orders', '/api/staff/summary', '/api/staff/sync-meta', '/api/staff/paid-labels', '/api/staff/service-requests',
  '/api/staff/products', '/api/staff/vouchers', '/api/staff/customers', '/api/staff/inventory', '/api/staff/refunds', '/api/staff/roles', '/api/staff/accounts',
  '/api/staff/schedules', '/api/staff/attendance', '/api/staff/cash-shifts', '/api/staff/report-shifts', '/api/staff/store', '/api/staff/display', '/api/staff/license',
  '/api/staff/shift-ops', '/api/staff/members?phone=0909123456', '/api/staff/reports/daily?date=2026-10-05', '/api/staff/reports/analytics?date=2026-10-05',
  '/api/staff/reports/shift?date=2026-10-05', '/api/staff/reports/workers?date=2026-10-05'];
for (const path of staffGets) {
  test(`SIM auth ${path}: no token → 401 JSON; forged token → 401 JSON`, async () => {
    const {f} = setup();
    try {
      assertJsonError(await f.call(path, 'GET'), 401, 'no token');
      assertJsonError(await f.call(path, 'GET', null, {Authorization: 'Bearer ' + 'f'.repeat(64)}), 401, 'forged token');
    } finally { f.db.close(); }
  });
}
const ownerOnly = ['/api/staff/reports/daily?date=2026-10-05', '/api/staff/reports/analytics?date=2026-10-05', '/api/staff/store', '/api/staff/accounts', '/api/staff/roles'];
for (const path of ownerOnly) {
  test(`SIM permission ${path}: a cashier is refused with 403 JSON, the owner gets 200`, async () => {
    const {f, owner, cashier} = setup();
    try {
      assertJsonError(await f.call(path, 'GET', null, cashier.headers), 403, 'cashier');
      assert.equal((await f.call(path, 'GET', null, owner.headers)).status, 200);
    } finally { f.db.close(); }
  });
}
const kitchenRefused = [['POST', '/api/staff/orders', {table: 'T01', items: [], idempotencyKey: 'kitchen_role_order_000001'}], ['GET', '/api/staff/refunds'], ['POST', '/api/staff/customers', {phone: '0909000111', name: 'Bếp tạo'}]];
for (const [method, path, body] of kitchenRefused) {
  test(`SIM permission: the kitchen role cannot ${method} ${path}`, async () => {
    const {f} = setup();
    try { assertJsonError(await f.call(path, method, body || null, f.actor('KITCHEN').headers), 403, 'kitchen'); } finally { f.db.close(); }
  });
}
const badBodies = ['/api/orders', '/api/member/register', '/api/member/login', '/api/vouchers/validate', '/api/staff/orders', '/api/staff/members/register', '/api/staff/voucher'];
for (const path of badBodies) {
  test(`SIM robustness ${path}: broken JSON, wrong content type and a huge body get a 4xx JSON answer, never a crash`, async () => {
    const {f, cashier} = setup(), worker = (await import('../src/worker.js')).default;
    try {
      const send = async (body, type) => {
        const res = await worker.fetch(new Request('https://pos.test' + path, {method: 'POST', headers: {Origin: 'https://pos.test', 'Content-Type': type, 'CF-Connecting-IP': nextIp(), ...cashier.headers}, body}), f.env);
        const text = await res.text(); let data; try { data = JSON.parse(text); } catch { assert.fail(`${path} answered non-JSON (${res.status}): ${text.slice(0, 80)}`); }
        return {status: res.status, data};
      };
      for (const [body, type] of [['{"table":', 'application/json'], ['table=T01', 'application/x-www-form-urlencoded'], ['x'.repeat(300000), 'application/json'], ['[]', 'application/json'], ['null', 'application/json']]) {
        const res = await send(body, type);
        assert.ok(res.status >= 400 && res.status < 500, `${path} ${type} ${body.slice(0, 12)} → ${res.status} ${JSON.stringify(res.data)}`);
        assert.equal(res.data.ok, false);
      }
    } finally { f.db.close(); }
  });
}
test('SIM robustness: unknown API paths and wrong methods answer JSON 404/405', async () => {
  const {f, cashier} = setup();
  try {
    assertJsonError(await f.call('/api/nothing', 'GET'), 404, 'unknown public');
    assertJsonError(await f.call('/api/staff/nothing', 'GET', null, cashier.headers), 404, 'unknown staff');
    assertJsonError(await f.call('/api/catalog', 'POST', {}), 405, 'POST catalog');
    assertJsonError(await f.call('/api/orders', 'GET'), 405, 'GET orders');
    assertJsonError(await f.call('/api/staff/orders/not-a-uuid', 'GET', null, cashier.headers), 404, 'bad id');
  } finally { f.db.close(); }
});
test('SIM robustness: a request from another website cannot place a QR order or log a member in', async () => {
  const {f} = setup();
  try {
    const worker = (await import('../src/worker.js')).default;
    for (const path of ['/api/orders', '/api/member/login']) {
      const res = await worker.fetch(new Request('https://pos.test' + path, {method: 'POST', headers: {Origin: 'https://evil.example', 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp()}, body: JSON.stringify({table: 'T01', phone: '0909123456', password: '123456', idempotencyKey: key('evil'), items: [{productId: '113', qty: 1}]})}), f.env);
      assert.equal(res.status, 403, path);
    }
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM qr_orders').get().n, 0);
  } finally { f.db.close(); }
});

// ---------- 7. Races between devices ----------
test('SIM race: two handhelds pay the same order at once — exactly one succeeds', async () => {
  const {f, cashier, detail} = setup();
  try {
    const o = (await f.order(cashier)).data.order, d = await detail(o.id), other = f.actor('CASHIER');
    const res = await Promise.all([cashier, other].map(a => f.call(`/api/staff/orders/${o.id}/pay`, 'POST', {version: d.order.version, method: 'CASH', received: d.order.total}, a.headers)));
    assert.deepEqual(res.map(x => x.status).sort(), [200, 409]);
  } finally { f.db.close(); }
});
test('SIM race: a double-tapped "add items" with one request key adds once', async () => {
  const {f, cashier, detail} = setup();
  try {
    const o = (await f.order(cashier)).data.order, d = await detail(o.id), k = key('dbl');
    const body = {version: d.order.version, items: [{productId: '113', qty: 1, mods: {spice: '中', note: ''}}], idempotencyKey: k};
    const res = await Promise.all([1, 2].map(() => f.call(`/api/staff/orders/${o.id}/append`, 'POST', body, cashier.headers)));
    assert.ok(res.every(x => x.status === 200), JSON.stringify(res.map(x => x.data)));
    assert.equal((await detail(o.id)).order.items.length, 2);
  } finally { f.db.close(); }
});
test('SIM race: the same QR cart sent twice at once becomes one order', async () => {
  const {f} = setup();
  try {
    const body = {table: 'T12', idempotencyKey: key('twice'), items: [{productId: '108', qty: 1, mods: {size: '中', spice: '中', note: ''}}]};
    const res = await Promise.all([1, 2].map(() => f.call('/api/orders', 'POST', body, {'CF-Connecting-IP': nextIp()})));
    assert.equal(new Set(res.map(x => x.data.order?.id)).size, 1, JSON.stringify(res.map(x => [x.status, x.data.code])));
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM qr_orders').get().n, 1);
  } finally { f.db.close(); }
});
test('SIM race: cancelling an item while another device pays — the order never ends paid with a wrong total', async () => {
  const {f, cashier, detail} = setup();
  try {
    const o = (await f.call('/api/staff/orders', 'POST', {table: 'T13', items: [{productId: '110', qty: 2, mods: {size: '中', spice: '中', note: ''}}], idempotencyKey: key('rc')}, cashier.headers)).data.order;
    const d = await detail(o.id);
    await Promise.all([
      f.call(`/api/staff/orders/${o.id}/cancel-unit`, 'POST', {version: d.order.version, index: 0, reason: 'đổi món'}, cashier.headers),
      f.call(`/api/staff/orders/${o.id}/pay`, 'POST', {version: d.order.version, method: 'CASH', received: d.order.total}, cashier.headers),
    ]);
    const end = (await detail(o.id)).order;
    assert.equal(end.total, end.items.reduce((s, x) => s + x.price * x.qty, 0) - end.discount);
    if (end.paymentStatus === 'PAID') assert.equal(end.cashReceived - end.cashChange, end.total, 'the cash taken matches the final total');
  } finally { f.db.close(); }
});
test('SIM race: a kitchen slip is claimed by only one printer', async () => {
  const {f, cashier} = setup();
  try {
    const o = (await f.order(cashier)).data.order;
    const job = f.db.prepare('SELECT id FROM pos_kitchen_jobs WHERE order_id=?').get(o.id);
    assert.ok(job, 'the order made a kitchen slip');
    const res = await Promise.all([1, 2, 3].map(() => f.call(`/api/staff/jobs/${job.id}/claim`, 'POST', {}, cashier.headers)));
    assert.deepEqual(res.map(x => x.status).sort(), [200, 409, 409]);
  } finally { f.db.close(); }
});
