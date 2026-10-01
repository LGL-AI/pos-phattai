(function(){
  'use strict';
  const A=LotusAccess,B=LotusBusiness,N=window.NativePOS,H=LotusHandheld,baseRender=window.renderMobile;
  const eligible=window.isVoucherEligible;
  window.isVoucherEligible=function(v,c,total,state=S()){if(v&&v.expiry&&v.expiry.slice(0,10)<B.day(nowISO()))return [false,'Voucher đã hết hạn (giờ Việt Nam)'];return eligible(v,c,total,state);};
  let page='',reportDate=B.day(new Date().toISOString());
  const e=esc,button=(id,label,cls='secondary')=>`<button type="button" class="${cls} wide" id="${id}" style="margin:6px 0">${label}</button>`;
  const field=(id,label,value='',type='text')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${e(String(value))}" style="width:100%;box-sizing:border-box"></div>`;
  const val=id=>$(id).value.trim(),num=id=>{const n=Number(val(id));if(!val(id)||!Number.isSafeInteger(n)||n<0)throw Error('Số tiền/số lượng cần là số nguyên không âm');return n;};
  const run=f=>()=>{try{f();}catch(err){alert(err.message);}},on=(id,f)=>{if($(id))$(id).onclick=run(f);};
  const tx=(permission,fn)=>{A.require(permission);return H.transaction(fn);};
  function modal(title,html,save){
    close();const d=document.createElement('div');d.id='businessModal';d.className='modal show';
    d.style.cssText='position:fixed;inset:0;background:#0008;z-index:99999;display:flex;align-items:center;padding:12px';
    d.innerHTML=`<div style="background:white;border-radius:16px;padding:16px;width:100%;max-height:82vh;overflow-y:auto;box-sizing:border-box"><h3>${e(title)}</h3>${html}${save?button('businessSave','Lưu / 确认','primary'):''}${button('businessClose','← Quay lại / 返回')}</div>`;
    document.body.appendChild(d);on('businessClose',close);if(save)on('businessSave',save);
  }
  function close(){const d=$('businessModal');if(d)d.remove();}
  function login(a){
    $('mobileScreen').innerHTML=`<div class="m-head"><h3>Phát Tài POS · 1.2.2</h3><div>Đăng nhập / 员工登录</div></div><div class="m-card">${a.needsSetup?'<h3>Thiết lập chủ tiệm Huang / 设置店主</h3><p>Tạo mật khẩu cho tài khoản <b>huang</b>. Sau đó vào Cá nhân → Tài khoản để tạo nhân viên.</p>':field('authUser','Tên đăng nhập / 账号','huang')}${field('authPassword','Mật khẩu (ít nhất 6 ký tự) / 密码','','password')}${a.needsSetup?field('authRepeat','Nhập lại mật khẩu / 确认密码','','password'):''}<p id="authError" style="color:#b91c1c" role="alert"></p>${button('authSubmit',a.needsSetup?'Tạo tài khoản Huang / 创建店主':'Đăng nhập / 登录','primary')}</div>`;
    $('authSubmit').onclick=()=>{
      const b=$('authSubmit');b.disabled=true;$('authError').textContent='Đang xác thực…';
      setTimeout(()=>{try{const p=$('authPassword').value;if(a.needsSetup&&p!==$('authRepeat').value)throw Error('Mật khẩu nhập lại không khớp');
        A.result(a.needsSetup?N.setupOwner(p):N.login(val('authUser'),p));A.refresh();S().mobile.tab='menu';page='';LotusDB.save();renderAll();
      }catch(err){$('authError').textContent=err.message;b.disabled=false;}},20);
    };
  }
  function accounts(){
    A.require('accounts');const a=A.refresh();
    modal('Tài khoản / 账号',a.accounts.map(x=>button('acc'+x.id,`${e(x.name)} · ${e(x.username)} · ${e(x.role)}${x.active?'':' · KHÓA'}`)).join('')+button('newAccount','+ Thêm tài khoản / 添加账号'),null);
    a.accounts.forEach(x=>on('acc'+x.id,()=>editAccount(x)));on('newAccount',()=>editAccount({id:0,name:'',username:'',role:'CASHIER',active:true}));
  }
  function editAccount(a){
    modal('Tạo / Sửa tài khoản',field('acName','Tên / 姓名',a.name)+field('acUser','Tên đăng nhập (3–40 ký tự)',a.username)+`<div class="field"><label>Vai trò / 权限</label><select id="acRole"><option value="CASHIER">Nhân viên / 员工</option><option value="MANAGER">Quản lý / 经理</option><option value="STORE_OWNER">Chủ tiệm / 店主</option></select></div>`+field('acPassword',a.id?'Mật khẩu mới (để trống nếu giữ nguyên)':'Mật khẩu (ít nhất 6 ký tự)','','password')+`<label><input type="checkbox" id="acActive" ${a.active?'checked':''}> Cho đăng nhập</label>`,()=>{
      A.require('accounts');A.result(N.saveStaffAccount(JSON.stringify({id:a.id,name:val('acName'),username:val('acUser'),role:val('acRole'),password:$('acPassword').value,active:$('acActive').checked})));A.refresh();close();renderAll();
    });$('acRole').value=a.role;
  }
  function license(){
    A.require('license');const info=A.result(N.getLicenseInfo());
    modal('License / 授权',`<p>${info.configured?'Key đã lưu: '+e(info.masked):'Chưa nhập key'}</p><p>Chưa xác thực máy chủ. Bản này lưu key trên máy; chưa kết nối SaaS hay điều khiển từ xa.</p>`+field('licenseKey','License key','','password'),()=>{A.result(N.saveLicenseKey(val('licenseKey')));close();alert('Đã lưu key. Chờ kết nối máy chủ SaaS để xác thực.');});
  }
  function reportText(r){return [S().settings.storeName,'BÁO CÁO NGÀY / 日报',r.date+' · Việt Nam (UTC+7)','Đơn mới / 新订单: '+r.createdOrders,'Đơn có thu tiền / 收款订单: '+r.paidOrders,'Bill đã thanh toán / 已付账单: '+r.paidBills,'Tiền mặt thu / 现金: '+fmt(r.cash),'Chuyển khoản thu / 转账: '+fmt(r.bank),'Tổng thu / 收款合计: '+fmt(r.gross),'Giảm giá / 优惠: '+fmt(r.discount),'Hoàn tiền mặt / 现金退款: '+fmt(r.refundCash),'Hoàn chuyển khoản / 转账退款: '+fmt(r.refundBank),'Ròng tiền mặt: '+fmt(r.cash-r.refundCash),'Ròng chuyển khoản: '+fmt(r.bank-r.refundBank),'THỰC THU / 净收入: '+fmt(r.net),'Đơn hủy / 取消: '+r.cancelledOrders,'Phần món hủy / 退菜: '+r.cancelledQty,'Đơn trả / 退款订单: '+r.returnedOrders,'MÓN: BÁN / TRẢ / RÒNG',...r.items.map(i=>i.name+'\n'+(i.nameCn||'')+'\n'+i.sold+' / '+i.returned+' / '+(i.sold-i.returned)),'Báo cáo dữ liệu trên thiết bị này.','Tách bill không tạo thêm món/doanh thu.'].join('\n');}
  function reports(content){
    A.require('reports');const r=B.report(S(),reportDate);
    content.innerHTML=button('adminBack','← Cá nhân / 我的')+field('reportDate','Ngày báo cáo (Việt Nam)',reportDate,'date')+button('reportLoad','Xem báo cáo / 查看')+`<pre style="white-space:pre-wrap;font:inherit;padding:12px;background:white;border-radius:12px">${e(reportText(r))}</pre>`+button('reportPrint','In báo cáo SUNMI / 打印日报','primary');
    on('adminBack',()=>{page='';renderMobile();});on('reportLoad',()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(val('reportDate')))throw Error('Chọn ngày');reportDate=val('reportDate');renderMobile();});
    on('reportPrint',()=>{A.require('reports');if(confirm('In báo cáo ngày '+r.date+'?'))N.printDailyReport('report:'+r.date+':'+Date.now(),JSON.stringify({text:reportText(r)}));});
  }
  function menuList(){
    A.require('menu');modal('Món ăn / 菜品',button('newProduct','+ Thêm món','primary')+S().products.map(p=>button('prod'+p.id,`${e(p.name)} · ${fmt(p.price)} ${p.active?'':'(Đã ẩn)'}`)).join(''),null);
    on('newProduct',()=>editProduct({id:null,name:'',nameCn:'',price:0,largePrice:0,stock:100,group:'Cơm',active:true}));S().products.forEach(p=>on('prod'+p.id,()=>editProduct(p)));
  }
  function editProduct(p){
    modal('Giá món & lựa chọn / 菜品价格',field('bizpName','Tên món',p.name)+field('bizpCn','Tên tiếng Trung',p.nameCn||'')+field('bizpGroup','Nhóm (Cơm / Canh / …)',p.group)+field('bizpPrice','Giá size 中',p.price,'number')+field('bizpLarge','Giá size 大',p.largePrice==null?p.price:p.largePrice,'number')+field('bizpStock','Số phần có thể bán',p.stock,'number')+['小','中','大'].map((s,i)=>field('bizpSpice'+i,'Phụ thu độ cay '+s,p.spicePrices&&p.spicePrices[s]||0,'number')).join('')+`<div class="field"><label>Loại cơm và phụ thu (mỗi dòng Tên=Giá)<br>Ví dụ: Cơm trắng=0</label><textarea id="bizpRice" style="width:100%;min-height:90px">${e((p.riceOptions||[]).map(r=>r.name+'='+r.price).join('\n'))}</textarea></div><label><input type="checkbox" id="bizpActive" ${p.active?'checked':''}> Đang bán / 在售</label>`+(p.id?button('deleteProduct','Xóa món khỏi menu / 下架','danger'):''),()=>{
      const data={name:val('bizpName'),nameCn:val('bizpCn'),group:val('bizpGroup'),price:num('bizpPrice'),largePrice:num('bizpLarge'),stock:num('bizpStock'),spicePrices:{'小':num('bizpSpice0'),'中':num('bizpSpice1'),'大':num('bizpSpice2')},riceOptions:val('bizpRice')?val('bizpRice').split('\n').filter(Boolean).map(line=>{const n=line.lastIndexOf('='),name=line.slice(0,n).trim(),price=Number(line.slice(n+1));if(n<1||!name||!Number.isSafeInteger(price)||price<0)throw Error('Dòng cơm phải có dạng Tên=Giá');return {name,price};}):[],active:$('bizpActive').checked,size:true,spicy:true};
      if(!data.name||!data.group)throw Error('Nhập tên và nhóm món');
      tx('menu',state=>{if(p.id)Object.assign(product(p.id,state),data);else state.products.push(Object.assign({id:Date.now(),sku:'CUSTOM'+Date.now(),station:'KITCHEN',icon:'🍚',recipe:[]},data));});close();renderAll();
    });on('deleteProduct',()=>{if(confirm('Ẩn món khỏi menu? Lịch sử đơn được giữ.')){tx('menu',s=>product(p.id,s).active=false);close();renderAll();}});
  }
  function combos(){
    A.require('combo');const products=S().products.filter(p=>p.active),options=products.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('');
    modal('Combo / 套餐',`<p>Chọn món chính để hiện gợi ý thêm canh. Giá bên dưới là giá của phần canh thêm.</p><label>Món chính</label><select id="comboMain">${options}</select><label>Món canh kèm</label><select id="comboSoup">${options}</select>`+field('comboPrice','Giá canh khi mua kèm',0,'number')+button('comboCreate','Lưu combo','primary')+(S().combos||[]).map(c=>`<p>${e((product(c.mainId)||{}).name||c.mainId)} → ${e((product(c.soupId)||{}).name||c.soupId)} · ${fmt(c.price)} ${button('comboDelete'+c.id,'Xóa combo','danger')}</p>`).join(''),null);
    on('comboCreate',()=>{const mainId=Number(val('comboMain')),soupId=Number(val('comboSoup')),price=num('comboPrice');if(mainId===soupId)throw Error('Chọn hai món khác nhau');tx('combo',s=>{s.combos=s.combos||[];s.combos.push({id:uid('C'),mainId,soupId,price});});combos();});
    (S().combos||[]).forEach(c=>on('comboDelete'+c.id,()=>{tx('combo',s=>s.combos=s.combos.filter(x=>x.id!==c.id));combos();}));
  }
  function vouchers(){
    A.require('vouchers');modal('Voucher / 优惠券',field('bizvCode','Mã voucher')+field('bizvName','Tên voucher')+`<label>Loại giảm</label><select id="bizvType"><option value="FIXED">Số tiền VND</option><option value="PERCENT">Phần trăm</option></select>`+field('bizvValue','Giá trị',0,'number')+field('bizvMin','Đơn tối thiểu',0,'number')+field('bizvQty','Tổng lượt dùng',100,'number')+field('bizvExpiry','Hết hạn cuối ngày',B.day(new Date(Date.now()+30*86400000).toISOString()),'date')+(S().vouchers||[]).map(v=>`<p>${e(v.code)}: ${v.qtyUsed||0}/${v.qtyTotal} ${v.active?'':'· đã khóa'}${button('voucherOff'+v.id,'Bật/tắt')}</p>`).join(''),()=>{
      const code=val('bizvCode').toUpperCase(),name=val('bizvName'),type=val('bizvType'),value=num('bizvValue'),minSpend=num('bizvMin'),qtyTotal=num('bizvQty'),expiry=val('bizvExpiry');
      if(!code||!name||!qtyTotal||!value||(type==='PERCENT'&&value>100)||!/^\d{4}-\d{2}-\d{2}$/.test(expiry))throw Error('Kiểm tra mã, giá trị, lượt dùng và hạn voucher');
      tx('vouchers',s=>{if(s.vouchers.some(v=>v.code.toUpperCase()===code))throw Error('Mã voucher đã tồn tại');s.vouchers.push({id:uid('V'),code,name,nameCn:'',type,value,minSpend,qtyTotal,qtyUsed:0,tier:'Member',expiry,active:true});});close();renderAll();
    });S().vouchers.forEach(v=>on('voucherOff'+v.id,()=>{tx('vouchers',s=>{const x=voucher(v.id,s);x.active=!x.active;});vouchers();}));
  }
  function chooseVoucher(o){
    if(o.parentOrderId)throw Error('Bill đã tách giữ phần giảm giá của đơn gốc');
    const valid=S().vouchers.filter(v=>isVoucherEligible(v,customer(o.customerId),o.subtotal)[0]);
    modal('Chọn voucher / 选择优惠券',button('voucherNone','Không dùng voucher')+valid.map(v=>button('useV'+v.id,`${e(v.code)} · −${fmt(discountFor(v,o.subtotal))}`)).join(''),null);
    function use(id){tx('voucher_use',s=>{const x=s.orders.find(t=>t.id===o.id);if(['PAID','CANCELLED','SPLIT'].includes(x.status)||x.paymentStatus==='CUSTOMER_REPORTED')throw Error('Không đổi voucher sau khi thanh toán/khách báo chuyển khoản');x.voucherId=id;H.recalculate(s,x);});close();renderAll();}
    on('voucherNone',()=>use(null));valid.forEach(v=>on('useV'+v.id,()=>use(v.id)));
  }
  function splitOrder(o){
    const max=o.items.reduce((v,i)=>v+i.qty,0),alloc=[o.items.map(i=>i.qty),o.items.map(()=>0)];
    if(max<2)throw Error('Cần ít nhất 2 phần món để tách bill / 至少需要两份菜品');
    const labels={size:'Size / 份量',spice:'Độ cay / 辣度',rice:'Cơm / 米饭',note:'Ghi chú / 备注',combo:'Combo / 套餐'};
    const details=i=>Object.entries(i.mods||{}).filter(x=>x[1]!=null&&x[1]!=='').map(x=>(labels[x[0]]||x[0])+': '+x[1]).join(' · ');
    function draw(){
      const used=o.items.map((_,n)=>alloc.reduce((v,row)=>v+row[n],0));
      const left=o.items.map((i,n)=>i.qty-used[n]);
      const amounts=B.splitAmounts(o,alloc),complete=left.every(q=>q===0),filled=alloc.every(row=>row.some(q=>q>0));
      const cards=alloc.map((row,b)=>`<div class="m-card split-bill" data-bill="${b}" data-total="${amounts[b].total}" style="border:2px solid #e5e7eb;margin:10px 0;overflow-wrap:anywhere"><h3>Bill ${b+1} · ${fmt(amounts[b].total)}</h3><small>Tiền món / 原价: ${fmt(amounts[b].subtotal)}<br>Giảm giá / 优惠: −${fmt(amounts[b].discount)}<br>${complete?'Phải thu / 应收':'Tạm tính / 暂计'}: ${fmt(amounts[b].total)}</small>${o.items.map((i,n)=>`<div class="split-line" style="border-top:1px solid #eee;margin-top:10px;padding-top:8px;min-width:0"><b>${e(i.name)}</b><small style="display:block">${e(i.nameCn||'')}</small><small class="split-mods" style="display:block">${e(details(i))}</small><small style="display:block">${fmt(i.price)} / phần · Tổng / 总数: ${i.qty}</small><div style="display:flex;align-items:center;justify-content:flex-end;margin-top:6px"><button type="button" id="sm${b}_${n}" aria-label="Bớt món ${n+1} bill ${b+1}" style="min-width:44px;min-height:44px" ${row[n]===0?'disabled':''}>−</button><b style="text-align:center;min-width:44px">${row[n]}</b><button type="button" id="sp${b}_${n}" aria-label="Thêm món ${n+1} bill ${b+1}" style="min-width:44px;min-height:44px" ${row[n]===i.qty?'disabled':''}>＋</button></div></div>`).join('')}${alloc.length>2?button('sr'+b,'Xóa bill · chuyển món sang bill còn lại / 删除并转移菜品','danger'):''}</div>`).join('');
      const remain=left.map((q,n)=>q?e(o.items[n].name+' · '+details(o.items[n]))+': '+q:'').filter(Boolean);
      $('splitWorkspace').innerHTML=`<p id="splitSummary"><b>${remain.length?'Chưa phân bổ / 未分配: '+remain.join(' · '):'✓ Đã phân bổ toàn bộ món'}</b><br>Tổng đơn sau giảm / 应收总额: ${fmt(o.total)}${!filled?'<br>Mỗi bill cần ít nhất 1 phần / 每单至少一份':''}</p>${cards}${alloc.length<max?button('splitAddBill','＋ Thêm bill / 添加账单','secondary'):''}`;
      $('businessSave').disabled=!complete||!filled;
      alloc.forEach((row,b)=>{row.forEach((q,n)=>{on('sm'+b+'_'+n,()=>{if(row[n]>0){row[n]--;draw();}});on('sp'+b+'_'+n,()=>{if(left[n]>0){row[n]++;draw();return;}const source=alloc.findIndex((r,k)=>k!==b&&r[n]>0);if(source<0)throw Error('Món này đã được phân bổ hết');alloc[source][n]--;row[n]++;draw();});});on('sr'+b,()=>{const target=b===0?1:0;alloc[b].forEach((q,n)=>alloc[target][n]+=q);alloc.splice(b,1);draw();});});
      on('splitAddBill',()=>{alloc.push(o.items.map(()=>0));draw();});
    }
    modal('Tách bill / 分单',`<p>Thêm bill rồi bấm ＋ để lấy món chưa phân bổ; nếu hết, món được chuyển từ bill đầu tiên còn món. Bấm − để trả món về phần chưa phân bổ. Xóa bill sẽ chuyển món sang bill đầu tiên còn lại. Tối đa ${max} bill. Không in lại bếp.</p><div id="splitWorkspace"></div>`,()=>{
      if(alloc.some(row=>!row.some(q=>q>0)))throw Error('Mỗi bill phải có ít nhất 1 món');
      if(!confirm('Xác nhận tách thành '+alloc.length+' bill độc lập?'))return;
      const ids=tx('split',s=>{const x=s.orders.find(t=>t.id===o.id);if(!x.inventoryCommittedAt)LotusEnhanced.commitInventoryForOrder(s,x);return B.splitMany(s,o.id,alloc,nowISO(),()=>uid('ORD')).map(x=>x.id);});close();H.openOrder(ids[0]);
    });draw();
  }
  function refundOrder(o){
    modal('Trả món / Hoàn tiền / 退款',`<p>Chỉ xác nhận sau khi đã hoàn tiền cho khách. Không tự hoàn kho món đã chế biến.</p>`+o.items.map((i,n)=>field('refund'+n,i.name+' (đã bán '+i.qty+')',0,'number')).join('')+`<label>Tiền hoàn qua</label><select id="refundMethod"><option value="CASH">Tiền mặt</option><option value="BANK">Chuyển khoản</option></select>`+field('refundReason','Lý do'),()=>{
      const q=o.items.map((_,n)=>num('refund'+n)),method=val('refundMethod'),reason=val('refundReason');
      const preview=B.refund(deepClone(S()),o.id,q,method,reason,nowISO(),S().mobile.staffId,()=>uid('R'));
      if(!confirm('Đã hoàn '+fmt(preview.amount)+' cho khách bằng '+(method==='CASH'?'TIỀN MẶT':'CHUYỂN KHOẢN')+'?'))return;
      tx('refund',s=>B.refund(s,o.id,q,method,reason,nowISO(),s.mobile.staffId,()=>uid('R')));close();renderAll();
    });
  }
  // Keep the existing item snapshots; a later menu price change never changes an old bill.
  window.addCartItem=function(cart,p,mods={}){
    A.require('order');const price=B.price(p,mods),key=p.id+'-'+JSON.stringify(mods),existing=cart.find(i=>i.key===key&&i.price===price);
    if(existing)existing.qty++;else cart.push({key,productId:p.id,name:p.name,nameCn:p.nameCn,price,qty:1,station:p.station,mods:deepClone(mods)});
  };
  window.openModifier=function(p,context){
    A.require('order');
    const rice=p.riceOptions||[],spices=['小','中','大'];
    modal(p.name+' / '+(p.nameCn||''),`<label>Size / 份量</label><select id="choiceSize"><option value="中">中 · ${fmt(p.price)}</option><option value="大">大 · ${fmt(p.largePrice==null?p.price:p.largePrice)}</option></select><label>Độ cay / 辣度</label><select id="choiceSpice">${spices.map(x=>`<option value="${x}">${x} · +${fmt(p.spicePrices&&p.spicePrices[x]||0)}</option>`).join('')}</select>${rice.length?'<label>Loại cơm / 米饭</label><select id="choiceRice">'+rice.map(r=>`<option value="${e(r.name)}">${e(r.name)} · +${fmt(r.price)}</option>`).join('')+'</select>':''}`+field('choiceNote','Ghi chú / 备注'),()=>{
      const mods={size:val('choiceSize'),spice:val('choiceSpice'),note:val('choiceNote')};if(rice.length)mods.rice=val('choiceRice');
      tx('order',s=>{addCartItem(s.mobile.cart,product(p.id,s),mods);});close();renderAll();
      const choices=(S().combos||[]).filter(c=>c.mainId===p.id&&product(c.soupId)&&product(c.soupId).active);
      if(choices.length){modal('Thêm canh theo combo? / 加汤？',choices.map(c=>button('offer'+c.id,e(product(c.soupId).name)+' · '+fmt(c.price),'primary')).join(''),null);
        choices.forEach(c=>on('offer'+c.id,()=>{tx('order',s=>{const soup=product(c.soupId,s),key='combo-'+c.id;const old=s.mobile.cart.find(i=>i.key===key);if(old)old.qty++;else s.mobile.cart.push({key,productId:soup.id,name:soup.name,nameCn:soup.nameCn,price:c.price,qty:1,station:soup.station,mods:{combo:p.name,size:'中',spice:'小'}});});close();renderAll();}));}
    });$('businessSave').textContent='Thêm món / 加入';
  };
  window.renderMobile=function(){
    let a;try{a=A.refresh();}catch(err){$('mobileScreen').innerHTML='<div class="m-card">'+e(err.message)+'</div>';return;}
    if(!a.user){login(a);return;}baseRender();const m=S().mobile,content=$('mobileScreen').querySelector('.staff-main-scroll');if(!content)return;
    if(m.tab!=='profile')page='';
    const table=$('mTable');if(table){table.innerHTML=Array.from({length:16},(_,i)=>'T'+String(i+1).padStart(2,'0')).concat('TAKEAWAY').map(t=>`<option>${t}</option>`).join('');table.value=m.table;}
    if(m.tab==='profile'){
      if(page==='reports'){reports(content);return;}
      content.innerHTML=`<div class="m-card"><h3>${e(a.user.name)}</h3><p>${e(a.user.role)} · Lotus POS 1.2.2</p>${A.can('reports')?button('adminReports','Báo cáo ngày / 日报'):''}${A.can('menu')?button('adminMenu','Món & giá / 菜品价格')+button('adminCombos','Combo / 套餐'):''}${A.can('vouchers')?button('adminVouchers','Tạo/quản lý voucher / 优惠券'):''}${A.can('accounts')?button('adminAccounts','Tài khoản & mật khẩu / 账号密码'):''}${A.can('printer_config')?button('hKitchenConfig','IP máy in bếp / 厨房打印机'):''}${button('hKitchenJobs','Nhật ký phiếu bếp / 打印记录')}${A.can('license')?button('adminLicense','License key / 授权'):''}${button('mLogout','Đăng xuất / 退出','danger')}</div>`;
      on('adminReports',()=>{page='reports';renderMobile();});on('adminMenu',menuList);on('adminCombos',combos);on('adminVouchers',vouchers);on('adminAccounts',accounts);on('adminLicense',license);
      on('hKitchenConfig',()=>N.openKitchenSettings());on('hKitchenJobs',()=>N.openKitchenJobs());on('mLogout',()=>{if(!confirm('Đăng xuất? Giỏ hiện tại sẽ được giữ trên máy.'))return;N.logout();A.refresh();close();renderAll();});
    }
    if(m.tab==='checkout'){
      const o=S().orders.find(x=>m.checkout&&x.id===m.checkout.orderId);if(!o)return;
      if(o.status==='SPLIT'){
        content.innerHTML=button('splitBack','← Đơn hàng')+'<div class="m-card"><h3>Đơn đã tách / 已分单</h3>'+o.splitChildren.map(id=>{const c=S().orders.find(x=>x.id===id);return button('child'+id,e(c.code)+' · '+fmt(c.total));}).join('')+'</div>';
        on('splitBack',H.back);o.splitChildren.forEach(id=>on('child'+id,()=>H.openOrder(id)));return;
      }
      const open=!['PAID','CANCELLED'].includes(o.status);
      content.insertAdjacentHTML('beforeend',`<div class="m-card">${open?button('adminSplit','Tách bill / 分单','primary')+(!o.parentOrderId?button('adminChooseVoucher','Chọn voucher / 使用优惠券'):'<p>Bill đã tách — giảm giá đã chia theo đơn gốc.</p>'):''}${o.status==='PAID'&&A.can('refund')?button('adminRefund','Trả món / Hoàn tiền / 退款','danger'):''}${(S().refunds||[]).filter(r=>r.orderId===o.id).map(r=>`<p>Đã hoàn ${fmt(r.amount)} · ${e(r.reason)}</p>`).join('')}</div>`);
      on('adminSplit',()=>splitOrder(o));on('adminChooseVoucher',()=>chooseVoucher(o));on('adminRefund',()=>refundOrder(o));
      if(o.parentOrderId){content.querySelectorAll('[data-h-cancel]').forEach(b=>b.remove());if($('hAddItems'))$('hAddItems').remove();}
    }
  };
  const oldBack=H.back;H.back=function(){if($('businessModal')){close();return true;}if(page){page='';renderMobile();return true;}return oldBack();};
  renderMobile();
})();
