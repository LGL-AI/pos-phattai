# Lotus POS v12.2.2 — PWA, OCB Live QR và License Simulator

POC tĩnh song ngữ Việt Nam / 简体中文 cho Echo Coffee. Bản này giữ một lõi nghiệp vụ dùng chung cho POS quầy, màn hình khách, POS cầm tay nhân viên và Customer QR Order.

## Chạy bản demo

Không mở bằng `file://`, vì service worker và khả năng cài PWA cần HTTPS hoặc localhost.

```bash
python3 -m http.server 8080
```

Sau đó mở:

| Ngữ cảnh | URL |
|---|---|
| Demo Studio + POS quầy | `http://localhost:8080/` |
| Staff PWA / POS cầm tay | `http://localhost:8080/staff/` hoặc `/?mode=staff` |
| Customer QR — bàn T01 | `http://localhost:8080/qr/?table=T01` hoặc `/?mode=qr&table=T01` |
| Customer QR — bàn T02 | `http://localhost:8080/qr/?table=T02` |
| License Simulator | Desktop → `LotusAI Admin DEMO` |

Mã đăng nhập mẫu:

| Người dùng | Vai trò | PIN |
|---|---|---:|
| Alex (`NV001`) | Store Owner | `1234` |
| Linh (`NV002`) | Manager | `2222` |
| Minh (`NV003`) | Cashier | `3333` |

Khách thành viên mẫu: `0909000111` / PIN `1111`; `0909000222` / `2222`; `0909000333` / `3333`.

## Luồng demo chính

- Customer QR: quét bàn → chọn món/modifier → giỏ → đăng nhập, đăng ký hoặc khách vãng lai → voucher → tiền mặt hoặc chuyển khoản → mã đơn dạng ngắn + barcode và QR ngân hàng.
- Staff handheld: đăng nhập → chọn bàn/món → khách thành viên hoặc đăng ký mới → voucher → thanh toán → nhân viên kiểm tra tiền vào rồi xác nhận thủ công.
- POS quầy: nhập số điện thoại thành viên hoặc đăng ký mới ngay tại giỏ → tạo đơn → màn hình khách cập nhật trong cùng trình duyệt → phiếu bếp/bar → thanh toán.
- Kho: công thức nguyên liệu theo món, đơn vị g/kg/ml/l/cái; tạo đơn trừ tồn ước tính đúng một lần; có nhập kho, điều chỉnh tăng/giảm, lịch nhập và người phụ trách theo ca.
- Quyền: `STORE_OWNER`, `MANAGER`, `CASHIER` và vai trò tự tạo bằng ma trận quyền. `SYSTEM_ADMIN` chỉ tồn tại trong License Simulator riêng.

## Cài PWA

- Customer QR dùng thiết kế mobile-first trung lập, lấy **360 × 800 CSS px** làm mốc phổ biến; giao diện tự co giãn cho điện thoại rộng **320–430 px**, không phụ thuộc hãng máy.
- Android/SUNMI: mở URL HTTPS hoặc localhost bằng trình duyệt tương thích → chọn **Cài ứng dụng / Install app**.
- iPhone/iPad: mở bằng Safari → **Chia sẻ** → **Thêm vào Màn hình chính**.
- Staff và Customer có manifest/ID riêng. Việc hai biểu tượng có được cài song song hay bị trình duyệt gộp cần xác nhận trên thiết bị thật.
- PWA không phải APK. Máy in nhiệt, scanner và thiết bị SUNMI cần native bridge/SDK và UAT phần cứng riêng.

Khi ngoại tuyến, giao diện đã cache có thể mở để xem; POC không nhận hoặc giả vờ gửi thành công đơn mới. Không cache API thanh toán, webhook hay License Server.

## OCB QR thanh toán thật

Tài khoản nhận tiền đã cấu hình: OCB BIN `970448`, số `609271`, tên `HUANG TIANSHENG`. QR và nút **Chuyển khoản ngay** chứa đúng số tiền cùng nội dung có mã đơn; nút này mở VietQR deeplink để bàn giao sang ứng dụng ngân hàng trên thiết bị hỗ trợ.

- QR gắn đúng số tiền và nội dung có mã đơn.
- Trước khi xác nhận, khách phải kiểm tra tên người nhận hiển thị là `HUANG TIANSHENG` trong ứng dụng ngân hàng.
- Khách bấm “Tôi đã chuyển khoản” chỉ chuyển sang `CUSTOMER_REPORTED`.
- Chỉ khi nhân viên kiểm tra tiền vào và xác nhận thì đơn mới `PAID`.
- Retry xác nhận không tạo thêm receipt, không trừ voucher hoặc cộng điểm lần hai.
- Bản HTML không tự biết tiền đã vào vì chưa có backend/webhook ngân hàng; cần kiểm tra giao dịch thật trên OCB trước khi xác nhận.

## Dữ liệu và giới hạn POC

Dữ liệu lưu trong `localStorage` theo origin và được migration lên schema mới; không tự reset. Nút xuất backup nằm trong Cài đặt cửa hàng. Các màn hình liên động trong cùng browser, nhưng **không đồng bộ realtime giữa các máy độc lập** vì chưa có backend chung.

License là simulator browser-local, không phải cơ chế khóa từ xa hoặc RBAC an toàn. Thiết kế production nằm tại `docs/LICENSE_SERVER_VPS_DESIGN.md`.

## Chạy kiểm thử

Yêu cầu Node.js 20+:

```bash
npm ci --prefix tests
npm --prefix tests run test:logic
npm --prefix tests run test:dom
npm --prefix tests run test:browser
npm --prefix tests run test:mobile
node tests/build_test_artifacts.mjs
```

Kết quả chi tiết: `TEST_REPORT.md`, `TEST_CASES.json`, `TEST_CASES.csv` và thư mục `test-results/`.

## Đưa lên GitHub/Vercel khi được phép

Chỉ thực hiện sau khi chủ dự án cho phép và đã thay/kiểm tra toàn bộ cấu hình public:

1. Giải nén sao cho `index.html` nằm ở root repository `LGL-AI/lotus-pos-demo`.
2. Số tài khoản và tên nhận tiền trong bản demo là thông tin public có chủ đích. Tuyệt đối không commit `.env`, mật khẩu ngân hàng, PIN, OTP, khóa ký, API key hoặc dữ liệu khách thật.
3. Commit/push vào đúng branch đã thống nhất; tạo Vercel project kiểu static site, root directory là repository root.
4. Kiểm tra HTTPS và bốn route `/`, `/staff/`, `/qr/?table=T01`, `/?mode=qr&table=T02`.
5. Kiểm tra manifest, service worker, cài PWA và hard-refresh sau release.

Rollback: redeploy commit/ZIP v12.2 trước đó. Nếu cần giữ dữ liệu browser hiện có, xuất backup JSON trước; rollback mã không tự xóa `localStorage`.
