import {codeForBill} from './order-code.js';
const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function daily(env,date){const day=date||today();if(!validDay(day))return null;
 const orders=(await env.DB.prepare("SELECT o.id,o.id AS orderId,o.code,o.table_id AS tableName,o.source,o.total,o.tax_amount AS taxAmount,o.payment_method AS method,o.paid_at AS paidAt,'ORDER' AS kind FROM qr_orders o WHERE o.payment_status='PAID' AND date(o.paid_at,'+7 hours')=? AND NOT EXISTS(SELECT 1 FROM pos_bills b WHERE b.order_id=o.id) ORDER BY o.paid_at,o.id").bind(day).all()).results;
 const bills=(await env.DB.prepare("SELECT b.id,b.order_id AS orderId,o.code AS parentCode,b.sequence,o.table_id AS tableName,o.source,b.total,b.tax_amount AS taxAmount,b.payment_method AS method,b.paid_at AS paidAt,'BILL' AS kind FROM pos_bills b JOIN qr_orders o ON o.id=b.order_id WHERE b.payment_status='PAID' AND date(b.paid_at,'+7 hours')=? ORDER BY b.paid_at,b.id").bind(day).all()).results.map(b=>({...b,code:codeForBill(b.parentCode,b.method,b.sequence)}));
 const refunds=(await env.DB.prepare("SELECT r.id,r.order_id AS orderId,r.bill_id AS billId,r.amount,r.method,r.reason,r.created_at AS createdAt FROM pos_refunds r WHERE date(r.created_at,'+7 hours')=? ORDER BY r.created_at,r.id").bind(day).all()).results;
 const payments=[...orders,...bills].sort((a,b)=>a.paidAt.localeCompare(b.paidAt)||a.id.localeCompare(b.id));
 const gross=payments.reduce((n,p)=>n+p.total,0),refunded=refunds.reduce((n,r)=>n+r.amount,0);
 const open=(await env.DB.prepare("SELECT COUNT(*) AS n FROM qr_orders WHERE payment_status!='PAID' AND status IN ('NEW','ACCEPTED','SPLIT')").first()).n;
 return {date:day,paidOrders:new Set(payments.map(x=>x.orderId)).size,paidBills:payments.length,gross,refunded,net:gross-refunded,tax:payments.reduce((n,p)=>n+(p.taxAmount||0),0),cash:payments.filter(p=>p.method==='CASH').reduce((n,p)=>n+p.total,0),bank:payments.filter(p=>p.method==='BANK').reduce((n,p)=>n+p.total,0),openOrders:open,payments,refunds};
}

const validClock=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s||'');
export async function shiftReport(env,date,start,end,name=''){
 const day=date||today(),shiftName=String(name||'').trim().slice(0,80);
 if(!validDay(day)||!validClock(start)||!validClock(end)||start===end)return null;
 // A shift that ends at or before it starts runs past midnight into the next day (e.g. 18:00–02:00).
 const endDay=end>start?day:new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const ledger=await windowLedger(env,[{from:day+' '+start+':00',to:endDay+' '+end+':00'}]);
 const staffRows=(await env.DB.prepare("SELECT s.staff_id AS id,COALESCE(u.display_name,CASE WHEN s.staff_id='OWNER' THEN 'Chủ cửa hàng' END,s.staff_id) AS name FROM pos_shift_schedules s LEFT JOIN pos_staff_users u ON u.id=s.staff_id WHERE s.work_date=? AND s.start_time=? AND s.end_time=? AND s.shift_name=? ORDER BY name").bind(day,start,end,shiftName).all()).results;
 return {date:day,reportType:'SHIFT',shift:{name:shiftName||('Ca '+start+'–'+end),start,end,staff:staffRows},...ledger};
}

