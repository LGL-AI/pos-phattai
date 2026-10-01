# Lotus POS PHÁT TÀI v1.6.1 — Order Recovery Hotfix

Fixes a handheld state race where an order selected for “Thêm món” could become PAID/SPLIT/CANCELLED before checkout confirmation. Previously the client blocked the cashier with “Đơn đã đóng hoặc đã tách; tạo đơn bổ sung riêng.”

## New behavior
- Re-read the latest order from Worker immediately before append.
- Retry once with latest version when optimistic version changes.
- If the original order is already closed/split/paid, preserve the cart and automatically create a separate supplementary order on the same table instead of blocking the cashier.
- Legacy full-POS handheld flow receives the same recovery behavior and clears stale `editOrderId`.
- No D1 migration is required.

Release versions: APK `1.6.1` / code `161`; Worker `2.7.0-phattai.1`.
