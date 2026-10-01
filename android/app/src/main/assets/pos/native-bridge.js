(function () {
  'use strict';

  const native = window.NativePOS;
  const isNative = !!(native && typeof native.printReceipt === 'function');
  let activeRequestId = null;

  function state() {
    return window.LotusPOC && typeof window.LotusPOC.S === 'function' ? window.LotusPOC.S() : null;
  }

  function currentPaidOrder() {
    const s = state();
    const id = s && s.mobile && s.mobile.checkout && s.mobile.checkout.orderId;
    return s && s.orders ? s.orders.find(order => order.id === id && order.status === 'PAID') : null;
  }

  function receiptOrder() {
    const s = state();
    if (!s || !s.orders) return null;
    const id = window.__lotusReceiptOrderId;
    return s.orders.find(order => order.id === id) || null;
  }

  function modsText(mods) {
    if (!mods || typeof mods !== 'object') return '';
    return Object.entries(mods)
      .filter(([, value]) => value && value !== '-')
      .map(([key, value]) => {
        const label = key === 'size' ? 'Size' : key === 'spice' ? '辣度' : key === 'note' ? 'Ghi chú' : key;
        return label + ': ' + value;
      })
      .join(' · ');
  }

  function receiptPayload(order) {
    const s = state();
    const settings = (s && s.settings) || {};
    const payment = order.payment || {};
    return {
      storeName: settings.storeName || 'LOTUS POS',
      address: settings.address || '',
      phone: settings.phone || '',
      orderCode: order.code || '',
      table: order.table || '',
      source: order.source || '',
      paidAt: order.paidAt || order.createdAt || '',
      items: (order.items || []).map(item => ({
        name: item.name || '',
        nameCn: item.nameCn || '',
        qty: Number(item.qty || 1),
        price: Number(item.price || 0),
        mods: modsText(item.mods)
      })),
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount || 0),
      total: Number(order.total || 0),
      paymentMethod: payment.method || order.requestedPaymentMethod || '',
      received: Number(payment.received || order.total || 0),
      change: Number(payment.change || 0)
    };
  }

  function setButtonState(text, disabled) {
    ['mPrintPaidReceipt', 'printReceipt'].forEach(id => {
      const button = document.getElementById(id);
      if (!button) return;
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.textContent = text || button.dataset.originalText;
      button.disabled = !!disabled;
    });
  }

  function loginFromScreen(event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    const s = state();
    const select = document.getElementById('mLoginStaff');
    const pinInput = document.getElementById('mPin');
    const button = document.getElementById('mLogin');
    if (!s || !s.mobile || !Array.isArray(s.staff) || !select || !pinInput) {
      window.alert('Không đọc được dữ liệu đăng nhập. Hãy đóng và mở lại app.');
      return;
    }
    const staffId = Number(select.value);
    const staff = s.staff.find(item => Number(item.id) === staffId);
    const pin = String(pinInput.value || '').trim();
    if (!staff || String(staff.pin) !== pin) {
      window.alert('Sai PIN / PIN错误');
      pinInput.focus();
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'ĐANG ĐĂNG NHẬP… / 登录中…';
    }
    s.mobile.loggedIn = true;
    s.mobile.staffId = staffId;
    s.mobile.tab = 'menu';
    if (window.LotusDB && typeof window.LotusDB.save === 'function') window.LotusDB.save();
    if (window.Bus && typeof window.Bus.emit === 'function') {
      window.Bus.emit('mobile.login', { staff: staff.name, source: 'NATIVE_HOTFIX' });
    }
    if (typeof window.renderAll === 'function') window.renderAll();
    else window.location.reload();
  }

  function printOrder(order) {
    if (!order || order.status !== 'PAID') {
      window.alert('Chỉ in sau khi đơn đã nhận tiền / 仅在收款后打印');
      return;
    }
    if (!isNative) {
      window.__lotusReceiptOrderId = order.id;
      if (typeof window.showReceipt === 'function') window.showReceipt(order.id);
      window.print();
      return;
    }
    if (activeRequestId) {window.alert('Máy in SUNMI đang xử lý phiếu trước. Đơn đã thanh toán và lưu; mở lại đơn này để in hóa đơn sau.');return;}
    const originalId = 'receipt:' + order.id + ':' + (order.paidAt || 'paid');
    const reprint = native.getReceiptState && native.getReceiptState(originalId) !== 'NEW';
    const requestId = reprint ? originalId + ':copy:' + Date.now() : originalId;
    activeRequestId = requestId;
    setButtonState('ĐANG IN… / 打印中…', true);
    try {
      if(reprint && native.reprintReceipt) native.reprintReceipt(requestId, JSON.stringify(receiptPayload(order)));
      else native.printReceipt(requestId, JSON.stringify(receiptPayload(order)));
      setTimeout(()=>{if(activeRequestId===requestId){activeRequestId=null;setButtonState('KIỂM TRA / IN LẠI / 重印',false);window.alert('Chưa có kết quả in SUNMI. Kiểm tra giấy trước khi in lại.');}},30000);
    } catch (error) {
      activeRequestId = null;
      setButtonState('IN LẠI / 重新打印', false);
      window.alert('Không gửi được lệnh in: ' + error.message);
    }
  }

  function installPaidButton() {
    const order = currentPaidOrder();
    const done = document.getElementById('mCheckoutDone');
    if (!order || !done || document.getElementById('mPrintPaidReceipt')) return;
    const button = document.createElement('button');
    button.id = 'mPrintPaidReceipt';
    button.className = 'good wide';
    button.style.marginTop = '10px';
    button.textContent = 'IN HÓA ĐƠN / 打印小票';
    button.addEventListener('click', () => printOrder(currentPaidOrder()));
    done.parentNode.insertBefore(button, done);
  }

  function installReceiptButton() {
    const button = document.getElementById('printReceipt');
    if (!button || button.dataset.nativeReceiptBound) return;
    button.dataset.nativeReceiptBound = '1';
    button.textContent = isNative ? 'IN HÓA ĐƠN / 打印小票' : 'In / 打印';
    button.onclick = () => {
      const order = receiptOrder();
      if (isNative && order) printOrder(order);
      else window.print();
    };
  }

  function installDiagnosticsButton() {
    if (window.LotusAccess && !window.LotusAccess.can('diagnostics')) return;
    if (!isNative || document.getElementById('mDeviceDiagnostics')) return;
    const logout = document.getElementById('mLogout');
    if (!logout || !logout.parentNode) return;
    const button = document.createElement('button');
    button.id = 'mDeviceDiagnostics';
    button.className = 'secondary wide';
    button.style.marginBottom = '9px';
    button.setAttribute('data-native-diagnostics', '1');
    button.textContent = 'KIỂM TRA THIẾT BỊ / 设备检测';
    logout.parentNode.insertBefore(button, logout);
  }

  window.LotusNativeBridge = {
    printPaidOrder: printOrder,
    onNativeEvent(event) {
      if(event && event.category==='PRINTER' && String(event.requestId||'').indexOf('report:')===0){if(event.severity!=='INFO')alert(event.severity==='PASS'?'Đã in báo cáo / 日报已打印':event.code+': '+event.message);return;}
      if(event && event.category === 'KITCHEN') {if(window.LotusHandheld)window.LotusHandheld.onKitchenEvent(event);return;}
      if (!event || event.category !== 'PRINTER') return;
      if (!activeRequestId || event.requestId !== activeRequestId) return;
      if (event.severity === 'INFO') return;
      activeRequestId = null;
      if (event.severity === 'PASS') {
        setButtonState('ĐÃ IN ✓ · IN LẠI / 重印', false);
        return;
      }
      setButtonState('IN LẠI / 重新打印', false);
      window.alert((event.code || 'PRT-013') + ': ' + (event.message || 'Lỗi máy in'));
    }
  };

  document.addEventListener('click', event => {
    const target = event.target;
    const login = target && target.closest ? target.closest('#mLogin') : null;
    if (login && isNative) {
      loginFromScreen(event);
      return;
    }
    const diagnostics = target && target.closest ? target.closest('[data-native-diagnostics]') : null;
    if (diagnostics && native && typeof native.openDiagnostics === 'function') native.openDiagnostics();
  }, true);

  document.addEventListener('keydown', event => {
    if (isNative && event.key === 'Enter' && event.target && event.target.id === 'mPin') loginFromScreen(event);
  }, true);

  const observer = new MutationObserver(() => {
    installPaidButton();
    installReceiptButton();
    installDiagnosticsButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  installPaidButton();
  installReceiptButton();
  installDiagnosticsButton();
})();
