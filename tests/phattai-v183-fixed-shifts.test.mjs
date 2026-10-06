import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentFixture} from './helpers/current-fixture.mjs';
import {vietnamDay, addDays} from '../src/fixed-shifts.js';

// Owner's request 06/10/2026: three fixed shifts that repeat every day from a start date; only the people change.
// PT-47: a schedule the server refused only said "Dữ liệu nhập không hợp lệ".
const today = vietnamDay();
async function shop() {
  const f = currentFixture(), cashier = f.actor('CASHIER');
  const login = await f.call('/api/staff/login', 'POST', {username: 'huang', password: f.env.POS_STAFF_PASSWORD});
  assert.equal(login.status, 200, JSON.stringify(login.data));
  const owner = {id: 'OWNER', headers: {Authorization: 'Bearer ' + login.data.token}};
  const staff = Object.fromEntries(['linh', 'thao', 'yen linh'].map(n => [n, f.actor('CASHIER').id]));
  for (const [n, id] of Object.entries(staff)) f.db.prepare('UPDATE pos_staff_users SET display_name=? WHERE id=?').run(n, id);
  const rows = (where = '1=1', ...args) => f.db.prepare(`SELECT * FROM pos_shift_schedules WHERE ${where} ORDER BY work_date,start_time,staff_id`).all(...args);
  const create = body => f.call('/api/staff/fixed-shifts', 'POST', body, owner.headers);
  const schedules = from => f.call('/api/staff/schedules?from=' + from, 'GET', null, owner.headers);
  return {f, owner, cashier, staff, rows, create, schedules};
}

test('PT-47 a refused schedule says which field is wrong', async () => {
  const {f, owner, staff, create} = await shop();
  try {
    const bulk = await f.call('/api/staff/schedules/bulk', 'POST', {shiftName: 'CA SANG', staffIds: Object.values(staff), workDate: today, startTime: '10:00', endTime: '02:00', note: ''}, owner.headers);
    assert.equal(bulk.status, 400);
    assert.match(bulk.data.message, /Giờ ra \(02:00\) phải sau giờ vào \(10:00\)/);
    assert.match((await f.call('/api/staff/schedules/bulk', 'POST', {shiftName: '', staffIds: [staff.linh], workDate: today, startTime: '10:00', endTime: '14:00'}, owner.headers)).data.message, /Nhập tên ca/);
    assert.match((await f.call('/api/staff/schedules/bulk', 'POST', {shiftName: 'A', staffIds: [], workDate: today, startTime: '10:00', endTime: '14:00'}, owner.headers)).data.message, /Chọn ít nhất một nhân viên/);
    f.db.prepare('UPDATE pos_staff_users SET active=0 WHERE id=?').run(staff.thao);
    assert.match((await f.call('/api/staff/schedules/bulk', 'POST', {shiftName: 'A', staffIds: [staff.thao], workDate: today, startTime: '10:00', endTime: '14:00'}, owner.headers)).data.message, /bị khóa hoặc xóa/);
    assert.match((await create({name: 'Ca sáng', startTime: '10:00', endTime: '14:00', staffIds: [staff.linh], startsOn: addDays(today, -1)})).data.message, /không được trước hôm nay/);
    assert.equal((await f.call('/api/staff/schedules/bulk', 'POST', {shiftName: 'CA SANG', staffIds: [staff.linh, staff['yen linh']], workDate: today, startTime: '10:00', endTime: '14:00'}, owner.headers)).status, 201, 'a valid shift still saves');
  } finally { f.db.close(); }
});

