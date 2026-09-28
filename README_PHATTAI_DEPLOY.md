# Lotus POS PHÁT TÀI v1.5.0 — Deploy & UAT

## 1. Kiến trúc riêng

```text
Customer QR / SUNMI PHÁT TÀI
        ↓
https://pos-phattai.lgl247-ai.workers.dev
        ↓
Cloudflare D1: pos_phattai
```

Không bind Worker này vào `pos_unified`. Không dùng domain `pos-unified.lgl247-ai.workers.dev`.

## 2. Deploy Cloudflare

1. Tạo/giữ D1 `pos_phattai`.
2. Điền `database_id` thật vào `wrangler.jsonc`.
3. Cấu hình secret riêng của PHÁT TÀI:

```bash
npm install
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put SESSION_SECRET
npx wrangler secret put POS_STAFF_PASSWORD
npx wrangler deploy
```

4. Mở `/api/health`. Kết quả cần có:

```json
{"ok":true,"d1":"ok","storeReady":true,"acceptingOrders":true,"version":"2.6.0-phattai.3"}
```

Migration mới của flow này là `0015_order_first_pay_later.sql`.

## 3. QR gọi món

Chỉ cần một QR chung:

```text
https://pos-phattai.lgl247-ai.workers.dev/qr/
```

Sau khi quét, UI bắt khách **chọn bàn trước**. URL có `?table=T07` nếu tồn tại chỉ dùng làm gợi ý chọn ban đầu, không khóa bàn; khách vẫn phải xác nhận bàn trên UI.

Worker kiểm tra bàn hợp lệ theo `table_count` trước khi lưu `qr_orders.table_id`.

## 4. Luồng Order First / Pay Later

```text
QR → chọn bàn → chọn món → Chốt order
→ qr_orders: ACCEPTED + UNPAID
→ cùng transaction D1 tạo pos_kitchen_jobs
→ thiết bị in tại quán poll job mỗi ~3 giây
→ claim job chống in trùng
→ in máy bếp LAN
```

Cloudflare không thể tự kết nối trực tiếp tới IP LAN của máy in. Vì vậy để “in ngay”, tại quán phải có ít nhất một thiết bị in đang online và đăng nhập:

- APK SUNMI PHÁT TÀI mở Staff UI, hoặc
- POS quầy/print bridge tương thích.

Nếu không có thiết bị in online, kitchen job vẫn được lưu trong D1 và sẽ được lấy khi thiết bị quay lại online.

## 5. Thanh toán trên SUNMI

Nhân viên vào `Đơn hàng` → chọn đúng đơn → đối chiếu **BÀN + MÓN + TỔNG** → `Xác nhận đúng đơn → Thanh toán`.

### Tiền mặt

Nhập số tiền thực nhận. Backend chỉ cho PAID khi đủ tiền; lưu `cash_received` và `cash_change`. Mã đơn chốt bằng `-TM`.

### Chuyển khoản

Sau khi nhân viên chọn `Chuyển khoản`, SUNMI mới hiển thị VietQR đúng số tiền/nội dung. Chỉ bấm `Xác nhận đã nhận chuyển khoản` sau khi nhân viên kiểm tra tiền thực vào. Mã đơn chốt bằng `-CK`.

Thanh toán **không tạo lại kitchen job**. Hóa đơn in trên SUNMI sau khi D1 xác nhận PAID.

## 6. Mã đơn

Trước thanh toán:

```text
DDMMYYYY-STT-MAKH
```

Sau thanh toán:

```text
DDMMYYYY-STT-MAKH-CK
DDMMYYYY-STT-MAKH-TM
```

`STT` là sequence theo ngày trong D1. Khách vãng lai dùng `000000`.

## 7. SUNMI / fallback

Source Android v1.5.0:

- `applicationId = vn.lotusai.pos.phattaiapp`
- `versionCode = 150`
- `versionName = 1.5.0`

Giữ app offline 1.2.2 (`vn.lotusai.pos.handheld`) trên máy trong UAT để fallback. Hai package tách nhau.

## 8. Checklist UAT tại PHÁT TÀI

1. Quét QR chung, UI bắt chọn bàn.
2. Chọn T07, gọi 1 món, chốt order.
3. Kiểm D1 order là `ACCEPTED/UNPAID`, đúng `table_id=T07`.
4. Trong khoảng vài giây, kiểm phiếu bếp ra đúng một lần.
5. Trên SUNMI → Đơn hàng → mở đúng T07.
6. Test CASH → `-TM`, tiền thối đúng, hóa đơn SUNMI in.
7. Test BANK → VietQR chỉ hiện sau khi nhân viên chọn BANK → xác nhận tiền vào → `-CK` → hóa đơn SUNMI in.
8. Kiểm payment không sinh phiếu bếp lần hai.
9. Mất Internet: không tạo order giả; sau khi mạng phục hồi mới gửi.
10. Mất LAN máy bếp: order vẫn nằm D1; trạng thái in báo lỗi/không rõ, không tự in trùng.

## One-click remote deploy (recommended)

Do not use `wrangler d1 migrations apply DB --remote` for production PHAT TAI. Some trigger-heavy migration files can hit Cloudflare D1 statement-splitter error `SQLITE_ERROR 7500` on that path.

Use one command instead:

```bash
npm run deploy:remote
```

`scripts/deploy-remote.mjs`:
- verifies Worker `pos-phattai` and D1 `pos_phattai` before touching data;
- reads `d1_migrations` and requires it to be a clean filename prefix;
- applies only pending SQL files, in filename order, through `wrangler d1 execute --remote --file`;
- appends the matching `d1_migrations` stamp into the same import file/transaction;
- verifies history after every migration;
- deploys the Worker only after all migrations succeed.

Cloudflare Builds → Deploy command should therefore be exactly:

```text
npm run deploy:remote
```
