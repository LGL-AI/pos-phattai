# Lotus POS PHÁT TÀI v1.5.6 — D1 / Android Bridge Hotfix

- Worker version: `2.6.0-phattai.8`.
- Android native bridge supports `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- JSON request body is forwarded for `POST`, `PUT`, `PATCH`; DELETE stays bodyless.
- `/api/staff/store` allows the same larger payload ceiling as Worker so owner logo/config updates are not blocked in APK.
- D1 schema/readiness probes are positively cached per D1 binding for 15 seconds to reduce repeated SELECTs from handheld polling.
- Non-JSON Worker errors show HTTP status and API path.
- No new migration; D1 remains 16/16.
- Android package remains `vn.lotusai.pos.phattaiapp`, preserving app SharedPreferences on in-place update, including LAN kitchen printer settings `lotus_kitchen_lan`.