test('the three shifts of Phát Tài fill in 14 days, each person once per shift, linh on all three back to back', async () => {
  const {f, staff, rows, create, schedules} = await shop();
  try {
    const plan = [['Ca sáng', '10:00', '14:00', ['linh', 'thao', 'yen linh']], ['Ca trưa', '14:00', '17:00', ['yen linh', 'linh']], ['Ca tối', '17:00', '21:00', ['thao', 'linh']]];
    for (const [name, startTime, endTime, people] of plan) assert.equal((await create({name, startTime, endTime, staffIds: people.map(p => staff[p]), startsOn: today})).status, 201);
    const r = await schedules(today);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.fixedShifts.map(x => [x.name, x.startTime, x.endTime, x.staffIds.length, x.startsOn]), [['Ca sáng', '10:00', '14:00', 3, today], ['Ca trưa', '14:00', '17:00', 2, today], ['Ca tối', '17:00', '21:00', 2, today]]);
    assert.equal(r.data.schedules.length, 14 * 7, '7 people-shifts a day for the 14 days shown');
    const day = rows('work_date=?', addDays(today, 5));
    assert.deepEqual(day.filter(x => x.staff_id === staff.linh).map(x => [x.shift_name, x.start_time, x.end_time]), [['Ca sáng', '10:00', '14:00'], ['Ca trưa', '14:00', '17:00'], ['Ca tối', '17:00', '21:00']]);
    assert.ok(day.every(x => x.fixed_shift_id && x.note === ''), 'every row knows its fixed shift');
    await schedules(today); await schedules(addDays(today, 3));
    assert.equal(rows('work_date<?', addDays(today, 14)).length, 14 * 7, 'opening the screen again adds nothing');
    assert.equal(rows('work_date<?', today).length, 0, 'no day before the start date');
  } finally { f.db.close(); }
});

test('a day taken off the schedule (leave, a replacement) is not filled in again', async () => {
  const {f, owner, staff, rows, create, schedules} = await shop();
  try {
    await create({name: 'Ca tối', startTime: '17:00', endTime: '21:00', staffIds: [staff.thao, staff.linh], startsOn: today});
    const target = rows('staff_id=? AND work_date=?', staff.thao, addDays(today, 2))[0];
    assert.equal((await f.call(`/api/staff/schedules/${target.id}/remove`, 'POST', {}, owner.headers)).status, 200);
    await schedules(today);
    assert.equal(rows('staff_id=? AND work_date=?', staff.thao, addDays(today, 2)).length, 0);
    assert.equal(rows('staff_id=? AND work_date=?', staff.linh, addDays(today, 2)).length, 1);
  } finally { f.db.close(); }
});

test('approved leave and an overlapping shift are skipped, not refused', async () => {
  const {f, staff, rows, create} = await shop();
  try {
    f.db.prepare("INSERT INTO pos_leave_requests(id,request_key,request_hash,staff_id,from_date,to_date,leave_type,reason,status,created_at) VALUES('L1','k1','h',?,?,?,'ANNUAL','x','APPROVED',?)").run(staff.thao, addDays(today, 3), addDays(today, 4), new Date().toISOString());
    f.db.prepare("INSERT INTO pos_shift_schedules(id,staff_id,work_date,start_time,end_time,note,created_by,created_at,shift_name) VALUES('00000000-0000-4000-8000-000000000001',?,?,'09:00','11:00','','OWNER',?,'Ca riêng')").run(staff.linh, addDays(today, 1), new Date().toISOString());
    assert.equal((await create({name: 'Ca sáng', startTime: '10:00', endTime: '14:00', staffIds: [staff.thao, staff.linh], startsOn: today})).status, 201);
    assert.deepEqual(rows('staff_id=? AND fixed_shift_id IS NOT NULL AND work_date BETWEEN ? AND ?', staff.thao, addDays(today, 2), addDays(today, 5)).map(x => x.work_date), [addDays(today, 2), addDays(today, 5)]);
    assert.equal(rows('staff_id=? AND work_date=?', staff.linh, addDays(today, 1)).length, 1, 'the 09:00–11:00 shift stays, the fixed one is skipped that day');
  } finally { f.db.close(); }
});