// Paid orders/bills, refunds and still-open orders inside one or more Vietnam-time windows
// ('YYYY-MM-DD HH:MM:SS', end exclusive). Windows of one report never overlap.
async function windowLedger(env,ranges){
 const within=col=>'('+ranges.map(()=>`(datetime(${col},'+7 hours')>=? AND datetime(${col},'+7 hours')<?)`).join(' OR ')+')';
 const args=ranges.flatMap(r=>[r.from,r.to]);
 const orders=(await env.DB.prepare(`SELECT o.id,o.id AS orderId,o.code,o.table_id AS tableName,o.source,o.total,o.tax_amount AS taxAmount,o.payment_method AS method,o.paid_at AS paidAt,'ORDER' AS kind FROM qr_orders o WHERE o.payment_status='PAID' AND ${within('o.paid_at')} AND NOT EXISTS(SELECT 1 FROM pos_bills b WHERE b.order_id=o.id) ORDER BY o.paid_at,o.id`).bind(...args).all()).results;
 const bills=(await env.DB.prepare(`SELECT b.id,b.order_id AS orderId,o.code AS parentCode,b.sequence,o.table_id AS tableName,o.source,b.total,b.tax_amount AS taxAmount,b.payment_method AS method,b.paid_at AS paidAt,'BILL' AS kind FROM pos_bills b JOIN qr_orders o ON o.id=b.order_id WHERE b.payment_status='PAID' AND ${within('b.paid_at')} ORDER BY b.paid_at,b.id`).bind(...args).all()).results.map(b=>({...b,code:codeForBill(b.parentCode,b.method,b.sequence)}));
 const refunds=(await env.DB.prepare(`SELECT r.id,r.order_id AS orderId,r.bill_id AS billId,r.amount,r.method,r.reason,r.created_at AS createdAt FROM pos_refunds r WHERE ${within('r.created_at')} ORDER BY r.created_at,r.id`).bind(...args).all()).results;
 const payments=[...orders,...bills].sort((a,b)=>a.paidAt.localeCompare(b.paidAt)||a.id.localeCompare(b.id));
 const gross=payments.reduce((n,p)=>n+p.total,0),refunded=refunds.reduce((n,r)=>n+r.amount,0);
 const open=(await env.DB.prepare(`SELECT COUNT(*) AS n FROM qr_orders WHERE payment_status!='PAID' AND status IN ('NEW','ACCEPTED','SPLIT') AND ${within('created_at')}`).bind(...args).first()).n;
 return {paidOrders:new Set(payments.map(x=>x.orderId)).size,paidBills:payments.length,gross,refunded,net:gross-refunded,tax:payments.reduce((n,p)=>n+(p.taxAmount||0),0),cash:payments.filter(p=>p.method==='CASH').reduce((n,p)=>n+p.total,0),bank:payments.filter(p=>p.method==='BANK').reduce((n,p)=>n+p.total,0),openOrders:open,payments,refunds};
}

const OPEN_ATTENDANCE_MAX_MS=16*3600000;
const vnTime=ms=>new Date(ms+7*3600000).toISOString().slice(0,19).replace('T',' ');
// Who worked on a day and when. Clock-in/clock-out (after corrections) is what actually happened,
// so it wins; a person who did not clock in that day falls back to the published schedule.
// A clock-in still open counts until now, at most 16 hours, so a forgotten clock-out cannot swallow the next day.
export async function workedPeriods(env,date,now=Date.now()){
 const day=date||today();if(!validDay(day))return null;
 const name="COALESCE(u.display_name,CASE WHEN x.staff_id='OWNER' THEN 'Chủ cửa hàng' END,x.staff_id)";
 const [att,sch]=await Promise.all([
  env.DB.prepare(`SELECT x.staff_id AS id,${name} AS name,x.clock_in,x.clock_out FROM pos_attendance x LEFT JOIN pos_staff_users u ON u.id=x.staff_id WHERE x.work_date=? ORDER BY x.clock_in`).bind(day).all(),
  env.DB.prepare(`SELECT x.staff_id AS id,${name} AS name,x.start_time,x.end_time FROM pos_shift_schedules x LEFT JOIN pos_staff_users u ON u.id=x.staff_id WHERE x.work_date=? ORDER BY x.start_time`).bind(day).all()
 ]);
 const people=new Map(),person=(id,name,source)=>{if(!people.has(id))people.set(id,{id,name,source,periods:[]});return people.get(id)};
 for(const a of att.results){const from=Date.parse(a.clock_in);if(Number.isNaN(from))continue;
  const out=a.clock_out?Date.parse(a.clock_out):Math.min(now,from+OPEN_ATTENDANCE_MAX_MS);if(!(out>from))continue;
  const f=vnTime(from),t=vnTime(out);person(a.id,a.name,'ATTENDANCE').periods.push({from:f,to:t,start:f.slice(11,16),end:t.slice(11,16),open:!a.clock_out})}
 for(const s of sch.results){if(people.has(s.id)&&people.get(s.id).source==='ATTENDANCE')continue;
  person(s.id,s.name,'SCHEDULE').periods.push({from:day+' '+s.start_time+':00',to:day+' '+s.end_time+':00',start:s.start_time,end:s.end_time,open:false})}
 return [...people.values()].sort((a,b)=>a.periods[0].from.localeCompare(b.periods[0].from)||a.name.localeCompare(b.name,'vi'));
}

export async function staffReport(env,date,staffId,now=Date.now()){
 const people=await workedPeriods(env,date,now);if(!people)return null;
 const p=people.find(x=>x.id===String(staffId||''));if(!p)return undefined;
 const ledger=await windowLedger(env,p.periods);
 return {date:date||today(),reportType:'STAFF',person:{id:p.id,name:p.name,source:p.source,periods:p.periods.map(({start,end,open})=>({start,end,open}))},...ledger};
}

