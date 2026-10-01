(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const integer=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
  const sum=items=>items.reduce((v,i)=>v+i.qty*i.price,0);
  const day=t=>t?new Date(new Date(t).getTime()+7*3600000).toISOString().slice(0,10):'';
  function split(state,id,quantities,now,newId){
    const o=state.orders.find(x=>x.id===id);
    if(!o||['PAID','CANCELLED','SPLIT'].includes(o.status)||o.paymentStatus==='CUSTOMER_REPORTED')throw Error('Đơn không thể tách. Kiểm tra thanh toán trước.');
    if(quantities.length!==o.items.length)throw Error('Số dòng không hợp lệ');
    const a=[],b=[];
    o.items.forEach((i,n)=>{const q=quantities[n];if(!integer(q)||q>i.qty)throw Error('Số lượng tách không hợp lệ');if(q)a.push(Object.assign(copy(i),{qty:q}));if(q<i.qty)b.push(Object.assign(copy(i),{qty:i.qty-q}));});
    if(!a.length||!b.length)throw Error('Mỗi bill phải có ít nhất 1 món');
    const subtotal=sum(o.items),sa=sum(a),discount=o.discount||0;
    if(!integer(subtotal)||!integer(discount)||discount>subtotal||o.total!==subtotal-discount)throw Error('Tổng tiền đơn không hợp lệ');
    const da=subtotal?Math.floor(discount*sa/subtotal):0;
    const children=[a,b].map((items,n)=>{
      const child=copy(o);child.id=newId();child.code=o.code+'-'+(n+1);child.parentOrderId=o.id;child.rootOrderId=o.rootOrderId||o.id;
      child.items=items;child.subtotal=sum(items);child.discount=n?discount-da:da;child.total=child.subtotal-child.discount;
      child.fixedSplitDiscount=child.discount;child.voucherId=null;child.status='NEW';child.payment=null;child.paidAt=null;
      child.paymentRequest=null;child.paymentStatus='PAY_AT_COUNTER';child.requestedPaymentMethod='CASH';child.cancellations=[];
      child.kitchenRevision=0;child.splitAt=now;child.createdAt=now;delete child.splitChildren;
      return child;
    });
    if(!o.rootOrderId){o.splitVoucherId=o.voucherId||null;o.splitVoucherConsumed=false;}
    o.status='SPLIT';o.splitAt=now;o.splitChildren=children.map(x=>x.id);o.paymentRequest=null;
    state.orders.push.apply(state.orders,children);return children;
  }
  // Shared by the live preview and saved bills, including discount rounding.
  // Incomplete allocations are allowed only for preview; splitMany validates completeness.
  function splitAmounts(o,allocations){
    const subtotal=sum(o.items),discount=o.discount||0;
    if(!integer(subtotal)||!integer(discount)||discount>subtotal||o.total!==subtotal-discount)throw Error('Tổng tiền đơn không hợp lệ');
    let allocatedDiscount=0,rollingSubtotal=0;
    return allocations.map(row=>{
      const value=row.reduce((v,q,n)=>v+q*o.items[n].price,0);rollingSubtotal+=value;
      const cumulative=subtotal?Math.floor(discount*rollingSubtotal/subtotal):0;
      const share=cumulative-allocatedDiscount;allocatedDiscount=cumulative;
      return {subtotal:value,discount:share,total:value-share};
    });
  }
  function splitMany(state,id,allocations,now,newId){
    const o=state.orders.find(x=>x.id===id);
    if(!o||['PAID','CANCELLED','SPLIT'].includes(o.status)||o.paymentStatus==='CUSTOMER_REPORTED')throw Error('Đơn không thể tách. Kiểm tra thanh toán trước.');
    if(!Array.isArray(allocations)||allocations.length<2)throw Error('Cần ít nhất 2 bill');
    const maxBills=o.items.reduce((v,i)=>v+i.qty,0);
    if(allocations.length>maxBills)throw Error('Số bill không được vượt tổng số món');
    const groups=allocations.map((row,bill)=>{
      if(!Array.isArray(row)||row.length!==o.items.length)throw Error('Dữ liệu bill '+(bill+1)+' không hợp lệ');
      const items=[];row.forEach((q,n)=>{if(!integer(q)||q>o.items[n].qty)throw Error('Số lượng ở bill '+(bill+1)+' không hợp lệ');if(q)items.push(Object.assign(copy(o.items[n]),{qty:q}));});
      if(!items.length)throw Error('Bill '+(bill+1)+' chưa có món');return items;
    });
    o.items.forEach((i,n)=>{const used=allocations.reduce((v,row)=>v+row[n],0);if(used!==i.qty)throw Error('Món '+i.name+' chưa được phân bổ đủ');});
    const amounts=splitAmounts(o,allocations);
    const children=groups.map((items,n)=>{
      const child=copy(o);child.id=newId();child.code=o.code+'-'+(n+1);child.parentOrderId=o.id;child.rootOrderId=o.rootOrderId||o.id;
      child.items=items;Object.assign(child,amounts[n]);child.fixedSplitDiscount=child.discount;child.voucherId=null;child.status='NEW';child.payment=null;child.paidAt=null;
      child.paymentRequest=null;child.paymentStatus='PAY_AT_COUNTER';child.requestedPaymentMethod='CASH';child.cancellations=[];
      child.kitchenRevision=0;child.splitAt=now;child.createdAt=now;delete child.splitChildren;return child;
    });
    if(!o.rootOrderId){o.splitVoucherId=o.voucherId||null;o.splitVoucherConsumed=false;}
    o.status='SPLIT';o.splitAt=now;o.splitChildren=children.map(x=>x.id);o.paymentRequest=null;
    state.orders.push.apply(state.orders,children);return children;
  }
  function refund(state,id,quantities,method,reason,at,staffId,newId){
    const o=state.orders.find(x=>x.id===id);
    if(!o||o.status!=='PAID'||!['CASH','BANK'].includes(method)||!reason.trim())throw Error('Cần đơn đã trả tiền, phương thức hoàn và lý do');
    if(quantities.length!==o.items.length)throw Error('Số dòng không hợp lệ');
    state.refunds=state.refunds||[];const previous=state.refunds.filter(r=>r.orderId===id),lines=[];
    let cumulative=0,allocated=0;
    o.items.forEach((i,n)=>{
      cumulative+=i.price*i.qty;
      const limit=o.subtotal?Math.floor(o.total*cumulative/o.subtotal):0,lineTotal=limit-allocated;allocated=limit;
      const used=previous.reduce((s,r)=>s+r.lines.filter(l=>l.index===n).reduce((v,l)=>v+l.qty,0),0),q=quantities[n];
      if(!integer(q)||q+used>i.qty)throw Error('Số lượng trả vượt số lượng đã bán');
      if(q)lines.push({index:n,productId:i.productId,name:i.name,nameCn:i.nameCn,qty:q,amount:Math.floor(lineTotal*(used+q)/i.qty)-Math.floor(lineTotal*used/i.qty)});
    });
    if(!lines.length)throw Error('Chọn ít nhất 1 món để trả');
    const r={id:newId(),orderId:id,rootOrderId:o.rootOrderId||id,at,staffId,method,reason:reason.trim(),lines,amount:lines.reduce((v,l)=>v+l.amount,0)};
    state.refunds.push(r);return r;
  }
  function report(state,date){
    const paid=state.orders.filter(o=>o.status==='PAID'&&day(o.paidAt)===date),refunds=(state.refunds||[]).filter(r=>day(r.at)===date);
    const created=state.orders.filter(o=>!o.parentOrderId&&day(o.createdAt)===date),cancelled=state.orders.filter(o=>o.status==='CANCELLED'&&day(o.cancelledAt||(o.cancellations||[]).slice(-1).map(c=>c.at)[0])===date);
    const items={};function item(i){return items[i.productId]||(items[i.productId]={name:i.name,nameCn:i.nameCn,sold:0,returned:0});}
    paid.forEach(o=>o.items.forEach(i=>item(i).sold+=i.qty));refunds.forEach(r=>r.lines.forEach(i=>item(i).returned+=i.qty));
    const cash=paid.filter(o=>o.payment&&o.payment.method==='CASH').reduce((v,o)=>v+o.total,0),bank=paid.filter(o=>o.payment&&o.payment.method==='BANK').reduce((v,o)=>v+o.total,0);
    const refundCash=refunds.filter(r=>r.method==='CASH').reduce((v,r)=>v+r.amount,0),refundBank=refunds.filter(r=>r.method==='BANK').reduce((v,r)=>v+r.amount,0);
    return {date,cash,bank,gross:paid.reduce((v,o)=>v+o.total,0),discount:paid.reduce((v,o)=>v+(o.discount||0),0),refundCash,refundBank,net:cash+bank-refundCash-refundBank,createdOrders:created.length,paidBills:paid.length,paidOrders:new Set(paid.map(o=>o.rootOrderId||o.id)).size,cancelledOrders:cancelled.length,returnedOrders:new Set(refunds.map(r=>r.rootOrderId||r.orderId)).size,cancelledQty:state.orders.reduce((v,o)=>v+(o.cancellations||[]).filter(c=>day(c.at)===date).reduce((n,c)=>n+c.item.qty,0),0),items:Object.values(items)};
  }
  function price(p,m){
    let n=m.size==='大'&&p.largePrice!=null?Number(p.largePrice):Number(p.price);
    if(p.riceOptions&&m.rice){const r=p.riceOptions.find(x=>x.name===m.rice);if(!r)throw Error('Loại cơm không hợp lệ');n+=r.price;}
    if(p.spicePrices&&m.spice)n+=Number(p.spicePrices[m.spice]||0);
    if(!integer(n))throw Error('Giá món phải là số nguyên không âm');return n;
  }
  root.LotusBusiness={split,splitMany,splitAmounts,refund,report,price,day};
})(typeof window==='undefined'?globalThis:window);
