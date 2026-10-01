# Ký APK Phát Tài v1.6.2

| Application ID | Signer SHA-256 bắt buộc |
|---|---|
| `vn.lotusai.pos.phattaiapp` (production mặc định) | `9a3049ab6b940be51cea4e22ba4d0ecc8a1d6490f0827d461b7a1f3c3ae860ae` |
| `vn.lotusai.pos.handheld` (legacy, cần opt-in riêng) | `5ae9e233ab523408bd61d1e81e2de799227c9fbd3a88d8196226421ffc11368a` |

Public signer của APK v1.6.1 nhận trong session đã được đọc từ certificate:
khớp `5ae9...`. SHA-256 file APK gốc là
`acdd2167eb51c3266375011e1df3aa4d479c2cb8a9a0c559d5c5969afd1ede0a`.
Certificate không chứa private key để ký bản mới.

Các file nhận được không có private keystore của hai profile. Chưa xác nhận
được backup keystore ở máy/vault của chủ dự án.

## Build ký từ máy có keystore gốc

Trong Git Bash/Linux, đặt đúng đường dẫn SDK, keystore và alias:

```bash
export ANDROID_SDK_ROOT="/path/to/android-sdk"
export LOTUS_APP_ID="vn.lotusai.pos.phattaiapp"
unset LOTUS_ALLOW_ALT_APP_ID
export LOTUS_KEYSTORE="/path/to/original-release.jks"
export LOTUS_KEY_ALIAS="original-key-alias"
read -s -p "Keystore password: " LOTUS_KEYSTORE_PASSWORD
export LOTUS_KEYSTORE_PASSWORD
bash android/build-local.sh
```

Mật khẩu khóa riêng, nếu khác mật khẩu keystore, đặt bằng `LOTUS_KEY_PASSWORD`.
Thông tin ký được nhập trên máy build; source không chứa mật khẩu hoặc keystore.
Build dừng nếu thiếu tool/key, test đỏ, signer sai hoặc APK chứa Staff UI lệch.
Build còn kiểm package/version/launcher đọc từ APK binary bằng AAPT2.

Chỉ khi thiết bị đích thực sự đang chạy package legacy, đổi profile có chủ đích:

```bash
export LOTUS_APP_ID="vn.lotusai.pos.handheld"
export LOTUS_ALLOW_ALT_APP_ID="1"
```

Chọn đúng keystore legacy có signer `5ae9...`; không dùng key production `9a304...`
cho package legacy. Sau lần build legacy, unset hai biến này để lần build sau
quay về production. Artifact production và legacy có tên riêng.

Kiểm package hiện có bằng màn hình Chẩn đoán (Package/version) hoặc:

```bash
adb shell pm list packages vn.lotusai.pos
```

Không tự gỡ app legacy chỉ từ suy luận về namespace. Đối chiếu package/signer
của thiết bị đích trước khi cập nhật để giữ local printer preferences.

## Build unsigned chỉ để kiểm binary

```bash
bash android/build-local.sh --unsigned
```

Chế độ này không cần private keystore, xuất file có hậu tố `_UNSIGNED.apk`.
Binary bằng chứng từ lần sửa này nằm ở `verification/unsigned-apks/`.
Đã kiểm cả Gradle `assembleRelease` và local build; chưa tạo release APK đã ký.
Trong Gradle, gate cho phép artifact chưa ký để kiểm compile/package, đồng thời
vẫn kiểm signer nếu artifact có chữ ký. CLI verifier mặc định yêu cầu đã ký.

Kết quả mong đợi: application ID đúng máy đang cài, versionCode 162,
versionName 1.6.2, certificate đúng profile. Package và signer khớp giúp giữ
local printer preferences khi cài đè.

## Backup và diễn tập phục hồi

1. Ghi nhận package, alias và fingerprint certificate cùng bản release.
2. Lưu keystore và mật khẩu vào nơi quản lý secret; có một bản backup độc lập.
3. Trên máy build riêng, dùng bản backup để ký artifact thử và đối chiếu
   fingerprint bằng `apksigner verify --print-certs`.
4. Giữ bản APK ký gốc đã triển khai và cấu hình IP máy in để kiểm UAT sau update.

Chỉ khi bước 3 thành công mới có bằng chứng rằng backup phục hồi được.
