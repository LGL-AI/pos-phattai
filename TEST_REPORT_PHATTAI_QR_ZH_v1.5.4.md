# PHÁT TÀI QR UI — Chinese Customer Update v1.5.4

## Scope
Customer-facing QR ordering UI only. No D1 schema migration.

## Changes
- Chinese copy audited and rewritten for the actual pay-later workflow.
- Vietnamese remains above Chinese; Chinese is no longer rendered smaller/faded.
- Product Chinese names use the same base size as Vietnamese names.
- Search, voucher, order-note and item-note placeholders are bilingual.
- Member profile, loyalty, password change and error messages are bilingual.
- Tax/payment/kitchen confirmation text is bilingual.
- Cart modifier labels now retain Chinese option names.
- PWA metadata is Chinese-customer oriented (`zh-CN`).
- Worker/service-worker version bumped to `2.6.0-phattai.6`.

## Test results
- Existing QA/business regression: 126/126 PASS.
- QR Chinese-specific suite: 50/50 PASS.
- Combined suite: 176/176 PASS.
- JS runtime smoke: PASS (table picker → T03 → open product modifier modal; no ReferenceError/undefined UI leakage).

## Important flow retained
Customer QR: choose table → choose items/modifiers → confirm order → D1 order + kitchen job → pay later with staff handheld POS.
The QR UI does not confirm payment itself.
