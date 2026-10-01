# Lotus POS Phát Tài — v1.6.3

Worker source `2.7.0-phattai.3`; Android `1.6.3` / `163`. Source revision
`APP_UPDATE_RELEASE_GUARD_2026-09-30`. Package mặc định `vn.lotusai.pos.phattaiapp`.

Bản này bổ sung updater Android + UI VN/ZH + endpoint Worker + công cụ phát hành
APK ký đúng certificate. Đã tìm lại đúng khóa production và ký APK v1.6.3; catalog chứa bản production
đã kiểm chữ ký. Chưa deploy production, chưa UAT cài trên SUNMI. Không dùng các APK `_UNSIGNED`
để cài tại quán.

Bản được gửi lại trong lần “làm tiếp” trước có SHA-256
`7bf5df957bf31785ab7fd97c97d2b2381bdb0ef2c3a368ec62f9d18564f33bf3` và không
được sửa thêm ở lần đó. Đây là bản có thay đổi mã nguồn thật, version mới và
đối chiếu file riêng.

- [Manifest của đúng bản hiện tại](RELEASE_MANIFEST_v1.6.3.json)
- [Báo cáo sửa và bàn giao](FIX_AND_DELIVERY_REPORT_v1.6.3.md)
- [Build, phát hành và sử dụng updater](docs/ANDROID_UPDATE_v163.md)
- [Profile SUNMI để tạo AVD trong Android Studio](docs/SUNMI_AVD_SETUP.md)
- [Hash trước/sau từng file](DELIVERY_COMPARISON_v1.6.2_to_v1.6.3.json)

Cần Node 22+, JDK 17, Android SDK API 35 / build-tools 35.0.1. `npm ci`, rồi
`npm test` chạy toàn bộ regression; `npm run release:gate` sync và kiểm assets,
catalog release cùng regression. Android Studio mở thư mục `android`; có Gradle
wrapper 8.9 với checksum distribution pin.

Build release mặc định cần keystore gốc. Local unsigned: `bash android/build-local.sh
--unsigned`; Gradle unsigned proof: đặt `LOTUS_UNSIGNED_BUILD=1` trước
`./gradlew assembleRelease`. Đây chỉ là kiểm compile/binary.

Deploy từ máy đã đăng nhập Cloudflare bằng `DEPLOY_CLOUDFLARE_V163.cmd` / `.sh`
hoặc `npm run deploy:remote`. Pipeline backup D1, kiểm migration 0018, deploy và
xác minh remote. Toàn bộ flow đơn trước, thanh toán sau và hàng đợi in được giữ.

Các manifest/report/log của v1.6.2 ở `history/v1.6.2`; không dùng chúng để xác
định trạng thái bản này. `CURRENT_RELEASE.json` trỏ đúng manifest v1.6.3.
