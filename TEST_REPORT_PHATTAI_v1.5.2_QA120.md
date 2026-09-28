# PHÁT TÀI v1.5.2 — QA 120 Case Report

Ngày kiểm thử: 2026-09-28

## Kết quả tổng quan

- **Nhóm A — 60 case cho riêng các thay đổi/fix v1.5.2:** **60/60 PASS**.
- **Nhóm B — 60 case nghiệp vụ xuyên Customer QR + Staff/SUNMI:** **60/60 PASS**.
- **Tổng yêu cầu:** **120/120 PASS**.
- Bộ regression cũ 6 case chạy lại riêng: **6/6 PASS** (không tính vào 120 case yêu cầu).

## Phạm vi kiểm thử

Nhóm A tập trung vào các chức năng mới của v1.5.2: OWNER/huang, báo cáo ngày, store/bank config, account/role/voucher admin, cấu hình IP/cổng máy in bếp, test/diagnostics SUNMI, native bridge, và fix tách RECEIPT khỏi KITCHEN sau thanh toán.

Nhóm B tập trung vào nghiệp vụ hai UI: Customer QR chọn bàn/gọi món và Staff/SUNMI đối chiếu đơn, kitchen queue, CASH/BANK, append/cancel, split bill, quyền tài khoản, idempotency và token truy cập.

## Phương pháp

- API/D1 được chạy với schema migration hiện tại trên SQLite in-memory adapter tương thích Worker D1.
- UI được kiểm bằng source contract trực tiếp trên `public/assets/app.js` và `public/staff/staff.js`.
- APK UAT được kiểm trực tiếp: giải nén `assets/staff/staff.js`, so SHA-256 với Staff UI source, và kiểm DEX có các native bridge cần thiết.
- Không giả lập kết quả giấy in vật lý. Kiểm tra máy SUNMI/KV804 thật vẫn là UAT tại cửa hàng.

## Điểm quan trọng đã được xác nhận

- Customer chốt order tạo đúng **1 kitchen job** ngay khi order còn `UNPAID`.
- BANK/CASH payment **không tạo thêm kitchen job**.
- Order đã `PAID` bị loại khỏi auto-kitchen queue; stale `PENDING` job cũng không claim/update được sau payment.
- Staff UI gọi `printReceipt(...)` sau payment; native `printReceipt` dùng loại `RECEIPT`, còn `printKitchen` dùng `LanKitchenPrinter` riêng.
- OWNER-only được enforce ở cả UI và backend cho report/store/accounts/roles/vouchers; hardware actions yêu cầu native APK và re-check identity.
- APK chứa đúng Staff UI v1.5.2 đang test.

## Giới hạn cần UAT vật lý

Các case tự động chứng minh logic, API, UI contract và native bridge. Chúng **không chứng minh giấy thật đã chạy**. Tại PHÁT TÀI vẫn cần xác nhận trên thiết bị thật: kết nối SUNMI printer service, IP/port KV804, paper-out, mất LAN, reconnect, phiếu bếp thực tế, hóa đơn SUNMI thực tế, và báo cáo ngày thực tế.

## Artifact fingerprints

- APK QA SHA-256: `9a7450698e2f965779cfbedc6f4d05fb01ea7c8378569a8f8406a6e852a5fea2`
- QA120 test SHA-256: `4e2ab3b3d343d40886dd70e3e70c692671c20b130b3622f7ecce825614b051b0`

## Danh sách 120 case

