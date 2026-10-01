# PHÁT TÀI POS — Cross-flow Deep QA v1.5.5

Date: 2026-09-29 (UTC+7)
Runtime target: `2.6.0-phattai.7`
Database migrations: `0016` total (0001–0016)

## Result

- Existing QA + QR Chinese regression: 176/176 PASS
- New cross-flow deep QA: 79/79 PASS after fixes
- Combined final run: **255/255 PASS, 0 FAIL**

Final log: `TEST_ALL255_FINAL.log`

## Real defects found in the new cross-flow pass

### 1. MANAGER could not maintain menu/products

Expected business rule: MANAGER can add/edit menu items, prices and options.

Observed before fix: `/api/staff/products` returned 403 because the MANAGER system role never received `CATALOG_MANAGE`. The handheld navigation also did not expose menu/price management to managers.

Fix:
- Added migration `0016_manager_catalog_permission.sql` to add `CATALOG_MANAGE` to MANAGER only.
- Added handheld navigation entry `Món & giá / 菜品与价格` gated by `CATALOG_MANAGE`.
- Voucher administration remains OWNER-only.

### 2. Whole-order CANCEL kitchen ticket was created but could not auto-print

Observed before fix: cancellation generated a `CANCEL` row in `pos_kitchen_jobs`, but `/api/staff/paid-labels` excluded every cancelled order. Therefore the cancel slip was invisible to auto-print and could not be claimed.

Fix:
- Cancelled orders now expose **only** their `CANCEL` jobs to the automatic kitchen queue.
- Old `NEW`/`ADD` jobs from a cancelled order remain blocked from reprinting.
- `CANCEL` job can be claimed and advanced to `SENT` while the order remains UNPAID.

### 3. Cancelling the last unit had the same cancellation-print defect

Observed before fix: cancel-last-item correctly changed the order to cancelled and created a `CANCEL` job, but the queue hid it.

Fix: covered by the same queue/claim/status correction above.

## Cross-flow areas verified

### Roles and permissions
- OWNER retains full store/report/device/account access.
- MANAGER can manage orders, payment, kitchen, inventory, shifts, attendance, customers and now menu/products.
- MANAGER cannot administer vouchers or OWNER-only daily reports/store secrets.
- CASHIER can order/pay/print kitchen but cannot mutate inventory.
- KITCHEN cannot edit or pay orders.

### Kitchen / receipt print event matrix
- Customer QR order commit → exactly 1 `NEW` kitchen job.
- Staff order commit → exactly 1 `NEW` kitchen job.
- Append item → exactly 1 `ADD` delta kitchen job.
- Cancel one unit → exactly 1 `CANCEL` delta kitchen job.
- Cancel whole order / cancel final unit → old `NEW` is blocked; only `CANCEL` is printable.
- Split bill → no new kitchen print command.
- Merge bills → no new kitchen print command.
- CASH payment → no new kitchen job; receipt path only.
- BANK payment → no new kitchen job; receipt path only.
- Paid order → old kitchen job cannot be claimed/replayed.
- Native `printReceipt` and `printKitchen` remain separate Android paths.

### Split bill
- 3-way split preserves exact parent total.
- Partial bill payment keeps parent `SPLIT / UNPAID`.
- Last bill payment closes parent as `PAID`.
- Paid + unpaid bills cannot be merged.
- Split bank bills receive distinct payment references.

### Shift / attendance / overtime
- Manager can create future schedules; cashier cannot.
- Overlapping shifts are rejected; adjacent shifts are valid.
- Cashier sees own rota; manager sees team rota.
- Clock-in/out works; duplicate clock-in is rejected.
- Staff OT request and manager OT approval work.
- Swap requires recipient acceptance before manager approval.
- Approved swap updates the actual `pos_shift_schedules.staff_id` through the database trigger.
- Task assignment/completion path works.

Note: an approved OT request is an OT request record; it does not silently create/replace a normal scheduled shift. This is intentional separation of rota and overtime approval.

### Inventory isolation
- Selling an order does **not** mutate physical ledger stock (`pos_product_inventory.stock`).
- Sales affect estimate/consumption data only.
- Append/cancel correctly adjusts estimated consumption.
- Manual receipt/adjustment changes ledger/estimate but creates no order and no kitchen job.
- Negative estimated stock does not unexpectedly block ordering.

### Voucher lifecycle
- OWNER can create voucher; public listed voucher becomes visible.
- Percentage calculation and minimum-spend validation work.
- Applied voucher goes `HELD` on order and `REDEEMED` on payment.
- Cancelled order releases held voucher.
- Split order keeps voucher held until final payment.
- Existing order keeps frozen voucher terms if campaign configuration changes later.

### Customer display
- Cashier with order-edit permission can pair the display; kitchen role cannot.
- Draft cart total mirrors to display.
- Stale display revision does not overwrite newer state.
- Revoked display token becomes invalid.
- Paid order display no longer exposes transfer QR.

### UI/stuck guards
- Mutation path clears `busy` in `finally`.
- Live sync does not rerender while a form is actively being edited.
- Background sync preserves active new-order cart.
- Auto-print and live-sync have concurrency guards.
- QR modifier sheet is scrollable and bounded to viewport.
- Refund form exists and is only rendered for paid transactions.
- Customer QR has no customer-side payment-confirm action.
- VI/ZH equal-size formatting checks remain in place.

## Physical-device limits of this run

The automated run verifies source, API/D1 behavior, embedded APK bridge contracts, queue semantics and static UI guards. It **cannot prove physical paper output** from the actual SUNMI printer/KV804, camera/QR hardware, LAN packet delivery, cash drawer or second-screen panel without those devices attached.

A real Chromium interaction run for the v1.5.5 local build was also blocked by the execution environment's enterprise browser policy for localhost/file URLs. Therefore this report does **not** claim a new real-browser click-through for v1.5.5. Device UAT should still verify paper, network and touch behavior after deployment.
