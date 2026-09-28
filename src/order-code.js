// Store-local daily sequence allocated atomically by D1. Keep old codes intact.
const dayParts=date=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date)).split('/');
export async function nextOrderCode(env,memberId,date=new Date().toISOString()){
 const [dd,mm,yyyy]=dayParts(date),day=yyyy+'-'+mm+'-'+dd;
 const seq=await env.DB.prepare('INSERT INTO pos_order_daily_sequence(business_day,next_sequence) VALUES(?,1) ON CONFLICT(business_day) DO UPDATE SET next_sequence=next_sequence+1 RETURNING next_sequence').bind(day).first();
 const customer=memberId?String(memberId).replace(/[^a-fA-F0-9]/g,'').slice(-6).toUpperCase():'000000';
 // Payment is intentionally unknown when the customer sends the kitchen order.
 // The final -CK / -TM suffix is appended only when staff confirms payment.
 return `${dd}${mm}${yyyy}-${String(seq.next_sequence).padStart(4,'0')}-${customer}`;
}
export const codeForMethod=(code,method)=>{
 const base=String(code).replace(/-(?:CK|TM)$/i,'');
 return base+(method==='CASH'?'-TM':'-CK');
};
export const codeForBill=(code,method,sequence)=>codeForMethod(code,method)+(sequence?'-B'+sequence:'');