test('changing the people from a start date keeps the days before it and moves the days from it', async () => {
  const {f, owner, staff, rows, create, schedules} = await shop();
  try {
    const id = (await create({name: 'Ca trưa', startTime: '14:00', endTime: '17:00', staffIds: [staff['yen linh'], staff.linh], startsOn: today})).data.id;
    const shift = (await schedules(today)).data.fixedShifts[0];
    const r = await f.call('/api/staff/fixed-shifts/' + id, 'POST', {version: shift.version, name: 'Ca trưa', startTime: '14:00', endTime: '17:00', staffIds: [staff.thao, staff.linh], startsOn: addDays(today, 3)}, owner.headers);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const who = d => rows('work_date=? AND fixed_shift_id=?', d, id).map(x => x.staff_id).sort();
    assert.deepEqual(who(addDays(today, 2)), [staff['yen linh'], staff.linh].sort());
    assert.deepEqual(who(addDays(today, 3)), [staff.thao, staff.linh].sort());
    assert.deepEqual(who(addDays(today, 13)), [staff.thao, staff.linh].sort());
    assert.equal((await f.call('/api/staff/fixed-shifts/' + id, 'POST', {version: shift.version, name: 'x', startTime: '14:00', endTime: '17:00', staffIds: [staff.thao], startsOn: today}, owner.headers)).status, 409, 'an old version is refused');
    assert.deepEqual(who(addDays(today, 3)), [staff.thao, staff.linh].sort(), 'and changes nothing');
  } finally { f.db.close(); }
});

test('stopping a fixed shift keeps today and takes the days after it off', async () => {
  const {f, owner, staff, rows, create, schedules} = await shop();
  try {
    const id = (await create({name: 'Ca tối', startTime: '17:00', endTime: '21:00', staffIds: [staff.thao], startsOn: today})).data.id;
    const shift = (await schedules(today)).data.fixedShifts[0];
    assert.equal((await f.call(`/api/staff/fixed-shifts/${id}/stop`, 'POST', {version: shift.version}, owner.headers)).status, 200);
    assert.deepEqual(rows('fixed_shift_id=?', id).map(x => x.work_date), [today]);
    assert.deepEqual((await schedules(today)).data.fixedShifts, []);
    assert.equal(rows('fixed_shift_id=?', id).length, 1, 'nothing is filled in after it stopped');
  } finally { f.db.close(); }
});

test('only a shift manager edits fixed shifts; the shift report sees them without opening the schedule', async () => {
  const {f, cashier, owner, staff, create} = await shop();
  try {
    assert.equal((await f.call('/api/staff/fixed-shifts', 'POST', {name: 'x', startTime: '10:00', endTime: '14:00', staffIds: [staff.linh], startsOn: today}, cashier.headers)).status, 403);
    f.db.prepare("INSERT INTO pos_fixed_shifts(id,name,start_time,end_time,staff_json,starts_on,generated_until,active,version,created_by,created_at,updated_by,updated_at) VALUES('00000000-0000-4000-8000-0000000000f1','Ca sáng','10:00','14:00',?,?,?,1,1,'OWNER','t','OWNER','t')").run(JSON.stringify([staff.linh]), today, addDays(today, -1));
    const {shiftReport} = await import('../src/reports.js');
    const report = await shiftReport(f.env, today, '10:00', '14:00', 'Ca sáng');
    assert.deepEqual(report.shift.staff.map(x => x.name), ['linh']);
  } finally { f.db.close(); }
});

test('the shift form picks hours from a 24-hour list, not the AM/PM time picker of the SUNMI WebView', () => {
  const STAFF = readFileSync(new URL('../public/staff/staff.js', import.meta.url), 'utf8');
  const APK = readFileSync(new URL('../android/app/src/main/assets/staff/staff.js', import.meta.url), 'utf8');
  assert.match(STAFF, /function hourSelect\(/);
  assert.doesNotMatch(STAFF.slice(STAFF.indexOf('function fixedShiftsCard'), STAFF.indexOf('function fixedShiftsCard') + 4000), /type="time"/);
  assert.match(STAFF, /Giờ ra phải sau giờ vào/);
  assert.equal(APK, STAFF);
});
