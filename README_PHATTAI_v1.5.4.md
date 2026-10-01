# Lotus POS PHÁT TÀI v1.5.4 — QR Chinese Customer Update

Cloud Worker version: `2.6.0-phattai.6`

## Deploy
Keep Cloudflare build settings unchanged:

- Build command: `None`
- Deploy command: `npm run deploy:remote`
- Root directory: `/`
- Branch: `main`

No D1 migration is required. Existing D1 stays at 15/15 migrations.

## Customer QR changes
- Complete Simplified Chinese copy audit for actual order-first/pay-later flow.
- Vietnamese + Chinese remain together; Chinese now uses equal visual size/weight.
- Bilingual placeholders and member/voucher/password/error states.
- Chinese modifier names retained in cart.
- Chinese PWA metadata and runtime language.

## QA
- `npm run test:qrzh` → 50 QR Chinese cases.
- `npm run test:all` → 176 total cases.
- `node scripts/smoke-qr-ui.mjs` → runtime QR render smoke.
