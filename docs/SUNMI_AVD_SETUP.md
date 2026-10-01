# SUNMI V2s trong Android Studio

V2s có nhiều lô/cấu hình. Tài liệu SUNMI năm 2023 ghi Android 11; datasheet
V2s hiện tại ghi Android 12 Go. Không suy ra Android trên SUNMI từ máy quầy iMin.
Đọc máy thật để chọn API đúng; dưới đây là profile cho biến thể RAM 2 GB/ROM 16 GB.

| Trường AVD | Giá trị |
|---|---|
| Tên | SUNMI_V2s |
| Loại | Phone, portrait |
| Kích thước màn hình | 5.5 inch |
| Resolution Width × Height | 720 × 1440 |
| RAM | 2048 MB |
| Internal storage | 16 GB |
| System image | Android 11/API 30 hoặc Android 12/API 31, theo máy thật |
| ABI trên Windows Intel/AMD | x86_64 |
| ABI trên Mac Apple Silicon | arm64-v8a |
| VM heap | 256 MB, giá trị khởi đầu cho AVD |
| Graphics | Automatic hoặc Hardware |
| Density | Đọc `wm density` của máy thật; 320 dpi chỉ là giá trị thử ban đầu |

CPU vật lý theo SUNMI là quad-core 2.0 GHz. CPU của emulator phụ thuộc máy host;
đặt giống số nhân không mô phỏng được hiệu năng SUNMI. Google APIs system image
có thể dùng để kiểm UI/WebView, khác hệ SUNMI OS trên thiết bị thật.

Trong Android Studio: **View → Tool Windows → Device Manager → + → Create Virtual
Device → New Hardware Profile**. Điền bảng, chọn system image đúng API, rồi Finish.

Khi cắm SUNMI bật USB debugging, chạy trong terminal:

```bash
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell wm size
adb shell wm density
adb shell getprop ro.product.cpu.abilist
```

Nếu AVD cần đổi density theo số đọc được, ví dụ máy thật báo 320:

```bash
adb -s emulator-5554 shell wm density 320
```

API của AVD theo Android máy thật; compile/target SDK 35 của dự án không bắt
buộc AVD cũng là Android 15. Có thể cài APK production đã ký v1.6.3 lên AVD.
Để thử cài đè/updater, bản thấp hơn phải có cùng package và certificate.

AVD kiểm được UI, mạng, quyền cài, downloader và màn hình installer Android.
Nó không có SUNMI printer service/phần cứng, nên in SUNMI, NFC và máy bếp LAN
vẫn cần kiểm thiết bị. Lần sửa này mới compile/kiểm binary và policy Java, chưa
chạy thử quá trình cài trên AVD/SUNMI.

Nguồn hãng: [V2s Android 11, SUNMI 2023](https://cdn.sunmi.com/public/generalfile/mgt_import/1a641c0ffbcb41efafb4112b776d6d3b.pdf),
[datasheet V2s hiện tại](https://file.cdn.sunmi.com/newebsite/products/v2s/stuff/V2s_EN_new.pdf).
Cách tạo AVD: [Android Developers](https://developer.android.com/studio/run/managing-avds).
