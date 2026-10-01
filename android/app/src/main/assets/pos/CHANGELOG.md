# Changelog

## v12.2.2 — OCB Live QR và kiểm thử Android

### Thêm mới / cập nhật

- Cấu hình OCB BIN `970448`, tài khoản `609271`, người nhận `HUANG TIANSHENG` cho QR thanh toán và VietQR deeplink.
- Deeplink mang số tiền chính xác, nội dung có mã đơn và tên người nhận; có bước xác nhận trước khi rời PWA.
- Tự migration tài khoản demo toàn số 0 sang tài khoản OCB mới, đồng thời giữ nguyên cấu hình tùy chỉnh hợp lệ.
- Giữ trạng thái an toàn: mở ngân hàng không tự đánh dấu `PAID`; khách báo đã chuyển chỉ thành `CUSTOMER_REPORTED`; nhân viên vẫn phải kiểm tra tiền vào.
- Chuẩn hóa Customer QR theo mốc trung lập 360×800 CSS px, thêm fallback `100vh`/`100dvh`, safe-area và kiểm tra ở 320/360/390/430 px để không phụ thuộc hãng máy.
- Thêm kiểm thử mobile touch cho toàn bộ luồng QR/Staff cùng 7 ảnh kiểm tra trực quan; tổng số PASS được tạo lại tự động trong báo cáo release.

### Giới hạn

- Bản HTML không có webhook/đối soát ngân hàng, nên chưa thể tự xác nhận giao dịch đã vào tài khoản.
- Việc mở OCB OMNI và thanh toán thật cần kiểm tra cuối trên điện thoại có ứng dụng ngân hàng; luôn đối chiếu tên `HUANG TIANSHENG` trước khi chuyển.

## v12.2.1 — PWA, OCB Demo, License Simulator

### Thêm mới

- Staff PWA và Customer QR PWA mobile-first với manifest riêng, icon 192/512 + maskable, service worker versioned cache, offline shell và entry `/staff/`, `/qr/`.
- Staff bottom navigation: Bán hàng, Đơn hàng, Bàn, Cá nhân. Customer: Menu, Giỏ, Ưu đãi, Tài khoản.
- Lookup số điện thoại thành viên và đăng ký khách mới tại giỏ POS/checkout Staff/QR.
- OCB BANK SIMULATOR an toàn; order barcode và bank QR hiển thị song song; QR chứa đúng số tiền/nội dung đơn; download/copy fallback.
- `CUSTOMER_REPORTED` tách khỏi `PAID`; nhân viên xác nhận đã kiểm tra tiền vào; settlement idempotent.
- `STORE_OWNER`, `MANAGER`, `CASHIER`, vai trò tự tạo, permission matrix và gán vai trò nhân viên. Admin cửa hàng cũ migration thành Store Owner.
- License Simulator với `ACTIVE`, `EXPIRING_SOON`, `GRACE`, `SUSPENDED`, `OFFLINE_LOCKED`; virtual clock, audit, once-daily job/idempotency, offline 10/11 ngày và System Admin demo riêng.
- Công thức nguyên liệu cho sản phẩm, quy đổi g/kg/ml/l/cái, trừ tồn ước tính khi tạo đơn đúng một lần.
- Nhập kho, điều chỉnh tăng/giảm, movement log, ngày nhập dự kiến, nhà cung cấp và người phụ trách theo ca/lịch.
- Font Noto Sans SC bundle để hiển thị tiếng Trung giản thể nhất quán.
- 228 kiểm thử tự động và artifacts JSON/CSV/Markdown; ảnh responsive 320/390/430 và desktop.

### Giữ nguyên và nối lại

- POS quầy, màn hình khách, preview mobile, QR order, Order Center, BAR/KITCHEN/SERVICE production routing.
- Products, vouchers, customers, loyalty/tier, receipts, dashboard và Test Lab.
- Quản lý ca, chấm công, lịch làm, giao hàng, nghỉ phép, task và bàn giao ca.
- Logo Echo Coffee và nội dung song ngữ Việt Nam / 简体中文.
- Dữ liệu localStorage được migration; không reset tự động.

### Sửa lỗi

- Không còn rò form sửa OCB vào Customer QR; Store Settings là nơi cấu hình duy nhất.
- Khóa deeplink thật khi dùng account demo `0000000000`.
- Ngăn double payment, double receipt, double voucher và double loyalty.
- Giữ object state QR qua migration, tránh checkout cập nhật reference cũ.
- Sửa mobile overflow, category bị co/cắt, bottom nav đè nội dung, mock-phone chrome trên thiết bị thật và glyph/font tiếng Trung.
- Chặn nhận order mới khi offline hoặc license locked nhưng vẫn cho settle order cũ/export.

### File chính thay đổi/thêm

- `index.html`, `lotus-v12.2.1.js`, `lotus-v12.2.1.css`
- `staff.webmanifest`, `customer.webmanifest`, `sw.js`, `offline.html`
- `staff/index.html`, `qr/index.html`, `icons/*`, `fonts/*`
- `README.md`, `docs/BASELINE_AUDIT.md`, `docs/LICENSE_SERVER_VPS_DESIGN.md`
- `TEST_CASES.json`, `TEST_CASES.csv`, `TEST_REPORT.md`, `tests/*`, `test-results/*`

### Cảnh báo release

- Chưa kết nối ngân hàng thật, webhook hoặc đối soát; BANK SIMULATOR không chuyển tiền.
- Chưa có backend đồng bộ nhiều thiết bị; state vẫn browser-local.
- License chỉ là simulator; chưa có VPS, signed lease, MFA hoặc remote enforcement.
- PWA chưa phải APK; printer/scanner SUNMI và app OCB thật vẫn cần UAT thiết bị.
- FaceID/API đang ngoài phạm vi phiên bản này.

### Rollback

Redeploy ZIP/commit v12.2 trước đó. Xuất backup JSON trước rollback nếu cần bảo toàn dữ liệu browser. Bản mới không xóa dữ liệu cũ; khi quay về mã cũ, các field schema mới chỉ bị bỏ qua nhưng nên giữ bản backup để có thể quay lại v12.2.1.
