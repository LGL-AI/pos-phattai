# TEST REPORT — PHÁT TÀI Order First / Pay Later v1.5.0

Ngày kiểm thử: 2026-09-28.

## Automated result

`npm test`: **5/5 PASS**.

1. PHÁT TÀI D1/catalog tách Echo: PASS.
2. Customer chọn bàn → tạo order `ACCEPTED/UNPAID` → kitchen job sinh ngay: PASS.
3. T07 → kitchen job có trước payment → Staff claim trước payment → BANK → `...-CK` → không sinh kitchen job thứ hai: PASS.
4. CASH → `...-TM`, lưu tiền nhận và tiền thối → không sinh kitchen job thứ hai: PASS.
5. UI contract: customer bắt chọn bàn, không có customer payment/report flow; Staff có đối chiếu bàn, chọn CASH/BANK, VietQR chỉ trong Staff, auto kitchen polling: PASS.

`node --check public/assets/app.js`: PASS.  
`node --check public/staff/staff.js`: PASS.

## Security/isolation scan

Runtime PHÁT TÀI không chứa `pos-unified`, `pos_unified`, `Echo Coffee`, `echo-coffee`, `EC_*`.

Customer response không expose `bankPayment`; bank QR chỉ có trong authenticated Staff API/UI.

## Chưa được xác nhận trên hardware thật trong lần build này

- Cài source Android v1.5.0 build mới trên SUNMI V2s.
- In giấy thật KV804/LAN sau order QR.
- In receipt thật bằng SUNMI printer SDK sau CASH/BANK.
- Wi-Fi/4G + LAN split routing tại cửa hàng.
- Paper-out, printer offline, app background/foreground, reboot.

Các mục trên phải được UAT tại PHÁT TÀI trước production.

## APK UAT hotfix đi kèm

Do môi trường hiện tại không còn Android SDK 35/build-tools, source Android `versionCode=150 / versionName=1.5.0` chưa được compile thành binary mới trong lượt này.

Để UAT flow trên SUNMI ngay, release có APK hotfix từ binary PHÁT TÀI Online v1.3.0 đã cài được trước đây:

`LotusPOS_PhatTai_Handheld_v1.3.0_ORDER_FIRST_HOTFIX_UAT.apk`

- Package vẫn là `vn.lotusai.pos.phattaiapp`.
- Endpoint vẫn là `https://pos-phattai.lgl247-ai.workers.dev`.
- Asset Staff trong APK khớp SHA-256 với source Staff đã test.
- APK ký lại bằng đúng UAT certificate `CN=Lotus POS PHAT TAI UAT, O=LotusAI, C=VN`.
- `jarsigner -verify`: `jar verified`.
- Đây là UAT hotfix, không phải production release-signing build v1.5.0.
