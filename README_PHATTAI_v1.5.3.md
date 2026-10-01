# Lotus POS PHÁT TÀI v1.5.3 — Staff UI / Payment / Bilingual Fix

Cloud Worker version: `2.6.0-phattai.5`.
D1 schema: unchanged, stays at 15/15 migrations.

## Fixes in this release

1. BANK payment UI no longer appears frozen after confirmation. The paid detail is refreshed immediately after D1 success and the receipt path remains separate from the kitchen-ticket path.
2. Restores the missing `refundForm()` renderer. Refund controls are collapsed and only appear for paid orders when the signed-in role has refund permission.
3. Dish selection always opens the styled modifier modal. PHÁT TÀI dishes show medium/large, spice level, additional modifier groups, and item notes in the same modal.
4. Handheld OWNER navigation is consolidated into one parent `Quản trị chủ tiệm / 店主管理`, with child tiles for menu/prices, vouchers, customers, accounts/permissions, daily report, store configuration, and devices/printers.
5. OWNER daily report includes `In báo cáo SUNMI / SUNMI 打印日报`; in the Android WebView it calls the existing native `printDailyReport` bridge.
6. Staff UI is bilingual VI/ZH with equal font sizing. Runtime prompts, confirms, toasts and Worker error messages are also bilingualized.

## Deployment

Upload the patch contents over the root of `LGL-AI/pos-phattai` on branch `main`.
Keep Cloudflare build settings:

- Build command: `None`
- Deploy command: `npm run deploy:remote`
- Root directory: `/`
- Branch: `main`

Expected `/api/health` version after deploy: `2.6.0-phattai.5`.

No D1 migration is added in this release. `deploy:remote` should report D1 current at 15/15 and deploy Worker/assets.

## QA

`npm run test:all`: 126/126 PASS in the prepared source package.

Physical UAT still required for actual paper output on SUNMI internal printer and KV804 LAN printer.
