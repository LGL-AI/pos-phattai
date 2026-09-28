# PHÁT TÀI v1.5.2 — Owner Admin + Kitchen/Receipt Print Fix

Date: 2026-09-28

## Scope

- Restore owner (`huang` / cloud role `OWNER`) administration on SUNMI handheld.
- Keep customer QR flow order-first / pay-later.
- Ensure kitchen ticket is created/printed at order confirmation, not again at payment.
- Ensure successful staff payment invokes SUNMI receipt printing.

## Owner handheld functions

The owner portal exposes:

- Daily D1 report, CSV download and SUNMI report print.
- Product/menu management.
- Voucher management.
- Customer management.
- Accounts/roles management.
- Store/bank configuration.
- SUNMI printer status check and reconnect.
- Kitchen printer IP/port settings and test print.
- Kitchen local job/history view.
- Full Android hardware diagnostics.

Native admin actions (`printer_config`, `diagnostics`, `reports`, `accounts`, `vouchers`) require cloud role `OWNER` in the clean Android source. Backend account/role/voucher and daily/analytics report routes are also OWNER-only.

## Print lifecycle

1. Customer QR order is committed as `ACCEPTED / UNPAID`.
2. D1 creates exactly one kitchen job for the confirmed order/revision.
3. SUNMI/print bridge polls only UNPAID orders and sends that job to the LAN kitchen printer.
4. Staff later confirms CASH/BANK payment.
5. Payment updates order to `PAID` and never creates another kitchen job.
6. PAID orders are excluded from the automatic kitchen queue.
7. The handheld payment callback invokes native `printReceipt(...)`, whose native channel is `RECEIPT`; kitchen printing uses the separate `printKitchen(...)` path.

## Automated verification

`npm test`: 6/6 PASS.

Covered:

- PHÁT TÀI catalog isolation.
- QR order creates kitchen job immediately while UNPAID.
- BANK payment appends `-CK` without duplicate kitchen job; PAID order is removed from auto-kitchen queue and backend rejects any later kitchen claim.
- CASH payment appends `-TM` and records change.
- Customer UI has no payment flow.
- Owner admin visibility/authorization and separate native receipt/kitchen print paths.

JavaScript syntax checks for `public/staff/staff.js`, `src/staff.js`, `src/ops.js`, `src/management.js`, and `src/worker.js`: PASS.

## Device boundary

The APK hotfix embeds the tested Staff UI and uses the same PHÁT TÀI UAT certificate as the previous online APK. Physical SUNMI receipt paper and LAN kitchen paper still require on-device UAT at the shop.
