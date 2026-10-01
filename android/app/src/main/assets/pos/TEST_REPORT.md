# Lotus POS v12.2.2 — Test Report

Generated: 2026-09-21T15:29:23.002Z

## Result

| Layer | Executed | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|---:|
| Logic/service | 142 | 142 | 0 | 0 |
| DOM integration | 53 | 53 | 0 | 0 |
| Real Chromium | 34 | 34 | 0 | 0 |
| Android mobile PWA | 23 | 23 | 0 | 0 |
| **Total automated** | **252** | **252** | **0** | — |

Automated acceptance result: **PASS — 252/252, 0 failures and 0 uncaught browser runtime errors.**

## Coverage

| Group | Automated | PASS | FAIL |
|---|---:|---:|---:|
| Android OCB handoff | 1 | 1 | 0 |
| Android QR PWA | 3 | 3 | 0 |
| Android QR checkout | 1 | 1 | 0 |
| Android QR payment | 5 | 5 | 0 |
| Android Staff PWA | 2 | 2 | 0 |
| Android Staff checkout | 1 | 1 | 0 |
| Android Staff payment | 2 | 2 | 0 |
| Android responsive | 6 | 6 | 0 |
| Android runtime | 1 | 1 | 0 |
| Bank config | 1 | 1 | 0 |
| Cart | 1 | 1 | 0 |
| Cash payment | 1 | 1 | 0 |
| Cross-device QR PWA | 1 | 1 | 0 |
| Customer Auth | 6 | 6 | 0 |
| Customer Data | 2 | 2 | 0 |
| DOM | 6 | 6 | 0 |
| Dashboard | 1 | 1 | 0 |
| Database | 1 | 1 | 0 |
| Handheld checkout | 12 | 12 | 0 |
| Idempotency | 1 | 1 | 0 |
| Inventory | 3 | 3 | 0 |
| License | 3 | 3 | 0 |
| License action | 1 | 1 | 0 |
| License scheduler | 2 | 2 | 0 |
| License scope | 1 | 1 | 0 |
| Loyalty | 5 | 5 | 0 |
| Mobile→Orders | 1 | 1 | 0 |
| Modifiers | 1 | 1 | 0 |
| OCB demo | 1 | 1 | 0 |
| OCB live QR | 1 | 1 | 0 |
| OCB payment | 1 | 1 | 0 |
| OCB simulator | 1 | 1 | 0 |
| Offline lease | 1 | 1 | 0 |
| Order | 6 | 6 | 0 |
| Order Code | 3 | 3 | 0 |
| Order→Production | 1 | 1 | 0 |
| POS→Second | 1 | 1 | 0 |
| PWA | 1 | 1 | 0 |
| Payment | 11 | 11 | 0 |
| Payment state | 1 | 1 | 0 |
| Payment status | 1 | 1 | 0 |
| Payment→Loyalty | 1 | 1 | 0 |
| Persistence | 1 | 1 | 0 |
| Product Data | 3 | 3 | 0 |
| Production | 3 | 3 | 0 |
| Products | 1 | 1 | 0 |
| QR checkout | 14 | 14 | 0 |
| QR→Orders | 1 | 1 | 0 |
| RBAC | 1 | 1 | 0 |
| Receipt | 1 | 1 | 0 |
| Recipe units | 1 | 1 | 0 |
| Roles | 2 | 2 | 0 |
| Routing | 1 | 1 | 0 |
| Shift | 3 | 3 | 0 |
| Synchronization | 1 | 1 | 0 |
| VietQR | 17 | 17 | 0 |
| Voucher | 7 | 7 | 0 |
| Voucher Data | 2 | 2 | 0 |
| Voucher Wallet | 3 | 3 | 0 |
| bilingual | 2 | 2 | 0 |
| desktop | 1 | 1 | 0 |
| inventory | 3 | 3 | 0 |
| license | 8 | 8 | 0 |
| navigation | 1 | 1 | 0 |
| orders | 1 | 1 | 0 |
| pos | 3 | 3 | 0 |
| product | 1 | 1 | 0 |
| pwa | 1 | 1 | 0 |
| pwa-offline | 1 | 1 | 0 |
| qr-cart | 1 | 1 | 0 |
| qr-checkout | 3 | 3 | 0 |
| qr-flow | 1 | 1 | 0 |
| qr-layout | 1 | 1 | 0 |
| qr-navigation | 1 | 1 | 0 |
| qr-payment | 12 | 12 | 0 |
| qr-routing | 1 | 1 | 0 |
| qr-runtime | 1 | 1 | 0 |
| qr-security | 1 | 1 | 0 |
| rbac | 3 | 3 | 0 |
| responsive | 20 | 20 | 0 |
| runtime | 4 | 4 | 0 |
| second-screen | 1 | 1 | 0 |
| settings | 4 | 4 | 0 |
| staff-checkout | 2 | 2 | 0 |
| staff-flow | 2 | 2 | 0 |
| staff-layout | 1 | 1 | 0 |
| staff-navigation | 1 | 1 | 0 |
| staff-payment | 4 | 4 | 0 |
| staff-runtime | 1 | 1 | 0 |

The suite covers desktop navigation and preserved modules, product categorization, member lookup/registration, vouchers, loyalty idempotency, order and production routing, recipe-based inventory reservation, warehouse receiving/adjustment/planning, bilingual VN/简体中文 UI, custom role permissions, license date boundaries, live OCB QR/deeplink payment states, order barcode + bank QR, offline behavior, service-worker registration and responsive layouts.

Real Chromium responsive checks ran at **320, 360, 375, 390, 430, 600 and 768 px**. Dedicated touch flows use **360×800 CSS px** as the neutral baseline and verify compact **320×568**, medium **390×844** and large **430×932** phone viewports. The assertion allows at most one pixel rounding difference between document width and viewport width.

## Critical user flows verified

1. Customer QR: table deep link → menu/category → modifier → cart → member/registration/guest → voucher → cash or bank → exact order payment request → order barcode + live OCB QR → OCB app handoff attempt → PENDING → CUSTOMER_REPORTED only.
2. Staff handheld: PIN login → menu → modifier/cart → member lookup/registration/guest → voucher → cash or bank → manual incoming-funds confirmation → one PAID receipt.
3. Counter POS: cart → member selection → order creation → second screen update → ingredient/product inventory deduction once → payment/receipt.
4. License: D−3, D, D+1/D+2 and D+3 04:59/05:00 boundaries; once-daily idempotency; delayed run; offline 10/11-day boundary; locked new-order scope; existing-order settlement and manual restore.

## Evidence

- Detailed results: `TEST_CASES.json` and `TEST_CASES.csv`.
- Raw result files: `test-results/logic-results.json`, `test-results/dom-results.json`, `test-results/browser-results.json`, `test-results/mobile-pwa-results.json`.
- Screenshots: `test-results/screenshots/qr-320.png`, `qr-390.png`, `qr-430.png`, `staff-390-paid.png`, `desktop-settings-1440.png`.
- Mobile flow screenshots: `test-results/mobile-audit/01-qr-menu-common-360x800.png` through `07-staff-paid-common-360x800.png`.

## Release boundary

This is a static browser POC. LocalStorage state is shared only inside the same browser profile. New orders use OCB account `609271`, beneficiary `HUANG TIANSHENG`, and may open an external OCB OMNI deeplink; the recipient must still be checked in the banking app. Opening the app or pressing “I transferred” never automatically marks the order PAID. A physical OCB transfer, bank-arrival reconciliation, SUNMI native hardware and backend synchronization remain outside this HTML-only test boundary. License controls are a local simulator, not secure RBAC or remote enforcement.
