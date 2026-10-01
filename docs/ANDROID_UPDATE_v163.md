# Cập nhật ứng dụng SUNMI — v1.6.3

Package production: `vn.lotusai.pos.phattaiapp`. Version `1.6.3`, versionCode `163`.
Worker source: `2.7.0-phattai.3`. Migration mới nhất vẫn là 0018.

## Trạng thái bàn giao

Bộ cập nhật đã có source Android, màn hình VN/ZH, endpoint Worker và công cụ
phát hành APK đã ký. Đã khôi phục đúng khóa production từ `LotusPOS_PhatTai_v1.3.0_PRIVATE_UpdateKey.zip`
và ký APK v1.6.3 bằng certificate `9a3049…`. Catalog `src/android-releases.json`
chứa một bản production đã kiểm chữ ký/binary; các APK `_UNSIGNED` chỉ là bằng
chứng compile. Keystore và mật khẩu không nằm trong source này. Khóa legacy
`5ae9…` vẫn chưa được khôi phục.
Production quan sát được trong lần sửa này vẫn chạy `2.6.0-phattai.8`. Cloudflare
CLI của môi trường sửa chưa đăng nhập nên không có triển khai remote trong lần này.

## Cách hoạt động

1. App kiểm tra lúc trở lại foreground và mỗi 15 phút khi còn mở; dùng executor
   riêng, không chen vào hàng đợi in. Kiểm tra tự động gần nhau được gộp theo 5 phút.
2. App đọc package, versionCode và certificate của chính APK đang cài từ Android.
   Worker chỉ đưa bản có cùng package/certificate và versionCode lớn hơn, đúng API.
3. Trong **Thiết bị → Cập nhật ứng dụng**, chủ tiệm kiểm tra và bấm cập nhật.
   Màn hình không chặn thao tác bán hàng khi đang kiểm tra/tải.
4. App tải từ cùng Worker HTTPS, không theo redirect, giới hạn 25 MiB và timeout.
   File nằm trong cache riêng. Sau khi tải, kiểm byte count, SHA-256, package,
   versionCode, versionName và certificate đọc từ APK thật. File lỗi bị xóa.
5. Trước khi tải/cài và sau khi quay lại màn hình quyền, app kiểm lại quyền chủ
   tiệm, giỏ nháp, thanh toán/mutation chưa rõ kết quả và lệnh in đang chờ/chạy.
   Read-only polling không chặn cài. Các thao tác chưa hoàn tất phải xử lý trước.
6. Android 8+ có thể yêu cầu cho phép Lotus cài ứng dụng. App chuyển đến đúng
   trang quyền, rồi mở trình cài đặt Android với quyền đọc tạm cho đúng một APK.
   Người vận hành xác nhận cài. App không tự gỡ bản cũ và không gọi xóa dữ liệu.

Đây là tự kiểm tra và cập nhật qua trình cài Android, chưa có cài im lặng qua
device-owner/MDM. Máy cũ chưa có bộ cập nhật cần nhận bản bootstrap đã ký đúng
khóa một lần. Không thể thêm bộ cập nhật vào APK cũ chỉ bằng đổi Worker.

## Build bản phát hành thật

Cần Node 22+, JDK 17, Android SDK API 35 / build-tools 35.0.1 và keystore gốc.
`android/app-identity.json` pin package và certificate cho cả production/legacy.
Không đưa keystore hoặc mật khẩu lên repo. Mật khẩu nhập trên máy build.

```bash
export ANDROID_SDK_ROOT="/path/to/android-sdk"
export LOTUS_KEYSTORE="/path/to/original-release.jks"
export LOTUS_KEY_ALIAS="original-key-alias"
read -s -p "Keystore password: " LOTUS_KEYSTORE_PASSWORD
export LOTUS_KEYSTORE_PASSWORD
unset LOTUS_APP_ID LOTUS_ALLOW_ALT_APP_ID LOTUS_UNSIGNED_BUILD
bash android/build-local.sh
```

Gradle cũng đọc các biến signing này. Trong thư mục `android`, chạy `./gradlew
assembleRelease` (Windows: `gradlew.bat assembleRelease`). Android Studio Generate
Signed APK được kiểm bằng cùng verifier sau khi assemble. Gradle release mặc định
dừng nếu không có signing; compile unsigned phải chọn `LOTUS_UNSIGNED_BUILD=1`.

Chỉ khi thiết bị thật đang dùng legacy mới đặt **cả hai** biến:

```bash
export LOTUS_APP_ID="vn.lotusai.pos.handheld"
export LOTUS_ALLOW_ALT_APP_ID="1"
```

Keystore production có certificate SHA-256 `9a3049ab6b940be51cea4e22ba4d0ecc8a1d6490f0827d461b7a1f3c3ae860ae`.
Legacy có certificate `5ae9e233ab523408bd61d1e81e2de799227c9fbd3a88d8196226421ffc11368a`.
Tạo key khác không thể ký một bản cập nhật cài đè các app này. Nếu mất key gốc,
cần chọn phương án chuyển khóa/cài lại riêng sau khi bảo toàn cấu hình cục bộ.

## Đưa APK lên kênh cập nhật và deploy

Từ root source, với đúng profile còn được chọn:

```bash
npm run publish:android -- "/path/to/signed-v1.6.3.apk" --notes-vi "Sửa lỗi và thêm cập nhật ứng dụng" --notes-zh "修复问题并加入应用更新"
npm run verify:android:catalog
```

Công cụ đọc binary, kiểm chữ ký bằng apksigner và pin certificate, kiểm Staff
assets/bridge trước khi ghi catalog. APK unsigned hoặc sai signer bị từ chối
trước mutation. URL chứa package/versionCode/SHA-256; một versionCode đã phát
hành không được thay bằng bytes khác. Catalog và manifest lấy thông tin từ APK
đã kiểm, không chỉnh `signatureVerified` hoặc `signedApkProduced` bằng tay.

Đăng nhập Cloudflare trên máy triển khai rồi dùng pipeline có backup:

```bash
npx wrangler login
npm run deploy:remote
```

Pipeline chạy gate, xuất backup D1, kiểm lịch sử migration đúng prefix và áp các
migration còn thiếu trước deploy. Sau deploy, script kiểm health/version/migration
và đối chiếu endpoint cập nhật với catalog. Chỉ khi kiểm remote thành công mới ghi
`verification/REMOTE_DEPLOY_v1.6.3.json` và `productionDeployedThisSession=true`.
Môi trường bàn giao hiện thiếu auth nên các bước remote chưa chạy.

## UAT bắt buộc trước phát tán

Trên một máy thử có đúng package/certificate: cập nhật từ bản thấp hơn; hủy quyền
cài; hủy installer; mất mạng trong lúc tải; tải lỗi hash; nháp/giao dịch/in đang
chạy; khởi động lại sau update và kiểm IP máy in, phiên đăng nhập, queue và một đơn
thật. Chưa chạy các bước cài đặt trên Android/SUNMI thật trong lần sửa này.

Tham chiếu: [Android app signing](https://developer.android.com/studio/publish/app-signing),
[quyền cài ứng dụng](https://developer.android.com/reference/android/content/pm/PackageManager#canRequestPackageInstalls()),
[chia sẻ URI đọc tạm](https://developer.android.com/reference/androidx/core/content/FileProvider).
