(()=>{'use strict';
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
window.LotusAppUpdate={create({native,canInstall,approve,notice}){
 let latest=null;
 const supported=()=>typeof native?.getAppUpdateState==='function'&&typeof native?.checkAppUpdate==='function'&&typeof native?.installAppUpdate==='function';
 function state(){
  if(latest)return latest;
  try{return JSON.parse(native?.getAppUpdateState?.()||'{}')}catch{return {status:'ERROR',message:'Chưa đọc được trạng thái cập nhật / 无法读取更新状态'}}
 }
 function content(){
  if(!supported())return '<h2>Cập nhật ứng dụng / 应用更新</h2><p>Bản APK này chưa có bộ cập nhật. Nhờ chủ tiệm cài bản hỗ trợ cập nhật một lần. / 当前 APK 不支持应用更新，请联系店主安装支持更新的版本。</p>';
  const info=state(),busy=info.busy===true;
  return `<h2>Cập nhật ứng dụng / 应用更新</h2><p>Phiên bản / 版本: <b>${escape(info.version||'—')}</b></p><p role="status">${escape(info.message||'Chưa kiểm tra / 尚未检查')}</p>${info.releaseVersion?`<p>Bản phát hành / 发布版本: <b>${escape(info.releaseVersion)}</b></p>`:''}<div class="buttons"><button data-action="app-update-check" ${busy?'disabled':''}>Kiểm tra cập nhật / 检查更新</button>${info.available===true?`<button class="primary" data-action="app-update-install" ${busy?'disabled':''}>Cập nhật ứng dụng / 更新应用</button>`:''}</div><p class="muted">Android sẽ yêu cầu xác nhận cài đặt. Hoàn tất giỏ món và các việc đang gửi trước khi cập nhật. / Android 将要求确认安装，请先完成购物车和正在提交的操作。</p>`;
 }
 function render(){return `<div id="app-update-panel" class="card">${content()}</div>`}
 function changed(event){
  if(!event.detail||typeof event.detail!=='object')return;
  latest=event.detail;
  const panel=document.querySelector('#app-update-panel');
  if(panel)panel.innerHTML=content();
 }
 window.addEventListener('lotusAppUpdate',changed);
 return {render,check(){
  if(!supported())return notice('APK này chưa hỗ trợ cập nhật / 当前 APK 不支持更新');
  native.checkAppUpdate();
 },install(){
  if(!supported())return notice('APK này chưa hỗ trợ cập nhật / 当前 APK 不支持更新');
  if(!canInstall())return notice('Hoàn tất giỏ món, thanh toán và các việc đang gửi trước khi cập nhật / 请先完成购物车、付款及正在提交的操作');
  if(state().busy===true||state().available!==true)return;
  if(approve('Tải và cài bản mới? Ứng dụng sẽ khởi động lại sau khi cài. / 下载并安装新版本？安装后应用将重新启动。'))native.installAppUpdate();
 },close(){window.removeEventListener('lotusAppUpdate',changed)}};
}};
})();
