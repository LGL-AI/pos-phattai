# Lotus POS PHÁT TÀI · Order First / Pay Later · v1.5.0

Bản PHÁT TÀI tách riêng hoàn toàn khỏi Echo Coffee:

- Android package: `vn.lotusai.pos.phattaiapp`
- Worker: `pos-phattai`
- D1: `pos_phattai`
- Customer QR UI: `https://pos-phattai.lgl247-ai.workers.dev/qr/`
- Catalog mặc định: `PT001`–`PT013`

## Flow nghiệp vụ chính

```text
Khách quét QR chung
→ chọn bàn trên UI
→ chọn món
→ chốt order
→ Worker ghi order UNPAID vào D1
→ D1 đồng thời tạo kitchen job
→ SUNMI / print bridge lấy job và in phiếu bếp
→ khách dùng món
→ gọi nhân viên
→ nhân viên mở Đơn hàng trên SUNMI
→ đối chiếu bàn + món + tổng tiền
→ Thanh toán
   ├─ Tiền mặt → nhận tiền → xác nhận → mã ...-TM
   └─ Chuyển khoản → hiện VietQR trên SUNMI → kiểm tra tiền vào → xác nhận → mã ...-CK
→ D1 PAID
→ SUNMI in hóa đơn
```

Khách **không có chức năng thanh toán** trên QR UI. Thanh toán chỉ do nhân viên thực hiện trên POS cầm tay.

## Mã đơn

Khi khách vừa chốt món, phương thức thanh toán chưa biết nên mã nền là:

`DDMMYYYY-STT-MAKH`

Khi nhân viên xác nhận thanh toán, mã chính thức trở thành:

- Chuyển khoản: `DDMMYYYY-STT-MAKH-CK`
- Tiền mặt: `DDMMYYYY-STT-MAKH-TM`

Khách vãng lai dùng `MAKH=000000`; hội viên dùng mã ổn định dẫn xuất từ member ID hiện có.

Xem `README_PHATTAI_DEPLOY.md` và `TEST_REPORT_PHATTAI_ORDER_FIRST_v1.5.0.md`.
