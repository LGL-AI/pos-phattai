# Phát Tài v1.6.3 — sửa lỗi phát hành và bàn giao

Đã tạo APK production `1.6.3` / versionCode `163`, ký bằng đúng khóa gốc, bổ sung
updater Android và kênh APK trong Worker. Source Worker là `2.7.0-phattai.3`.
**Chưa deploy remote và chưa thử cài trên SUNMI/AVD.** Đây là trạng thái đã kiểm
chứng của bản bàn giao, không phải xác nhận rollout tại quán.

## Lỗi bàn giao được xác nhận

ZIP v1.6.2 được gửi lại trong lần tiếp tục trước có SHA-256
`7bf5df957bf31785ab7fd97c97d2b2381bdb0ef2c3a368ec62f9d18564f33bf3`, giống hệt
ZIP trước đó. Không có lần sửa mới nào nằm trong lần gửi lại ấy. Đó là lỗi bàn giao.

ZIP cũ đã đặt package mặc định đúng `vn.lotusai.pos.phattaiapp` và có 352 test,
nhưng chưa có updater, chưa tạo APK ký production, chưa deploy remote. Các vấn
đề này không được giải quyết bằng việc gửi lại chính ZIP ấy.

## Đối chiếu trạng thái

| Hạng mục | ZIP v1.6.2 cũ | Bản v1.6.3 này |
|---|---|---|
| Android | 1.6.2 / 162 | 1.6.3 / 163 |
| Worker source | 2.7.0-phattai.2 | 2.7.0-phattai.3 |
| Package mặc định | vn.lotusai.pos.phattaiapp | vn.lotusai.pos.phattaiapp |
| APK production ký đúng khóa | Chưa tạo | Đã tạo, verifier PASS |
| Gradle release thiếu signing | Có thể assemble unsigned | Dừng; unsigned phải chọn cờ proof rõ ràng |
| Phiên bản từ getAppInfo | Chuỗi cũ 1.5.2-cloud | Đọc PackageManager của APK đang cài |
| Updater native + màn hình VN/ZH | Chưa có | Đã thêm |
| Catalog APK ký hợp lệ | Chưa có | Một APK production 163 |
| Regression | 352/352 | 385/385 |
| Remote deploy / cài SUNMI | Chưa thực hiện | Chưa thực hiện |

`DELIVERY_COMPARISON_v1.6.2_to_v1.6.3.json` ghi hash trước/sau từng file được
thêm, sửa hoặc bỏ. `SHA256SUMS.txt` kiểm toàn bộ nội dung ZIP. Hash của ZIP cuối
nằm trong `PACKAGE_VERIFICATION_v1.6.3.json` bàn giao riêng để tránh tự tham chiếu.
`CURRENT_RELEASE.json` trỏ manifest/report hiện tại; bằng chứng v1.6.2 lưu trong
`history/v1.6.2`.

## Khóa ký gốc đã tìm lại được

Khóa production được khôi phục từ bản sao riêng
`LotusPOS_PhatTai_v1.3.0_PRIVATE_UpdateKey.zip`. Đã mở keystore và dùng private
key đó để ký APK mới; certificate SHA-256 khớp chính xác pin production:

`9a3049ab6b940be51cea4e22ba4d0ecc8a1d6490f0827d461b7a1f3c3ae860ae`

APK cuối: `LotusPOS_PhatTai_Production_v1.6.3_APP_UPDATE.apk`, 5,623,657 byte,
SHA-256 `2d7155b68f0c03a802b21b522772eed70da8b0a4375b6704d689496226f16795`.
Package `vn.lotusai.pos.phattaiapp`, launcher
`vn.lotusai.pos.phattaiapp.MainActivity`, minSdk 23. Chính bytes này nằm trong
asset cập nhật `public/releases/android/…/v163/…apk` và được ghi vào manifest.

Không cần tạo key mới cho production. Có thể tạo keystore mới để ký một app
mới, nhưng nó không tự thay được chữ ký của app cũ khi cài đè. Keystore/mật khẩu
gốc được bàn giao riêng và không nằm trong source ZIP. Khóa legacy
`vn.lotusai.pos.handheld` / certificate `5ae9…` chưa tìm lại được, nên không có
APK legacy đã ký trong lần bàn giao này. Không dùng APK production để cập nhật
một máy đang cài package legacy.

## Các sửa đổi chính

- `AppUpdater.java`, `UpdatePolicy.java`, `UpdateProvider.java`: kiểm tự động khi
  app trở lại foreground và mỗi 15 phút; coalescing 5 phút. Tải theo hành động
  của chủ tiệm và mở installer Android để xác nhận. Kiểm size, SHA-256,
  package, versionName/versionCode và certificate của file APK thật. HTTPS cùng
  Worker, không redirect, giới hạn 25 MiB, timeout; file tạm/cache riêng và
  content URI chỉ đọc. Lifecycle đóng connection/executor.
