(function(){
  'use strict';
  var native=window.NativePOS;
  function result(raw){var r=typeof raw==='string'?JSON.parse(raw):raw;if(!r||!r.ok)throw new Error(r&&r.error||'Không kết nối được xác thực Android');return r;}
  function can(p){return !!(native&&native.authorize&&native.authorize(p));}
  function requirePermission(p){if(!can(p))throw new Error('Không có quyền / 无权限');}
  function refresh(){
    var a=result(native.getAuthState()),s=S();
    s.staff.forEach(function(x){delete x.pin;});
    a.accounts.forEach(function(x){var old=s.staff.find(function(t){return t.id===x.id;});if(old)Object.assign(old,x);else s.staff.push(x);});
    s.mobile.loggedIn=!!a.user;s.mobile.authBypass=false;
    if(a.user){s.mobile.staffId=a.user.id;if(s.session)s.session.storeStaffId=a.user.id;}
    return a;
  }
  window.LotusAccess={can:can,require:requirePermission,result:result,refresh:refresh};
  try{refresh();}catch(e){S().mobile.loggedIn=false;}
})();
