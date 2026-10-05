# Lotus POS Phát Tài — quy tắc làm việc trong repo

- Mọi lỗi phát hiện hoặc sửa (kể cả do người/AI khác sửa) phải thêm một dòng vào `docs/LotusPOS_BugList.xlsx` (sheet Bug List, ID `PT-xx` tăng dần) trong cùng đợt đẩy lên với bản sửa, điền đủ 15 cột: nguyên nhân gốc kỹ thuật, cách sửa, test chặn tái phạm (tên file + tên test), câu hỏi rà soát, hash commit thật. Thêm bằng `python3 scripts/add-bug.py docs/LotusPOS_BugList.xlsx '<json các dòng 15 cột>'` (giữ định dạng, dựng lại sheet Thống kê), rồi chạy recalc của skill xlsx để công thức có giá trị.
- Trước khi làm tính năng mới, đọc sheet "Checklist rà soát" trong file bug list. Lỗi sửa ở repo lotus-pos-saas (dòng `SAAS-xx`) phải đối chiếu với code ở đây.
- Chạy `npm test` trước khi commit; đổi giao diện nhân viên, routing, đăng nhập hay `wrangler.jsonc` thì chạy thêm `E2E_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e`.
- Sửa `public/staff/` thì chạy `npm run sync:android` và commit cả bản trong `android/app/src/main/assets/staff/`.
- Code chạy trên máy SUNMI (WebView Chromium 83) và iPhone cũ (iOS 15): không dùng API/CSS mới khi chưa có fallback.
- Cloudflare gói Free: CPU 10 ms/request (không PBKDF2), 100.000 request/ngày; Worker chỉ chạy cho các đường trong `run_worker_first`.
- Sau mỗi lần đẩy lên: theo dõi CI tới khi xanh (job release kiểm cả production). CI đỏ là việc sửa ngay.