- `MainActivity.java`, `LanKitchenPrinter.java`, `public/staff/app-update.js`,
  `staff.js`: màn hình cập nhật VN/ZH; xác minh quyền chủ tiệm và kiểm lại giỏ
  nháp, giao dịch chưa rõ kết quả, mutation và lệnh in trước khi cài. Polling
  đọc không chặn cập nhật. Không gọi gỡ app hoặc xóa dữ liệu.
- `src/android-update.js`, `src/android-releases.json`, `src/worker.js`: endpoint
  `/api/android/update` chọn bản cùng package/certificate, versionCode cao hơn,
  tương thích SDK. Chỉ phục vụ APK nằm trong catalog đã kiểm; URL bất biến có
  package/versionCode/hash. Chưa có bản sẽ trả `NOT_PUBLISHED`, không báo giả
  rằng đã cập nhật mới nhất.
- Gradle/manual build và công cụ publish kiểm APK thật; từ chối unsigned, sai
  package hoặc sai signer trước phát hành. Legacy vẫn cần cả hai cờ opt-in.
  Manifest/template được kiểm với identity/catalog; claim deploy cần bằng
  chứng remote. Có Gradle wrapper 8.9 pin checksum và script deploy v1.6.3.

Các tối ưu v1.6.2 được giữ: sync theo revision, gộp request/backoff, realtime
scoped invalidation, append atomic/idempotent và hàng đợi in. Migration mới
nhất vẫn là `0018_sync_revisions_append_requests.sql`, tổng 18 migration.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả / bằng chứng |
|---|---|
| Regression toàn bộ | 385/385, `TEST_ALL385_v1.6.3.log` |
| Policy Java native | 28 case thực chạy trong regression, `tests/UpdatePolicyHarness.java` |
| Compile unsigned | Gradle/manual, production/legacy: cả 4 PASS; chỉ là proof binary |
| Build ký production | Gradle 8.9 và manual đều PASS; dùng APK Gradle làm release |
| Release lint/identity/assets | PASS trong `SIGNED_GRADLE_v1.6.3.log` |
| Từ chối phát hành không hợp lệ | 10/10; `verification/RELEASE_GUARD_RESULTS_v1.6.3.json` |
| Khóa production gốc | `verification/SIGNING_KEY_RECOVERY_v1.6.3.json` |
| workerd + D1 + Durable Object | PASS: 18 migration, updater AVAILABLE, tải APK thật và khớp checksum, order/append replay/rollback, queue revision, WebSocket |
| Worker build dry-run | PASS, `WORKER_BUILD_v1.6.3.log`; có APK trong assets |
| Remote rollout | Chưa chạy |
| Cài đè/installer/in trên SUNMI hoặc AVD | Chưa chạy |

Toolchain build: JDK 17, Android SDK API 35, build-tools 35.0.1. Các APK
`verification/unsigned-apks/*_UNSIGNED.apk` chỉ chứng minh compile/package và
provider authority của hai profile; không phải APK để triển khai tại quán.

## Phần còn thiếu và cách triển khai

Cloudflare CLI báo `NOT_AUTHENTICATED`, chưa có API token cấu hình. Health remote
đọc được trong lần sửa vẫn là `2.6.0-phattai.8`, D1 `ok`, nhận đơn `true`.
Manifest giữ `productionDeployedThisSession=false`, `rolloutComplete=false`.
Không có mutation DB hoặc Worker remote trong lần này.

Trên máy có quyền Cloudflare: `npm ci`, đăng nhập `npx wrangler login`, chạy
`npm run deploy:remote` hoặc script `DEPLOY_CLOUDFLARE_V163`. Pipeline chạy gate,
backup D1, kiểm lịch sử và áp migration còn thiếu, deploy Worker, sau đó kiểm
health/version/migration và updater. Chỉ khi remote check qua mới ghi proof và
đổi manifest thành đã deploy.

Bản app cũ chưa có updater cần nhận APK 163 đã ký gốc một lần qua installer.
Khi cùng package/certificate và versionCode cũ thấp hơn, Android có thể cập nhật
tại chỗ. Cần thử trên một máy đúng profile trước phát tán: giữ cấu hình IP máy
in, đăng nhập/queue; hủy quyền/cài; mất mạng; tải lỗi; giỏ/giao dịch/in đang chạy;
khởi động lại và một đơn thật. Chưa có bằng chứng thiết bị cho những bước này.

Hướng dẫn cụ thể: `docs/ANDROID_UPDATE_v163.md`.
Thông số AVD: `docs/SUNMI_AVD_SETUP.md` cho V2s 5.5 inch/720×1440/2 GB/16 GB;
Android 11/API 30 hoặc Android 12/API 31 phải đọc từ máy thật. Chưa xác nhận
model/OS máy SUNMI tại quán. AVD không thay thế kiểm phần cứng/máy in SUNMI.
