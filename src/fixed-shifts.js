// Fixed shifts: fixed hours and staff that repeat every day from a start date (migration 0022).
// They become the ordinary per-day rows of pos_shift_schedules, so every screen that reads the schedule keeps
// working. Each day is filled in once (generated_until): a row the manager deletes for leave or a replacement
// stays deleted. A day already taken by an overlapping shift, approved leave or an inactive account is skipped.
export const vietnamDay = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
export const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
// Days ahead the schedule is filled in: the 14-day handheld view plus the counter's week.
export const HORIZON = 13, MAX_AHEAD = 62;
const UUID_SQL = "lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+abs(random())%4,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))";
const FILL = `WITH RECURSIVE days(d) AS (SELECT ?1 UNION ALL SELECT date(d,'+1 day') FROM days WHERE d<?2),
 people(staff_id) AS (SELECT DISTINCT value FROM json_each(?3))
INSERT INTO pos_shift_schedules(id,staff_id,work_date,start_time,end_time,note,created_by,created_at,shift_name,fixed_shift_id)
SELECT ${UUID_SQL},p.staff_id,days.d,?4,?5,'',?6,?7,?8,?9 FROM days CROSS JOIN people p
WHERE NOT EXISTS(SELECT 1 FROM pos_shift_schedules s WHERE s.staff_id=p.staff_id AND s.work_date=days.d AND s.start_time<?5 AND s.end_time>?4)
 AND NOT EXISTS(SELECT 1 FROM pos_leave_requests l WHERE l.staff_id=p.staff_id AND l.status='APPROVED' AND days.d BETWEEN l.from_date AND l.to_date)
 AND (p.staff_id='OWNER' OR EXISTS(SELECT 1 FROM pos_staff_users u WHERE u.id=p.staff_id AND u.active=1))`;

// Fill in every active fixed shift up to `through` (today + HORIZON by default). One cheap SELECT when nothing is due.
export async function ensureFixedShifts(env, through) {
  const today = vietnamDay();
  through = through && through > addDays(today, HORIZON) ? (through > addDays(today, MAX_AHEAD) ? addDays(today, MAX_AHEAD) : through) : addDays(today, HORIZON);
  const {results: due = []} = await env.DB.prepare('SELECT * FROM pos_fixed_shifts WHERE active=1 AND generated_until<?').bind(through).all();
  const statements = [], time = new Date().toISOString();
  for (const f of due) {
    let from = addDays(f.generated_until, 1);
    if (from < f.starts_on) from = f.starts_on;
    if (from < today) from = today; // never fill in days that are already over
    if (from <= through) statements.push(env.DB.prepare(FILL).bind(from, through, f.staff_json, f.start_time, f.end_time, f.updated_by, time, f.name, f.id));
    statements.push(env.DB.prepare('UPDATE pos_fixed_shifts SET generated_until=? WHERE id=? AND generated_until<?').bind(through, f.id, through));
  }
  if (statements.length) await env.DB.batch(statements);
}
export const fixedShiftPublic = f => ({id: f.id, name: f.name, startTime: f.start_time, endTime: f.end_time, staffIds: JSON.parse(f.staff_json || '[]'), startsOn: f.starts_on, active: !!f.active, version: f.version});
