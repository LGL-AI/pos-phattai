# PHÁT TÀI POS Sync Contract — v1.5.0

## Source of truth

Business data: Cloudflare Worker `pos-phattai` + D1 `pos_phattai`.

Local Android storage chỉ giữ device config, session cần thiết và trạng thái print/retry; không thay thế D1 làm database nghiệp vụ.

## Customer order

1. Customer mở `/qr/`.
2. UI yêu cầu chọn bàn.
3. `POST /api/orders` gửi `table`, items, note, voucher/member context và idempotency key.
4. Worker tính lại giá, lưu order `ACCEPTED / UNPAID`.
5. D1 trigger `pos_create_qr_kitchen` tạo đúng một kitchen job revision 1 ngay khi insert order thành công.
6. Customer response không chứa bank QR và không có API tự báo/confirm thanh toán.

## Kitchen print

Staff/SUNMI poll print queue. Job có thể được claim trước payment. Claim + device-side persistent status ngăn gửi trùng; trạng thái SENT/FAILED/UNKNOWN được sync lại D1 khi native trả event.

Append/cancel món tăng `kitchen_revision` và tạo delta job; payment không tạo kitchen job.

## Payment

Staff phải mở đúng order và đối chiếu table/order trước khi pay.

- `CASH`: backend cần `received >= total`, chốt code `-TM`.
- `BANK`: chỉ Staff UI nhận bankPayment/VietQR, chốt code `-CK` sau khi nhân viên xác nhận tiền đã vào.

Customer endpoint không được quyền đổi `payment_status` sang PAID.


## v1.6.2 revision hints

- `pos_sync_revisions` cập nhật trong cùng transaction với dữ liệu nghiệp vụ.
- `/api/staff/sync-meta` chỉ trả revision; quyền API vẫn được kiểm riêng.
- Staff chỉ tải lại phần đã thay đổi; full catalog dùng revision riêng.
- Realtime chỉ gửi invalidation scope, không gửi giỏ/order/khách hàng.
- Print queue vẫn pull mỗi 3 giây. Query `revision` trả `unchanged` để bỏ tải
  payload; một job vẫn phải claim trước khi gửi máy in.
- Append mới dùng idempotencyKey và receipt transaction trên D1. Replay kiểm
  trước trạng thái đóng/split để mất response không tạo thêm món/đơn mới.
- Client cũ không có key vẫn hoạt động qua nhánh tương thích. Bảo vệ retry append
  cần client v1.6.2 hoặc client gửi key ổn định.
