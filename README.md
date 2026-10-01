# Lotus POS Phát Tài

POS bản online cho **TIỆM SÍU LẬP PHÁT TÀI**:
- POS cầm tay SUNMI: app Android `vn.lotusai.pos.phattaiapp`
- POS quầy trên trình duyệt: `/counter/`
- Khách quét QR gọi món: `/qr/`

Tất cả dùng chung một backend là Cloudflare Worker `pos-phattai` với D1 `pos_phattai`. Đồng bộ giữa các máy chạy realtime qua Durable Object.

```text
Khách quét QR ─┐
SUNMI cầm tay ─┼──► https://pos-phattai.lgl247-ai.workers.dev ──► D1 pos_phattai
POS quầy ──────┘          (Worker + Durable Object realtime)
```

## Phát hành: đẩy lên `main` là xong

GitHub Actions (`.github/workflows/ci.yml`) xử lý toàn bộ quy trình:

| Khi nào | Việc gì |
|---|---|
| Mỗi lần push | Chạy toàn bộ test (`npm test`). Chạy end-to-end Staff UI + QR trên trình duyệt giả lập SUNMI 360×720, CPU chậm 4 lần (`npm run test:e2e`). |
| Push lên nhánh khác `main` | Biên dịch APK chưa ký, để chắc chắn phần Java build được. |
| Push lên `main` | Nếu app Android có thay đổi: build và ký APK mới, versionCode tự tăng, lưu vào GitHub Release `android-v<code>`. Sau đó backup D1 (lưu trong artifact 90 ngày), áp các migration còn thiếu, deploy Worker kèm APK, rồi kiểm tra lại production. |

Máy SUNMI tự kiểm tra cập nhật mỗi 15 phút. Khi có bản mới, chủ tiệm vào **Quản trị chủ tiệm → Thiết bị & máy in → Cập nhật ứng dụng** và bấm cài; không cần ai đến quán. Nếu lần push chỉ sửa Worker thì APK được giữ nguyên, máy không bị nhắc cập nhật.

Repo cần 5 secret (Settings → Secrets and variables → Actions):
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Khóa ký APK** có certificate SHA-256 `e66d9870…f484b4`. File gốc chỉ nằm trên máy chủ dự án và USB dự phòng. Mất khóa này thì máy ở quán không nhận cập nhật được nữa, phải gỡ app và cài lại. Không đưa file khóa vào repo, Zalo hay công cụ AI.

## Làm việc trên máy dev

Cần Node 22+ và JDK 17. Muốn build APK thì cần thêm Android SDK 35 / build-tools 35.0.1.

```bash
npm ci
npm test                 # toàn bộ test
npm run test:e2e         # end-to-end trên Chromium (lần đầu: npx playwright install chromium)
npx wrangler dev --local # chạy Worker + D1 local; cần file .dev.vars (xem .dev.vars.example)
```

- `public/staff/` là bản gốc của giao diện nhân viên. Sau khi sửa, chạy `npm run sync:android` để chép sang `android/app/src/main/assets/staff/`. CI sẽ báo lỗi nếu hai bản lệch nhau.
- Trong APK, mọi lệnh gọi API đều đi qua `MainActivity.cloudApi()`, không dùng `fetch()`. Có thêm đường dẫn API mới thì phải để nó lọt qua bộ lọc đường dẫn trong file đó. Test `tests/phattai-v170-native-transport.test.mjs` kiểm tra tự động điều này.
- Deploy tay khi GitHub không chạy được: đăng nhập `npx wrangler login`, rồi chạy `npm run deploy:remote`. Lệnh này cũng backup D1 trước khi migrate.

## Tài liệu

- [Cài app lần đầu trên SUNMI, cập nhật và checklist nghiệm thu](docs/CAI_DAT_SUNMI.md)
- [Hợp đồng đồng bộ đơn / bếp / thanh toán](docs/POS_SYNC_CONTRACT.md)
- [In tại quầy và máy in bếp](docs/IN_QUAY_XPRINTER.md)
- [Cấu hình AVD mô phỏng SUNMI V2s](docs/SUNMI_AVD_SETUP.md)

## Luồng nghiệp vụ đã chốt

- Một mã QR chung: `/qr/`. Khách phải chọn bàn trước khi gọi món.
- Chốt order là lưu vào D1 ngay và tạo phiếu bếp. Thanh toán làm sau, chỉ nhân viên xác nhận; khách không tự báo đã trả.
- Phiếu bếp đi theo cơ chế pull/claim để không in trùng. Thanh toán, tách bill hay gộp bill đều không in lại phiếu bếp.
- Cloudflare không gọi thẳng được máy in trong mạng LAN của quán. Phải có ít nhất một máy SUNMI hoặc POS quầy đang mở và đăng nhập thì phiếu bếp mới tự in.