- **A01** — huang authenticates as OWNER — `API/D1 business simulation` — **PASS**
- **A02** — OWNER can load daily report — `API/D1 business simulation` — **PASS**
- **A03** — cashier is blocked from daily report — `API/D1 business simulation` — **PASS**
- **A04** — OWNER can load analytics report — `API/D1 business simulation` — **PASS**
- **A05** — manager is blocked from analytics report — `API/D1 business simulation` — **PASS**
- **A06** — OWNER can read store/bank configuration — `API/D1 business simulation` — **PASS**
- **A07** — non-owner cannot read store/bank configuration — `API/D1 business simulation` — **PASS**
- **A08** — store update rejects tableCount 0 — `API/D1 business simulation` — **PASS**
- **A09** — store update detects stale version — `API/D1 business simulation` — **PASS**
- **A10** — OWNER can list roles — `API/D1 business simulation` — **PASS**
- **A11** — cashier cannot list roles — `API/D1 business simulation` — **PASS**
- **A12** — OWNER can list staff accounts — `API/D1 business simulation` — **PASS**
- **A13** — manager cannot list staff accounts — `API/D1 business simulation` — **PASS**
- **A14** — OWNER can list voucher administration — `API/D1 business simulation` — **PASS**
- **A15** — manager cannot access voucher administration — `API/D1 business simulation` — **PASS**
- **A16** — OWNER can create a CASHIER account — `API/D1 business simulation` — **PASS**
- **A17** — OWNER cannot create second OWNER account through staff API — `API/D1 business simulation` — **PASS**
- **A18** — OWNER system role is protected from role edits — `API/D1 business simulation` — **PASS**
- **A19** — staff handheld navigation includes Owner daily report entry — `Source/UI/native contract` — **PASS**
- **A20** — staff handheld navigation includes Owner store management entry — `Source/UI/native contract` — **PASS**
- **A21** — staff handheld navigation includes Owner account and permissions entry — `Source/UI/native contract` — **PASS**
- **A22** — owner admin settings label is rendered on handheld — `Source/UI/native contract` — **PASS**
- **A23** — CSV daily report action exists — `Source/UI/native contract` — **PASS**
- **A24** — SUNMI daily report print action is owner-gated — `Source/UI/native contract` — **PASS**
- **A25** — SUNMI daily report print requires native bridge — `Source/UI/native contract` — **PASS**
- **A26** — hardware settings actions re-fetch current staff identity — `Source/UI/native contract` — **PASS**
- **A27** — hardware settings actions enforce OWNER at UI layer — `Source/UI/native contract` — **PASS**
- **A28** — hardware settings actions enforce APK/native environment — `Source/UI/native contract` — **PASS**
- **A29** — kitchen configuration action calls native.openKitchenSettings — `Source/UI/native contract` — **PASS**
- **A30** — kitchen jobs action calls native.openKitchenJobs — `Source/UI/native contract` — **PASS**
- **A31** — device diagnostics action calls native.openDiagnostics — `Source/UI/native contract` — **PASS**
- **A32** — SUNMI printer check action calls native.checkPrinter — `Source/UI/native contract` — **PASS**
- **A33** — SUNMI reconnect action calls native.reconnectPrinter — `Source/UI/native contract` — **PASS**
- **A34** — Android connectivity screen exposes kitchen printer IP input — `Source/UI/native contract` — **PASS**
- **A35** — Android connectivity screen exposes numeric kitchen printer port — `Source/UI/native contract` — **PASS**
- **A36** — Android connectivity screen persists kitchen LAN settings — `Source/UI/native contract` — **PASS**
- **A37** — Android connectivity screen exposes kitchen test print/settings — `Source/UI/native contract` — **PASS**
- **A38** — Android connectivity screen exposes SUNMI diagnostics — `Source/UI/native contract` — **PASS**
- **A39** — Diagnostics activity binds SUNMI printer service — `Source/UI/native contract` — **PASS**
- **A40** — Diagnostics activity reads current printer state — `Source/UI/native contract` — **PASS**
- **A41** — native receipt bridge submits RECEIPT type — `Source/UI/native contract` — **PASS**
- **A42** — native kitchen bridge is separate LAN path — `Source/UI/native contract` — **PASS**
- **A43** — native daily report print bridge exists — `Source/UI/native contract` — **PASS**
- **A44** — customer order commit creates exactly one kitchen job immediately — `API/D1 business simulation` — **PASS**
- **A45** — unpaid order is visible in automatic kitchen queue — `API/D1 business simulation` — **PASS**
- **A46** — kitchen job can be claimed before payment — `API/D1 business simulation` — **PASS**
- **A47** — BANK payment does not create a second kitchen job — `API/D1 business simulation` — **PASS**
- **A48** — CASH payment does not create a second kitchen job — `API/D1 business simulation` — **PASS**
- **A49** — paid order disappears from automatic kitchen queue — `API/D1 business simulation` — **PASS**
- **A50** — stale PENDING kitchen job cannot be claimed after payment — `API/D1 business simulation` — **PASS**
- **A51** — stale paid kitchen job status cannot be advanced after payment — `API/D1 business simulation` — **PASS**
- **A52** — BANK payment finalizes order code with CK — `API/D1 business simulation` — **PASS**
- **A53** — CASH payment finalizes order code with TM — `API/D1 business simulation` — **PASS**
- **A54** — CASH payment records correct change — `API/D1 business simulation` — **PASS**
- **A55** — staff payment success invokes receipt bridge — `Source/UI/native contract` — **PASS**
- **A56** — staff payment success message states kitchen is not reprinted — `Source/UI/native contract` — **PASS**
- **A57** — paid kitchen card removes normal kitchen print action — `Source/UI/native contract` — **PASS**
- **A58** — APK embeds the exact v1.5.2 Staff UI asset — `APK artifact/static contract` — **PASS**
- **A59** — APK DEX contains separate receipt, kitchen and owner hardware bridge methods — `APK artifact/static contract` — **PASS**
- **A60** — PHAT TAI Android package is isolated from offline handheld package — `APK artifact/static contract` — **PASS**
- **B01** — catalog exposes exactly 13 active PHAT TAI menu items — `API/D1 business simulation` — **PASS**
- **B02** — customer UI starts with table picker requirement — `Source/UI/native contract` — **PASS**
- **B03** — valid T01 order is accepted — `API/D1 business simulation` — **PASS**
- **B04** — valid T99 order is accepted at configured table limit — `API/D1 business simulation` — **PASS**
- **B05** — table above configured limit is rejected — `API/D1 business simulation` — **PASS**
- **B06** — malformed table is rejected — `API/D1 business simulation` — **PASS**
- **B07** — TAKEAWAY order remains supported — `API/D1 business simulation` — **PASS**
- **B08** — empty customer cart is rejected — `API/D1 business simulation` — **PASS**
- **B09** — more than 30 cart lines are rejected — `API/D1 business simulation` — **PASS**
- **B10** — quantity over 30 on one line is rejected — `API/D1 business simulation` — **PASS**
- **B11** — total units over 60 are rejected — `API/D1 business simulation` — **PASS**
- **B12** — invalid size option is rejected — `API/D1 business simulation` — **PASS**
- **B13** — invalid spicy option is rejected — `API/D1 business simulation` — **PASS**
- **B14** — inactive menu product cannot be ordered — `API/D1 business simulation` — **PASS**
- **B15** — customer order is created UNPAID — `API/D1 business simulation` — **PASS**
- **B16** — customer response never exposes bank payment QR — `API/D1 business simulation` — **PASS**
- **B17** — customer order code is base format before payment — `API/D1 business simulation` — **PASS**
- **B18** — same idempotency key returns same order without duplicate — `API/D1 business simulation` — **PASS**
- **B19** — reusing idempotency key with different cart is rejected — `API/D1 business simulation` — **PASS**
- **B20** — customer can read own order using order token — `API/D1 business simulation` — **PASS**
- **B21** — wrong customer order token is denied — `API/D1 business simulation` — **PASS**
- **B22** — customer can request staff service for an open order — `API/D1 business simulation` — **PASS**
- **B23** — service request is idempotent while pending — `API/D1 business simulation` — **PASS**
- **B24** — staff order list contains QR-created order — `API/D1 business simulation` — **PASS**
- **B25** — staff order detail contains table, items and total for reconciliation — `API/D1 business simulation` — **PASS**
- **B26** — staff order detail exposes bank QR only to authenticated staff — `API/D1 business simulation` — **PASS**
- **B27** — unauthenticated caller cannot access staff order detail — `API/D1 business simulation` — **PASS**
- **B28** — cashier role can view orders — `API/D1 business simulation` — **PASS**
- **B29** — kitchen role cannot confirm payment — `API/D1 business simulation` — **PASS**
- **B30** — cashier can confirm CASH payment — `API/D1 business simulation` — **PASS**
- **B31** — cash payment below total is rejected — `API/D1 business simulation` — **PASS**
- **B32** — cash payment equal to total returns zero change — `API/D1 business simulation` — **PASS**
- **B33** — cash payment above total calculates positive change — `API/D1 business simulation` — **PASS**
- **B34** — BANK payment succeeds when bank configuration exists — `API/D1 business simulation` — **PASS**
- **B35** — BANK payment is blocked when bank configuration is missing on order snapshot — `API/D1 business simulation` — **PASS**
- **B36** — same order cannot be paid twice — `API/D1 business simulation` — **PASS**
- **B37** — stale order version is rejected at payment — `API/D1 business simulation` — **PASS**
- **B38** — customer cannot request service after order is paid — `API/D1 business simulation` — **PASS**
- **B39** — kitchen queue exposes table and order code before payment — `API/D1 business simulation` — **PASS**
- **B40** — kitchen job can transition CLAIMED -> SENT while unpaid — `API/D1 business simulation` — **PASS**
- **B41** — invalid kitchen job status is rejected — `API/D1 business simulation` — **PASS**
- **B42** — staff can append an item before payment — `API/D1 business simulation` — **PASS**
- **B43** — append increments kitchen revision and produces one delta ticket — `API/D1 business simulation` — **PASS**
- **B44** — staff can cancel one unit before payment with reason — `API/D1 business simulation` — **PASS**
- **B45** — cancel-unit without reason is rejected — `API/D1 business simulation` — **PASS**
- **B46** — staff can cancel entire unpaid order with reason — `API/D1 business simulation` — **PASS**
- **B47** — cancelled order leaves automatic kitchen queue — `API/D1 business simulation` — **PASS**
- **B48** — split bill conserves order total across two bills — `API/D1 business simulation` — **PASS**
- **B49** — invalid split that does not allocate all units is rejected — `API/D1 business simulation` — **PASS**
- **B50** — individual split bill can be paid CASH — `API/D1 business simulation` — **PASS**
- **B51** — individual split bill can be paid BANK — `API/D1 business simulation` — **PASS**
- **B52** — customer UI explicitly states payment is staff-handled — `Source/UI/native contract` — **PASS**
- **B53** — customer UI contains no payment-reported API path — `Source/UI/native contract` — **PASS**
- **B54** — customer UI order button copy says D1 + kitchen ticket immediately — `Source/UI/native contract` — **PASS**
- **B55** — staff UI requires table/order reconciliation before payment stage — `Source/UI/native contract` — **PASS**
- **B56** — staff UI exposes both CASH and BANK payment choices — `Source/UI/native contract` — **PASS**
- **B57** — staff UI shows bank QR only during staff payment flow — `Source/UI/native contract` — **PASS**
- **B58** — staff UI auto-polls kitchen jobs about every 3 seconds — `Source/UI/native contract` — **PASS**
- **B59** — APK contains the live Staff UI used by business payment flow — `APK artifact/static contract` — **PASS**
- **B60** — APK contains owner hardware/admin UI used during store operations — `APK artifact/static contract` — **PASS**
