# Cài app online lên máy SUNMI, cập nhật và nghiệm thu

App: **Lotus POS PHÁT TÀI** (`vn.lotusai.pos.phattaiapp`), ký bằng khóa có certificate SHA-256 `e66d9870…f484b4`.
Máy đang dùng **bản offline cũ** (app khác, package khác) sẽ không bị ghi đè. Hai app chạy song song cho tới khi gỡ bản cũ.

## 1. Cài lần đầu (chỉ làm một lần)

1. Nối máy SUNMI vào Wi-Fi của quán. Phải là **cùng mạng LAN với máy in bếp**; chỉ có Internet là chưa đủ.
2. Mở trình duyệt trên máy SUNMI, vào `https://pos-phattai.lgl247-ai.workers.dev/app`. File APK tự tải về.
3. Mở file vừa tải. Nếu Android hỏi, bật **"Cho phép cài từ nguồn này"** cho trình duyệt, rồi bấm **Cài đặt**.
4. Mở app **Lotus POS PHÁT TÀI**, đăng nhập bằng tài khoản `huang` (hoặc tài khoản nhân viên).
5. Vào **Quản trị chủ tiệm → Thiết bị & máy in**:
   - **IP / cổng máy in bếp + in thử**: nhập IP máy in bếp (cổng 9100), bấm *Lưu*, rồi *In thử*. Kiểm tra giấy ra đúng chữ Việt và chữ Hoa.
   - **Kiểm tra máy in SUNMI**: máy in hóa đơn gắn trên máy phải in được trang thử.
6. Lần đầu bấm cập nhật, Android sẽ hỏi quyền **"Cài ứng dụng không rõ nguồn"** cho Lotus POS. Bật lên một lần; các lần sau không hỏi nữa.

Bản offline cũ: dùng bản online song song ít nhất một ngày bán hàng. Khi đã ổn thì gỡ bản cũ (Cài đặt → Ứng dụng → app cũ → Gỡ cài đặt). Dữ liệu đơn của bản offline nằm trên chính máy đó và **không** chuyển sang bản online.

## 2. Cập nhật về sau (không cần đến quán)

- Mỗi khi code lên nhánh `main` và có thay đổi app, GitHub Actions tự build APK mới và đưa lên kênh cập nhật.
- App tự kiểm tra lúc mở lại và mỗi 15 phút một lần.
- Chủ tiệm vào **Quản trị chủ tiệm → Thiết bị & máy in → Cập nhật ứng dụng** → *Cập nhật ứng dụng* → Android hỏi xác nhận → *Cài đặt*.
- App chỉ cho cài khi giỏ món trống, không có thanh toán đang chờ và không có lệnh in đang chạy. Cấu hình IP máy in và phiên đăng nhập được giữ nguyên.
- Trước khi cài, app kiểm tra file tải về: đúng package, đúng khóa ký, version mới hơn, đúng SHA-256. Sai bất kỳ điều nào thì từ chối cài.

## 3. Báo cáo theo ca

Vào **Quản trị chủ tiệm → Báo cáo ngày & ca**:

1. **Khai báo ca một lần:** mở mục *Danh sách ca của quán* → *+ Thêm ca* → nhập tên ca, giờ bắt đầu, giờ kết thúc → *Lưu danh sách ca*. Nếu giờ kết thúc nhỏ hơn giờ bắt đầu (ví dụ 18:00–02:00), hệ thống hiểu là ca qua đêm và cộng doanh thu sang tới sáng hôm sau. Tối đa 12 ca. Sửa hoặc xóa ca bất cứ lúc nào; báo cáo cũ không bị ảnh hưởng.
2. **Chọn ngày** → **chọn ca** trong ô *Phạm vi báo cáo*. Có thể chọn *Cả ngày*, hoặc *Tự chọn giờ…* để xem một khoảng giờ bất kỳ.
3. Bấm **Xem báo cáo**, rồi **In SUNMI** để in ra máy in trên SUNMI, hoặc **Tải CSV** để mở bằng Excel. Trên POS quầy (`/counter/`), nút in dùng máy in của máy tính.

Doanh thu của ca tính theo **thời điểm thanh toán** (giờ Việt Nam): đơn chốt trong ca này nhưng thanh toán ở ca sau thì được tính cho ca sau. Nếu đã xếp lịch nhân viên cho ca có cùng tên và giờ trong *Chấm công*, báo cáo hiện thêm tên nhân viên của ca đó.

## 4. Checklist nghiệm thu tại quán

Làm trên máy thật, đánh dấu từng mục:

**Bán hàng**
- [ ] Chọn bàn → chọn món (popup kích cỡ/độ cay mở nhanh) → Chốt đơn → phiếu bếp in ra **một lần**.
- [ ] Thêm món vào đơn đang mở → phiếu bếp chỉ in **món thêm**.
- [ ] Hủy 1 phần → bếp nhận phiếu HỦY.
- [ ] Thanh toán tiền mặt → hóa đơn in trên SUNMI, mã đơn đuôi `-TM`, phiếu bếp **không** in lại.
- [ ] Thanh toán chuyển khoản MB (QR) → chỉ xác nhận sau khi thấy tiền về → mã đuôi `-CK`.
- [ ] Tách bill 2 phần → thanh toán từng bill → đơn gốc đóng khi bill cuối trả xong.

- [ ] Khai báo 2 ca, chọn ngày hôm nay → chọn từng ca → Xem → In SUNMI. Tổng doanh thu các ca bằng báo cáo *Cả ngày* (nếu các ca phủ kín giờ bán trong ngày).

**Đồng bộ**
- [ ] Khách quét QR, chọn bàn, gọi món → đơn hiện trên SUNMI trong vài giây và phiếu bếp tự in.
- [ ] Hai máy (SUNMI + POS quầy) mở cùng một đơn; một máy thêm món, máy kia thấy ngay.
- [ ] Tắt Wi-Fi trên SUNMI → góc trên báo **"Chưa kết nối"**. Bật lại → tự về **"D1 trực tuyến"**, không phải mở lại app.

**Ổn định**
- [ ] Để app chạy suốt một ca. Không có lúc nào báo "Yêu cầu không hợp lệ", không bị văng ra màn hình đăng nhập.
- [ ] Bấm nút Home, mở app khác vài phút rồi quay lại → vẫn còn đăng nhập.
- [ ] Khởi động lại máy SUNMI → mở app → vẫn còn IP máy in bếp, vẫn đăng nhập (phiên đăng nhập có hạn 12 giờ).

## 5. Khi có sự cố

| Hiện tượng | Kiểm tra |
|---|---|
| "Chưa kết nối" kéo dài | Wi-Fi của máy. Sau đó mở `https://pos-phattai.lgl247-ai.workers.dev/api/health` trên trình duyệt; phải thấy `"ok":true`. |
| Phiếu bếp không in | Máy SUNMI và máy in bếp có cùng mạng LAN không. Vào **Nhật ký phiếu bếp LAN**: `FAILED` là chưa gửi được; `UNKNOWN` là có thể đã in, hỏi bếp trước khi in lại. |
| Không thấy bản cập nhật | Mở *Cập nhật ứng dụng*, bấm *Kiểm tra cập nhật*. Báo "Bản cài trên máy chưa khớp kênh cập nhật" nghĩa là máy đang chạy APK không phải do CI ký; cài lại từ link `/app`. |
| Cần cài lại từ đầu | Mở lại link `/app`. Cài đè bản cùng khóa không mất cấu hình. |
