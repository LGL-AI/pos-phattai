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
6. Lần đầu bấm cập nhật, Android sẽ hỏi quyền **"Cài ứng dụng không rõ nguồn"** cho Lotus POS. Bật lên rồi bấm quay lại: Android tự khởi động lại app, app báo *"Đã cho phép cài đặt; đang tiếp tục cập nhật"* và tự đi tiếp tới màn hình cài của Android. Các lần sau không hỏi nữa. Nên làm bước này ngay lúc bàn giao.

Bản offline cũ: dùng bản online song song ít nhất một ngày bán hàng. Khi đã ổn thì gỡ bản cũ (Cài đặt → Ứng dụng → app cũ → Gỡ cài đặt). Dữ liệu đơn của bản offline nằm trên chính máy đó và **không** chuyển sang bản online.

## 2. Cập nhật về sau (không cần đến quán)

- Mỗi khi code lên nhánh `main` và có thay đổi app, GitHub Actions tự build APK mới và đưa lên kênh cập nhật.
- App tự kiểm tra lúc mở lại và mỗi 15 phút một lần.
- Chủ tiệm vào **Quản trị chủ tiệm → Thiết bị & máy in → Cập nhật ứng dụng** → *Cập nhật ứng dụng* → Android hỏi xác nhận → *Cài đặt*.
- App chỉ cho cài khi giỏ món trống, không có thanh toán đang chờ và không có lệnh in đang chạy. Cấu hình IP máy in và phiên đăng nhập được giữ nguyên.
- Trước khi cài, app kiểm tra file tải về: đúng package, đúng khóa ký, version mới hơn, đúng SHA-256. Sai bất kỳ điều nào thì từ chối cài.
- Có bản mới thì dòng thông số ở đầu màn hình hiện `⬆ có bản …` (màu cam), không cần mở mục Cập nhật mới biết.
- Kiểm tra APK trên máy ảo Android 11 (giống SUNMI V2s): GitHub → Actions → **APK on Android emulator** → *Run workflow*. Chạy cài bản cũ rồi cập nhật lên bản mới nhất đã phát hành (chỉ đọc máy chủ thật), và một bản thử riêng chạy trọn luồng bán hàng, hội viên, báo cáo, mất mạng và tự cập nhật trên một máy chủ thử.

## 3. Báo cáo theo ca và theo nhân viên

Vào **Quản trị chủ tiệm → Báo cáo ngày & ca**, chọn **ngày**, rồi bấm một ô là ra báo cáo ngay:

- **Theo ca:** bấm *Cả ngày* hoặc một ca của quán. Mục *Tự chọn giờ (không bắt buộc)* bên dưới dùng khi cần xem một khoảng giờ bất kỳ.
- **Theo nhân viên:** hiện những người có làm trong ngày đó. Bấm vào tên là ra báo cáo cho đúng khoảng giờ người đó làm:
  - có **chấm công vào/ra** thì lấy giờ chấm công (đã tính các lần điều chỉnh chấm công); vào/ra nhiều lần trong ngày thì cộng các khoảng lại;
  - chưa chấm công ra thì tính tới hiện tại, tối đa 16 tiếng kể từ lúc vào;
  - không chấm công mà có **lịch ca** trong *Chấm công* thì lấy giờ theo lịch (ô hiện chữ "theo lịch").

Có báo cáo rồi thì bấm **In SUNMI** để in ra máy in trên SUNMI, hoặc **Tải CSV** để mở bằng Excel. Trên POS quầy (`/counter/`), nút in dùng máy in của máy tính.

**Khai báo ca (làm một lần):** mở mục *Danh sách ca của quán* → *+ Thêm ca* → nhập tên ca, giờ bắt đầu, giờ kết thúc → *Lưu danh sách ca*. Giờ kết thúc nhỏ hơn giờ bắt đầu (ví dụ 18:00–02:00) là ca qua đêm. Tối đa 12 ca. Sửa hay xóa ca không ảnh hưởng báo cáo cũ.

Doanh thu tính theo **thời điểm thanh toán** (giờ Việt Nam): đơn gọi trong ca này nhưng thanh toán ở ca sau thì tính cho ca sau. Hai nhân viên làm cùng giờ thì cùng thấy các đơn thanh toán trong giờ đó; báo cáo nhân viên là doanh thu **trong giờ người đó làm**, không phải doanh thu do riêng người đó thu.

## 4. Checklist nghiệm thu tại quán

Làm trên máy thật, đánh dấu từng mục:

**Bán hàng**
- [ ] Chọn bàn → chọn món (popup kích cỡ/độ cay mở nhanh) → Chốt đơn → phiếu bếp in ra **một lần**.
- [ ] Thêm món vào đơn đang mở → phiếu bếp chỉ in **món thêm**.
- [ ] Hủy 1 phần → bếp nhận phiếu HỦY.
- [ ] Thanh toán tiền mặt → hóa đơn in trên SUNMI, mã đơn đuôi `-TM`, phiếu bếp **không** in lại.
- [ ] Thanh toán chuyển khoản MB (QR) → chỉ xác nhận sau khi thấy tiền về → mã đuôi `-CK`.
- [ ] Tách bill 2 phần → thanh toán từng bill → đơn gốc đóng khi bill cuối trả xong.