// Aggregates the same paid bill/order ledger as daily(). Unpaid and split parent
// orders cannot leak into the visual report; refunds are counted on their own day.
export async function analytics(env,date){const day=date||today();if(!validDay(day))return null;
 const report=await daily(env,day),days=Array.from({length:7},(_,i)=>new Date(Date.parse(day+'T00:00:00Z')-(6-i)*86400000).toISOString().slice(0,10));
 const history=await Promise.all(days.map(async d=>{const x=await daily(env,d);return {date:d,net:x.net,gross:x.gross,refunded:x.refunded,paidBills:x.paidBills}}));
 const hours=Array.from({length:24},(_,hour)=>({hour,gross:0,refunds:0,net:0}));
 const hourOf=t=>Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',hourCycle:'h23'}).format(new Date(t)));
 for(const p of report.payments)hours[hourOf(p.paidAt)].gross+=p.total;
 for(const r of report.refunds)hours[hourOf(r.createdAt)].refunds+=r.amount;
 for(const h of hours)h.net=h.gross-h.refunds;
 const {results:topProducts=[]}=await env.DB.prepare(`SELECT sku,name,SUM(qty) AS quantity,SUM(qty*price) AS gross
 FROM (SELECT json_extract(j.value,'$.sku') AS sku,json_extract(j.value,'$.name') AS name,
 CAST(json_extract(j.value,'$.qty') AS INTEGER) AS qty,CAST(json_extract(j.value,'$.price') AS INTEGER) AS price
 FROM qr_orders o,json_each(o.items_json) j WHERE o.payment_status='PAID'
 AND date(o.paid_at,'+7 hours')=? AND NOT EXISTS(SELECT 1 FROM pos_bills b WHERE b.order_id=o.id)
 UNION ALL SELECT json_extract(j.value,'$.sku'),json_extract(j.value,'$.name'),
 CAST(json_extract(j.value,'$.qty') AS INTEGER),CAST(json_extract(j.value,'$.price') AS INTEGER)
 FROM pos_bills b JOIN qr_orders o ON o.id=b.order_id,json_each(b.items_json) j
 WHERE b.payment_status='PAID' AND date(b.paid_at,'+7 hours')=?)
 GROUP BY sku,name ORDER BY quantity DESC,gross DESC LIMIT 8`).bind(day,day).all();
 const [shifts,attendance]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS shifts,COALESCE(SUM(CASE WHEN status='CLOSED' THEN counted_cash-expected_cash ELSE 0 END),0) AS difference FROM pos_cash_shifts WHERE date(opened_at,'+7 hours')=?").bind(day).first(),
  env.DB.prepare('SELECT COUNT(*) AS checkIns,COUNT(DISTINCT staff_id) AS staff FROM pos_attendance WHERE work_date=?').bind(day).first()
 ]);
 // Match clock-in/out timestamps to the refund timestamp, not the day of the
 // order. Staff shown here were clocked in when the return was recorded.
 const {results:refundDetails=[]}=await env.DB.prepare(`SELECT r.id AS refundId,r.order_id AS orderId,o.code AS orderCode,
 r.amount AS refundAmount,r.reason,r.created_at AS createdAt,
 l.category,l.product_name AS productName,l.qty AS quantity,l.amount AS itemAmount,
 (SELECT group_concat(DISTINCT COALESCE(u.display_name,CASE WHEN a.staff_id='OWNER' THEN 'Chủ cửa hàng' END)) FROM pos_attendance a
 LEFT JOIN pos_staff_users u ON u.id=a.staff_id
 WHERE a.clock_in<=r.created_at AND (a.clock_out IS NULL OR a.clock_out>=r.created_at)) AS onDuty,
 COALESCE(u2.display_name,CASE WHEN r.actor_id='OWNER' THEN 'Chủ cửa hàng' END) AS recordedBy
 FROM pos_refunds r JOIN qr_orders o ON o.id=r.order_id
 LEFT JOIN pos_refund_line_items l ON l.refund_id=r.id
 LEFT JOIN pos_staff_users u2 ON u2.id=r.actor_id
 WHERE date(r.created_at,'+7 hours')=? ORDER BY r.created_at DESC,r.id,l.category`).bind(day).all();
 return {report,hours,history,topProducts,shifts,attendance,refundDetails};
}

// Owner-defined shifts used by the Reports screen. Stored as JSON on the single store row.
export function parseReportShifts(value){
 if(!Array.isArray(value)||value.length>12)return null;
 const out=[],names=new Set();
 for(const item of value){
  const name=String(item?.name??'').trim(),start=String(item?.start??''),end=String(item?.end??'');
  if(!name||name.length>40||!validClock(start)||!validClock(end)||start===end||names.has(name.toLocaleLowerCase('vi-VN')))return null;
  names.add(name.toLocaleLowerCase('vi-VN'));out.push({name,start,end});
 }
 return out;
}
export async function reportShifts(env){
 const row=await env.DB.prepare('SELECT report_shifts FROM pos_store_config WHERE id=1').first();
 try{return parseReportShifts(JSON.parse(row?.report_shifts||'[]'))||[]}catch{return []}
}
export async function saveReportShifts(env,value,actorId){
 const shifts=parseReportShifts(value);if(!shifts)return null;
 await env.DB.prepare('UPDATE pos_store_config SET report_shifts=?,updated_at=?,updated_by=? WHERE id=1').bind(JSON.stringify(shifts),new Date().toISOString(),actorId).run();
 return shifts;
}
