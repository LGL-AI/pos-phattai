# Baseline Audit — nguồn v12.2

Nguồn triển khai được đối chiếu: `LotusPOS_v12_2_CHECKOUT_OCB_DEMO_FINAL(4).zip`.

Archive thực tế có tám file: một HTML chạy ứng dụng, thư viện QR, logo và năm file tài liệu/test cũ. Ba tài nguyên runtime cốt lõi là `LotusPOS_v12_UNIFIED_POC.html`, `qrcode-standalone.js`, `echo-coffee-logo.jpg`. HTML được đổi tên thành `index.html` ở bản bàn giao.

## Hiện trạng trước khi sửa

| Hạng mục | Hiện trạng v12.2 | Rủi ro/thiếu | Kết quả v12.2.1 |
|---|---|---|---|
| Kiến trúc | Một HTML, `LotusDB` localStorage, event bus trong browser | Không có backend hoặc đồng bộ nhiều thiết bị | Giữ một lõi logic, ghi nhãn giới hạn same-browser |
| POS quầy | Chọn món, modifier, giỏ, voucher, order, thanh toán | Thiếu thao tác số điện thoại/đăng ký nhanh tại giỏ | Đã thêm lookup và đăng ký khách ngay cạnh giỏ |
| Phân loại món | Sản phẩm có `group` và lọc category | Nhãn mobile dài, dễ co/cắt | Giữ nhóm thực, lọc hoạt động, category cuộn ngang không co chữ |
| Customer QR | Menu/giỏ/member/voucher/payment trong khung preview | Mobile còn desktop chrome/inspector; cấu hình ngân hàng lẫn vào vùng khách | Tách standalone mobile; inspector chỉ xem; cấu hình chuyển sang Store Settings |
| Staff Mobile | Staff/Customer nằm trong mockup iPhone | Chưa phải entry PWA toàn màn hình; checkout chưa đủ member/voucher/payment | Staff PWA riêng, bốn tab, checkout đầy đủ và xác nhận tiền thủ công |
| Second screen | Hiển thị giỏ POS trong cùng trang | Dễ bị hiểu nhầm là đồng bộ nhiều máy | Giữ phản chiếu cùng Demo Studio, sửa nhãn phạm vi |
| Payment | VietQR, copy/download, `PENDING`/`CUSTOMER_REPORTED`/`PAID` | Chưa có OCB direct-demo an toàn và barcode đơn song song | Thêm BANK SIMULATOR, bốn fallback, barcode + QR, idempotency |
| OCB | BIN `970448`, account `0000000000` | Tài khoản demo không được phép mở chuyển tiền thật | Khóa real deeplink với account toàn số 0, badge DEMO rõ ràng |
| Voucher/loyalty | Có tồn voucher, tier và cộng điểm | Nguy cơ side effect khi retry | Chỉ ghi nhận lúc PAID và chỉ một lần |
| Sản phẩm/kho | Có stock sản phẩm | Chưa có công thức nguyên liệu, nhập/điều chỉnh/lịch nhập | Thêm 18 nguyên liệu, recipe/unit conversion, movement log và phân công theo ca |
| Nhân viên/ca | Admin/Manager/Cashier; ca, chấm công, lịch, giao hàng, nghỉ, task, handover | `Admin` dễ bị nhầm System Admin | Migrate `Admin` → `STORE_OWNER`, giữ toàn bộ module vận hành |
| Phân quyền | Vai trò seed đơn giản | Chưa có vai trò tự tạo/ma trận quyền | Thêm role editor, permission matrix, gán vai trò nhân viên |
| License | Không có | Không mô phỏng các biên 05:00/offline | Thêm License Simulator và tài liệu VPS, không tuyên bố remote lock |
| PWA | Không có manifest/service worker | Không cài được, không có offline shell | Hai manifest, icons, SW versioned cache, offline warning, entry `/staff/`, `/qr/` |
| Song ngữ/logo | Có Việt/中文 và Echo logo | Có nguy cơ mất font/glyph trên browser test | Giữ song ngữ, bundle Noto Sans SC, logo góc trái các screen |
| Test | Logic/test report cũ | Chưa đủ browser responsive và artifact chuẩn | 228 test tự động + 7 mục nghiệm thu vật lý NOT RUN |

## Phân loại chức năng

- Chức năng thật trong phạm vi POC: giỏ, modifier, lọc món, thành viên, voucher, order, production, receipt, stock/recipe, ca làm, role matrix, export, local persistence và state transitions.
- Mô phỏng có chủ đích: BANK SIMULATOR và License Simulator. Chúng thay đổi trạng thái demo nhưng không gọi ngân hàng/VPS thật.
- Chưa tích hợp: bank webhook/reconciliation, backend dùng chung, FaceID/API, SUNMI native bridge, MFA/System Admin production và remote license enforcement.

Không có module nghiệp vụ gốc nào bị bỏ khỏi thanh điều hướng desktop. Các thay đổi mới được ghép quanh mô hình dữ liệu cũ và có migration thay vì reset dữ liệu.

