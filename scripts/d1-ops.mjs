// Manual operations on the production D1, run from the "D1 ops" workflow (main only, CLOUDFLARE_API_TOKEN).
// The repository is public, so annotations and logs carry counts and checks only: no names, phones or IDs.
//   node scripts/d1-ops.mjs inspect                  staff and schedule health for the shift screens
//   PLAN='<json>' node scripts/d1-ops.mjs fixed-shifts   add fixed shifts: [{name,startTime,endTime,startsOn,staff:[display name|username]}]
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const database = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8')).d1_databases[0].database_name;
const say = (level, text) => console.log(process.env.GITHUB_ACTIONS ? `::${level}::${text.replace(/\r?\n/g, ' | ').slice(0, 3000)}` : `${level.toUpperCase()}: ${text}`);
const fail = text => { say('error', text); process.exit(1); };
function query(sql) {
  const r = spawnSync(process.execPath, [wrangler, 'd1', 'execute', database, '--remote', '--json', '--command', sql], {cwd: root, env: process.env, encoding: 'utf8'});
  const out = (r.stdout || '').trim(), start = out.indexOf('[');
  if (r.status !== 0 || start < 0) fail('D1 query failed: ' + (r.stderr || out).slice(0, 600));
  const data = JSON.parse(out.slice(start))[0];
  if (!data?.success) fail('D1 query failed');
  return data.results || [];
}
const q = v => v === null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);

const task = process.argv[2];
if (task === 'inspect') {
  const staff = query('SELECT id,active,role_id FROM pos_staff_users');
  say('notice', `Staff: ${staff.length} accounts, ${staff.filter(x => x.active).length} active; ` +
    staff.map((x, i) => `#${i + 1} ${x.role_id}${x.active ? '' : ' (inactive)'} id ${UUID.test(x.id) ? 'uuid' : 'NOT uuid (len ' + String(x.id).length + ')'}`).join('; '));
  const rows = query(`SELECT work_date,staff_id,start_time,end_time FROM pos_shift_schedules WHERE work_date>=${q(dayBefore(today))} ORDER BY work_date,start_time`);
  say('notice', `Schedules from ${dayBefore(today)} (today ${today}): ${rows.length} rows; ` + rows.map(x => `${x.work_date} ${x.start_time}-${x.end_time} ${x.staff_id === 'OWNER' ? 'OWNER' : UUID.test(x.staff_id) ? 'staff' : 'NOT uuid'}`).join('; '));
  const fixed = query("SELECT name FROM sqlite_master WHERE type='table' AND name='pos_fixed_shifts'").length ? query('SELECT starts_on,generated_until,active,start_time,end_time,staff_json FROM pos_fixed_shifts ORDER BY start_time') : null;
  say('notice', fixed ? `Fixed shifts: ${fixed.length}; ` + fixed.map(x => `${x.start_time}-${x.end_time} from ${x.starts_on} generated to ${x.generated_until}, ${JSON.parse(x.staff_json).length} staff${x.active ? '' : ' (stopped)'}`).join('; ') : 'Fixed shifts: table not migrated yet');
} else if (task === 'fixed-shifts') {
  let plan;
  try { plan = JSON.parse(process.env.PLAN || ''); } catch { fail('PLAN is not JSON'); }
  if (!Array.isArray(plan) || !plan.length || plan.length > 10) fail('PLAN must list 1-10 shifts');
  const staff = query('SELECT id,username,display_name FROM pos_staff_users WHERE active=1');
  const norm = s => String(s || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const pick = name => {
    const n = norm(name), hits = staff.filter(x => norm(x.display_name) === n || norm(x.username) === n);
    if (hits.length !== 1) fail(`A staff name in the plan matches ${hits.length} active accounts (needs exactly 1)`);
    return hits[0].id;
  };
  const existing = query('SELECT name,start_time,end_time FROM pos_fixed_shifts WHERE active=1');
  const statements = [];
  for (const s of plan) {
    const ok = typeof s.name === 'string' && s.name.trim() && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.startTime) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.endTime) && s.startTime < s.endTime
      && /^\d{4}-\d{2}-\d{2}$/.test(s.startsOn) && s.startsOn >= today && Array.isArray(s.staff) && s.staff.length >= 1 && s.staff.length <= 20;
    if (!ok) fail('A shift in the plan is invalid (name, HH:MM start before end, startsOn today or later, 1-20 staff)');
    if (existing.some(x => norm(x.name) === norm(s.name) && x.start_time === s.startTime && x.end_time === s.endTime)) { say('notice', `Skipped ${s.startTime}-${s.endTime}: an active fixed shift with that name and hours exists`); continue; }
    const ids = [...new Set(s.staff.map(pick))], time = new Date().toISOString();
    statements.push(`INSERT INTO pos_fixed_shifts(id,name,start_time,end_time,staff_json,starts_on,generated_until,active,version,created_by,created_at,updated_by,updated_at) VALUES(${[randomUUID(), s.name.trim().slice(0, 80), s.startTime, s.endTime, JSON.stringify(ids), s.startsOn, dayBefore(s.startsOn), 1, 1, 'OWNER', time, 'OWNER', time].map(q).join(',')})`);
  }
  if (statements.length) query(statements.join(';'));
  say('notice', `Fixed shifts added: ${statements.length}. The Worker fills in the daily schedule the next time a shift screen or report is opened.`);
} else fail('Unknown task: ' + task);