- [ ] Khai báo 2 ca, chọn ngày hôm nay → bấm từng ca → In SUNMI. Tổng doanh thu các ca bằng báo cáo *Cả ngày* (nếu các ca phủ kín giờ bán trong ngày).
- [ ] Nhân viên chấm công vào → bán vài đơn → chấm công ra. Chọn ngày → *Theo nhân viên* → bấm tên → thấy đúng các đơn trong giờ đó → In SUNMI.

**Đồng bộ**
- [ ] Khách quét QR, chọn bàn, gọi món → đơn hiện trên SUNMI trong vài giây và phiếu bếp tự in.
- [ ] Hai máy (SUNMI + POS quầy) mở cùng một đơn; một máy thêm món, máy kia thấy ngay.
- [ ] Tắt Wi-Fi trên SUNMI → góc trên báo **"Chưa kết nối"**. Bật lại → tự về **"D1 trực tuyến"**, không phải mở lại app.

**Ổn định**
- [ ] Để app chạy suốt một ca. Không có lúc nào báo "Yêu cầu không hợp lệ", không bị văng ra màn hình đăng nhập.
- [ ] Bấm nút Home, mở app khác vài phút rồi quay lại → vẫn còn đăng nhập.
- [ ] Khởi động lại máy SUNMI → mở app → vẫn còn IP máy in bếp, vẫn đăng nhập (phiên đăng nhập có hạn 12 giờ).

## 5. Khi có sự cố

**Đọc dòng thông số ở đầu màn hình.** App SUNMI, POS quầy và trang QR của khách luôn có một dòng chữ nhỏ ghi máy đang chạy bản nào. Khi khách báo lỗi, bảo họ chụp màn hình gửi cho mình, nhìn dòng này trước:

| Mục | Ý nghĩa |
|---|---|
| `APK 1.7.18 (1018)` | Bản app cài trên SUNMI (chỉ có trên SUNMI). `APK cũ` = app chưa có bộ cập nhật; `Web quầy` = đang mở bằng trình duyệt. |
| `Server 2.11.2-…` | Bản Worker (máy chủ) đang trả lời. Khác với bản mình vừa đưa lên nghĩa là chưa deploy xong hoặc máy đang nói chuyện với nơi khác. |
| `Menu r47` | Số lần thực đơn đã đổi. Hai máy khác số này = một máy chưa cập nhật menu. |
| `RT ✓` | Kênh realtime. `…` đang nối, `✗` mất kết nối (máy chuyển sang hỏi định kỳ nên chậm hơn), `—` chưa đăng nhập. |
| `sync 12:43:44` | Lần gần nhất máy nhận được trả lời hợp lệ từ máy chủ (giờ Việt Nam). Số này đứng yên lâu = máy bị đơ hoặc mất mạng. |
| `giờ 12:43` | Giờ của chính máy (chỉ có trên SUNMI và quầy). |
| `⚠ máy lệch +5p` | Đồng hồ máy lệch hơn 1 phút so với máy chủ. Chỉnh lại giờ máy, vì ca và ngày bán hàng tính theo giờ. |
| `⬆ có bản 1.7.19` | Có app mới. Chủ tiệm vào Cập nhật ứng dụng để cài. |
| `⚠ sai khóa ký …` | APK trên máy không phải do kênh chính thức ký; cài lại từ link `/app`. |

Trang QR của khách chỉ có `Server`, `Menu`, `Mạng ✓/✗`, `bàn` và `sync` (một dòng mỏng trên cùng).

Dòng chuyển sang màu cam (trên SUNMI/quầy) hoặc nền đỏ (trang khách) khi có gì bất thường: mất realtime, mất mạng, đồng hồ lệch, có bản mới.

| Hiện tượng | Kiểm tra |
|---|---|
| "Chưa kết nối" kéo dài | Wi-Fi của máy. Sau đó mở `https://pos-phattai.lgl247-ai.workers.dev/api/health` trên trình duyệt; phải thấy `"ok":true`. |
| Phiếu bếp không in | Máy SUNMI và máy in bếp có cùng mạng LAN không. Vào **Nhật ký phiếu bếp LAN**: `FAILED` là chưa gửi được; `UNKNOWN` là có thể đã in, hỏi bếp trước khi in lại. |
| Không thấy bản cập nhật | Mở *Cập nhật ứng dụng*, bấm *Kiểm tra cập nhật*. Báo "Bản cài trên máy chưa khớp kênh cập nhật" nghĩa là máy đang chạy APK không phải do CI ký; cài lại từ link `/app`. |
| Cần cài lại từ đầu | Mở lại link `/app`. Cài đè bản cùng khóa không mất cấu hình. |
