# In tại PHÁT TÀI — flow v1.5.0

## Trigger

- Phiếu bếp: **ngay sau khi chốt order thành công**, không chờ thanh toán.
- Hóa đơn: sau khi nhân viên xác nhận PAID.
- Két tiền: chỉ khi nhân viên xác nhận CASH và thiết bị/cầu in hỗ trợ.

## Máy bếp LAN

D1 tạo `pos_kitchen_jobs` ngay cùng flow order. SUNMI hoặc print bridge đang online poll queue khoảng 3 giây/lần, claim job rồi gửi ESC/POS tới IP LAN đã cấu hình.

Cloudflare Worker không truy cập trực tiếp IP nội bộ của máy in. Nếu thiết bị in tại quán offline/mất Wi-Fi LAN, job vẫn giữ trên D1 để xử lý sau; không được tự giả định là đã in.

## Chống in trùng

Backend claim job trước khi gửi. Native lưu payload/status theo job ID. Nếu trạng thái là `SENT`, `SENDING`, `UNKNOWN` hoặc `CONFIRMED`, native chặn tự gửi lại và yêu cầu kiểm tra giấy trước khi reprint.

## Thanh toán

Payment callback chỉ in receipt/két tương ứng; không gọi lại kitchen print.
