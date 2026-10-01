(function(){
  'use strict';
  const native=window.NativePOS;
  const baseRender=window.renderMobile;
  const basePay=window.servicePayOrder;
  let screenKey='';
  const editable=o=>o&&!['PAID','CANCELLED','SPLIT'].includes(o.status);
  const modifiers=m=>Object.entries(m||{}).filter(x=>x[1]).map(x=>x[0]+': '+x[1]).join(' · ');
  function persist(draft){
    // Do not send/print if durable local storage failed; preserve previous live state.
    localStorage.setItem(STORAGE,JSON.stringify(draft));LotusDB.state=draft;
  }
  function transaction(fn){const draft=deepClone(S());const result=fn(draft);persist(draft);return result;}
  function checkedCart(state,cart){
    if(!cart||!cart.length)throw new Error('Giỏ hàng trống / 购物车为空');
    const counts={};cart.forEach(i=>{if(!Number.isInteger(i.qty)||i.qty<1||i.qty>999||!Number.isSafeInteger(i.price)||i.price<0)throw new Error('Số lượng/giá không hợp lệ');counts[i.productId]=(counts[i.productId]||0)+i.qty;});
    if(!Number.isSafeInteger(cartTotal(cart)))throw new Error('Tổng tiền vượt giới hạn');
    Object.keys(counts).forEach(id=>{const p=product(id,state);if(!p||!p.active||p.stock<counts[id])throw new Error('Không đủ tồn kho / 库存不足');});
  }
  function queueTicket(state,o,kind,items,reason){
    o.kitchenRevision=(o.kitchenRevision||0)+1;
    const id='kitchen:'+o.id+':'+o.kitchenRevision;
    const payload={storeName:state.settings.storeName,orderCode:o.code,table:o.table,kind,revision:o.kitchenRevision,createdAt:new Date().toLocaleString('vi-VN'),reason:reason||'',items:items.map(i=>({name:i.name,nameCn:i.nameCn,qty:i.qty,mods:modifiers(i.mods)}))};
    state.kitchenJobs=state.kitchenJobs||[];
    state.kitchenJobs.push({id,orderId:o.id,kind,payload,status:'QUEUED',createdAt:nowISO()});return id;
  }
  function dispatch(id){
    const job=(S().kitchenJobs||[]).find(j=>j.id===id);if(!job)return;
    if(!native||!native.printKitchen){job.message='Chưa kết nối Android bridge';LotusDB.save();return;}
    try{native.printKitchen(job.id,JSON.stringify(job.payload));}catch(e){alert('Đơn đã lưu, chưa gửi phiếu bếp: '+e.message);}
  }
  function openOrder(id){
    const m=S().mobile,o=S().orders.find(x=>x.id===id);if(!o)return;
    m.checkout={step:'result',orderId:o.id,customerId:o.customerId,voucherId:o.voucherId};m.tab='checkout';LotusDB.save();renderAll();
  }
  function back(){
    const modal=document.querySelector('.modal.show');if(modal){modal.classList.remove('show');return true;}
    const m=S().mobile;
    if(m.tab==='checkout'){m.tab=m.checkout&&m.checkout.orderId?'orders':'menu';LotusDB.save();renderAll();return true;}
    if(m.tab!=='menu'){m.tab='menu';LotusDB.save();renderAll();return true;}return false;
  }
  function confirmOrder(){
    try{LotusAccess.require('order');}catch(e){alert(e.message);return;}
    if(!S().mobile.cart.length)return;
    if(!confirm('Xác nhận món và gửi phiếu bếp? Đơn vẫn CHƯA THANH TOÁN.\n确认订单并发送厨房？尚未付款。'))return;
    try{
      const result=transaction(state=>{
        const m=state.mobile,items=deepClone(m.cart);checkedCart(state,items);
        let o,kind;
        let recoveredFrom='';
        if(m.editOrderId){
          const target=state.orders.find(x=>x.id===m.editOrderId);
          if(editable(target)&&!target.parentOrderId){
            o=target;
            if(o.paymentStatus==='CUSTOMER_REPORTED')throw new Error('Khách báo đã chuyển tiền. Kiểm tra trước khi thêm món.');
            const blocked=window.LotusEnhanced.orderCreationBlockReason(state);if(blocked)throw new Error(blocked);
            if(!o.inventoryCommittedAt)window.LotusEnhanced.commitInventoryForOrder(state,o);
            checkedCart(state,items);
            const delta={items,code:o.code,staffId:m.staffId,createdAt:nowISO()};window.LotusEnhanced.commitInventoryForOrder(state,delta);
            o.inventoryUsage=(o.inventoryUsage||[]).concat(delta.inventoryUsage||[]);
            items.forEach(i=>{const old=o.items.find(x=>x.key===i.key&&x.price===i.price);if(old)old.qty+=i.qty;else o.items.push(i);});
            kind='THÊM MÓN / 加菜';
            if(o.productionCreated)items.forEach(i=>state.productionJobs.push({id:uid('JOB'),orderId:o.id,orderCode:o.code,station:i.station,items:[deepClone(i)],status:'NEW',createdAt:nowISO(),changeType:'ADD'}));
          }else{
            recoveredFrom=target&&target.code||m.editOrderId;
            m.editOrderId=null;
            o=serviceCreateOrder(state,{source:'MOBILE',table:(target&&target.table)||m.table,cart:items,staffId:m.staffId});
            kind='ĐƠN BỔ SUNG / 加单';serviceAcceptOrder(state,o.id);
          }
        }else{
          o=serviceCreateOrder(state,{source:'MOBILE',table:m.table,cart:items,staffId:m.staffId});
          kind='ĐƠN MỚI / 新单';serviceAcceptOrder(state,o.id);
        }
        recalculate(state,o);
        const jobId=queueTicket(state,o,kind,items);
        m.cart=[];m.editOrderId=null;
        return {orderId:o.id,jobId,recoveredFrom};
      });
      openOrder(result.orderId);dispatch(result.jobId);if(result.recoveredFrom)alert('Đơn '+result.recoveredFrom+' đã đóng hoặc đã tách. Hệ thống đã tự tạo đơn bổ sung mới cùng bàn / 原订单已关闭或拆单，已自动建立加单。');
    }catch(e){alert('Không xác nhận được đơn: '+e.message);}
  }
  function recalculate(state,o){
    o.subtotal=cartTotal(o.items);const v=o.voucherId?voucher(o.voucherId,state):null;
    if(v&&!isVoucherEligible(v,customer(o.customerId,state),o.subtotal,state)[0])o.voucherId=null;
    o.discount=o.voucherId?discountFor(v,o.subtotal):0;o.total=Math.max(0,o.subtotal-o.discount);
    // An old QR amount is never reused after a change.
    o.paymentRequest=null;o.paymentStatus=o.requestedPaymentMethod==='CASH'?'PAY_AT_COUNTER':'UNPAID';
    if(o.requestedPaymentMethod==='BANK')ensurePaymentRequest(o,state);
  }
  function addToOrder(id){
    const m=S().mobile,o=S().orders.find(x=>x.id===id);if(!editable(o))return;if(o.parentOrderId){alert('Bill đã tách: tạo đơn mới để thêm món.');return;}
    if(m.cart.length&&m.editOrderId!==id){alert('Đang có giỏ khác. Hoàn tất giỏ hiện tại trước để không mất món.');return;}
    m.editOrderId=id;m.table=o.table;m.tab='menu';LotusDB.save();renderAll();
  }
  function cancelLine(id,index){
    try{LotusAccess.require('order');}catch(e){alert(e.message);return;}
    const o=S().orders.find(x=>x.id===id);if(!editable(o)||!o.items[index])return;if(o.parentOrderId){alert('Bill đã tách: thêm/hủy món bằng đơn riêng hoặc trả món sau thanh toán.');return;}
    const reason=prompt('Lý do hủy 1 phần / 取消一份的原因\nKhông tự hoàn kho vì món có thể đã chế biến.','');
    if(!reason||!reason.trim())return;
    if(!confirm('Hủy 1 × '+o.items[index].name+' và gửi phiếu HỦY đến bếp?'))return;
    try{
      const jobId=transaction(state=>{
        const order=state.orders.find(x=>x.id===id);if(!editable(order))throw new Error('Đơn đã đóng');
        if(order.paymentStatus==='CUSTOMER_REPORTED')throw new Error('Khách báo đã chuyển tiền — kiểm tra trước khi hủy');
        const item=order.items[index];if(!item)throw new Error('Món không còn tồn tại');
        // Legacy orders must reserve original stock before removing a cooked item.
        if(!order.inventoryCommittedAt)window.LotusEnhanced.commitInventoryForOrder(state,order);
        const delta=deepClone(item);delta.qty=1;item.qty--;if(item.qty===0)order.items.splice(index,1);
        order.cancellations=order.cancellations||[];order.cancellations.push({item:delta,reason:reason.trim(),at:nowISO(),staffId:state.mobile.staffId});
        recalculate(state,order);if(!order.items.length){order.status='CANCELLED';order.cancelledAt=nowISO();}
        state.productionJobs.push({id:uid('JOB'),orderId:order.id,orderCode:order.code,station:delta.station,items:[deepClone(delta)],status:'NEW',changeType:'CANCEL',reason:reason.trim(),createdAt:nowISO()});
        return queueTicket(state,order,'HỦY MÓN / 退菜',[delta],reason.trim());
      });
      renderAll();dispatch(jobId);
    }catch(e){alert(e.message);}
  }
  function method(o,value){
    if(!editable(o))return;
    if(o.paymentStatus==='CUSTOMER_REPORTED'&&!confirm('Khách báo đã chuyển. Đã kiểm tra tiền vào trước khi đổi phương thức?'))return;
    try{transaction(state=>{const x=state.orders.find(i=>i.id===o.id);x.requestedPaymentMethod=value;x.paymentRequest=null;x.paymentStatus=value==='BANK'?'UNPAID':'PAY_AT_COUNTER';if(value==='BANK')ensurePaymentRequest(x,state);});renderAll();}catch(e){alert(e.message);}
  }
  window.servicePayOrder=function(state,id,paymentMethod,received){
    LotusAccess.require('pay');
    const o=state.orders.find(x=>x.id===id);if(o&&['CANCELLED','SPLIT'].includes(o.status))throw new Error('ORDER_CLOSED');
    if(o&&o.status==='PAID')throw new Error('Đơn đã thanh toán');
    if(state!==S())return basePay(state,id,paymentMethod,received);
    const paid=transaction(draft=>{
      const order=draft.orders.find(x=>x.id===id),root=order.rootOrderId&&draft.orders.find(x=>x.id===order.rootOrderId);
      if(root&&root.splitVoucherId&&!root.splitVoucherConsumed){const v=voucher(root.splitVoucherId,draft);if(!v||!isVoucherEligible(v,customer(root.customerId,draft),root.subtotal,draft)[0])throw new Error('Voucher của nhóm bill không còn hợp lệ');v.qtyUsed++;root.splitVoucherConsumed=true;}
      return basePay(draft,id,paymentMethod,received);
    });
    // Schedule once on the payment transition; opening a paid order never auto-prints again.
    setTimeout(()=>{if(window.LotusNativeBridge&&window.LotusNativeBridge.printPaidOrder)window.LotusNativeBridge.printPaidOrder(paid);},0);
    return paid;
  };
  window.mobileOrdersHTML=function(){
    return S().orders.filter(o=>o.staffId===S().mobile.staffId||o.source==='MOBILE').slice().reverse().map(o=>`<button type="button" class="m-card mobile-order-card" data-h-order="${esc(o.id)}"><span style="display:flex;justify-content:space-between"><b>${esc(o.code)}</b><span class="status ${o.status.toLowerCase()}">${o.status}</span></span><small>${esc(o.table)} · ${fmt(o.total)}</small><span class="mobile-order-action">${editable(o)?'Mở đơn · Thêm/hủy món · Thanh toán / 打开订单':'Xem đơn / 查看订单'} →</span></button>`).join('')||'<div class="empty">Chưa có đơn / 暂无订单</div>';
  };
  function jobStatus(j){
    const value=native&&native.getKitchenJobStatus?native.getKitchenJobStatus(j.id):j.status;
    const labels={QUEUED:'Chưa gửi',FAILED:'Chưa gửi — lỗi',SENDING:'Đang gửi',SENT:'Đã gửi TCP — kiểm tra giấy',UNKNOWN:'Chưa rõ đã in — hỏi bếp',CONFIRMED:'Đã kiểm tra giấy'};
    return labels[value]||value;
  }
  function detail(o){
    const jobs=(S().kitchenJobs||[]).filter(j=>j.orderId===o.id);
    const open=editable(o);
    return `<div class="m-card"><b>Đơn ${esc(o.code)} · ${esc(o.table)}</b><p>${o.status==='PAID'?'ĐÃ THANH TOÁN / 已付款':o.status==='CANCELLED'?'ĐÃ HỦY / 已取消':'CHƯA THANH TOÁN / 未付款'}</p>${o.items.map((i,n)=>`<div class="qr-cart-line"><div>${i.qty} × ${esc(i.name)}<div class="prod-cn">${esc(i.nameCn)}</div><small>${esc(modifiers(i.mods))}</small></div>${open?`<button class="danger" data-h-cancel="${n}">Hủy 1 / 退1</button>`:''}</div>`).join('')}<p><b>Tổng / 合计: ${fmt(o.total)}</b></p>${open?'<button class="primary wide" id="hAddItems">Thêm món vào đơn / 加菜</button>':''}</div><div class="m-card"><b>Phiếu bếp / 厨房单</b>${jobs.length?jobs.map(j=>`<p>${esc(j.kind)} #${j.payload.revision}<br><small>${esc(jobStatus(j))}</small><br><button class="secondary" data-h-job="${esc(j.id)}">Xử lý / In lại / 重印</button></p>`).join(''):'<p>Đơn cũ chưa có nhật ký bếp. Không tự in toàn bộ để tránh trùng.</p>'}</div>${open?`<div class="checkout-choice"><button class="secondary" id="hCash">Tiền mặt / 现金</button><button class="primary" id="hBank">QR ngân hàng / 银行二维码</button></div>`:''}${['CANCELLED','SPLIT'].includes(o.status)?'':o.requestedPaymentMethod==='BANK'?paymentCardHTML(o,'staff'):cashResultHTML(o,'staff')}<button class="secondary wide" id="mCheckoutDone" style="margin-top:10px">Về đơn hàng / 返回订单</button>`;
  }
  window.renderMobile=function(){
    baseRender();const m=S().mobile;if(m.mode==='customer'||!m.loggedIn)return;
    const root=$('mobileScreen'),content=root.querySelector('.staff-main-scroll');if(!content)return;
    if(m.tab==='checkout'){
      const o=S().orders.find(x=>m.checkout&&x.id===m.checkout.orderId);
      if(o){content.innerHTML=detail(o);bindMobileStaffCheckout();
        if($('hAddItems'))$('hAddItems').onclick=()=>addToOrder(o.id);
        if($('hCash'))$('hCash').onclick=()=>method(o,'CASH');
        if($('hBank'))$('hBank').onclick=()=>method(o,'BANK');
        content.querySelectorAll('[data-h-cancel]').forEach(b=>b.onclick=()=>cancelLine(o.id,Number(b.dataset.hCancel)));
        content.querySelectorAll('[data-h-job]').forEach(b=>b.onclick=()=>{const j=(S().kitchenJobs||[]).find(x=>x.id===b.dataset.hJob);if(native&&native.retryKitchen){if(native.getKitchenJobStatus(j.id)==='QUEUED')dispatch(j.id);else native.retryKitchen(j.id);}else alert('Cần APK Android để in LAN');});
        if(o.status==='PAID')content.querySelectorAll('[data-payment-action="change"]').forEach(b=>b.remove());
        const cash=content.querySelector('[data-staff-cash-paid]');if(cash)cash.onclick=()=>{if(!confirm('Đã nhận đủ '+fmt(o.total)+' tiền mặt? / 已收足现金？'))return;try{servicePayOrder(S(),o.id,'CASH',o.total);renderAll();}catch(e){alert(e.message);}};
      }
      content.insertAdjacentHTML('afterbegin','<div class="checkout-exit-bar"><button class="secondary wide" id="mCheckoutExit">← Quay lại / 返回</button></div>');$('mCheckoutExit').onclick=back;
    }
    root.querySelectorAll('[data-h-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.hOrder));
    if(m.tab==='menu'){
      if(m.editOrderId){const target=S().orders.find(x=>x.id===m.editOrderId);if(!editable(target)||target.parentOrderId){m.editOrderId=null;LotusDB.save();}}
      if($('mStartCheckout')){$('mStartCheckout').textContent=m.editOrderId?'Xác nhận thêm / 确认加菜':'Xác nhận → Bếp / 发送厨房';$('mStartCheckout').onclick=confirmOrder;}
      if(m.editOrderId){const o=S().orders.find(x=>x.id===m.editOrderId);content.insertAdjacentHTML('afterbegin',`<div class="m-card">Đang thêm cho <b>${esc(o?o.code:'')}</b><button class="secondary wide" id="hStopAdd">Hủy giỏ bổ sung / 取消加菜</button></div>`);$('hStopAdd').onclick=()=>{if(m.cart.length&&!confirm('Bỏ các món bổ sung chưa xác nhận?'))return;m.editOrderId=null;m.cart=[];LotusDB.save();renderAll();};if($('mTable'))$('mTable').disabled=true;}
    }
    if(m.tab==='profile'){
      content.insertAdjacentHTML('afterbegin','<div class="m-card"><b>Lotus POS 1.1.0 (9)</b><button class="primary wide" id="hKitchenConfig">Máy in bếp LAN / 厨房打印机</button><button class="secondary wide" id="hKitchenJobs" style="margin-top:8px">Nhật ký phiếu bếp / 打印记录</button></div>');
      $('hKitchenConfig').onclick=()=>native&&native.openKitchenSettings?native.openKitchenSettings():alert('Cấu hình này chỉ có trong APK Android');
      $('hKitchenJobs').onclick=()=>native&&native.openKitchenJobs?native.openKitchenJobs():alert('Cần APK Android');
    }
    if(m.editOrderId)root.querySelectorAll('[data-m-table-card]').forEach(b=>b.onclick=()=>alert('Đang bổ sung cho đơn khác. Hoàn tất hoặc hủy giỏ bổ sung trước khi đổi bàn.'));
    const key=m.tab+':'+(m.checkout&&m.tab==='checkout'?(m.checkout.orderId||m.checkout.step):'');
    if(key!==screenKey){root.scrollTop=0;content.scrollTop=0;screenKey=key;}
  };
  window.LotusHandheld={transaction,recalculate,back,confirmOrder,openOrder,cancelLine,dispatch,onKitchenEvent(e){
    const job=(S().kitchenJobs||[]).find(j=>j.id===e.requestId);if(job){job.message=e.message;job.status=native&&native.getKitchenJobStatus?native.getKitchenJobStatus(job.id):e.severity;LotusDB.save();}
    if(e.severity==='FAIL'||e.severity==='WARN')alert(e.code+': '+e.message);
    if(S().mobile.tab==='checkout')renderMobile();
  }};
  Object.assign(window.LotusPOC,{servicePayOrder:window.servicePayOrder});
  renderMobile();
})();
