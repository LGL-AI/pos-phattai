# Lotus POS PHÁT TÀI v1.5.6 — D1 / Android Bridge Hotfix

- Worker version: `2.6.0-phattai.8`.
- Android native bridge now supports `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- JSON request body is forwarded for `POST`, `PUT`, `PATCH`; DELETE remains bodyless.
- `/api/staff/store` accepts the same larger payload ceiling as Worker so owner logo/config updates are not blocked by the APK bridge.
- D1 schema/readiness probes are positively cached per D1 binding for 15 seconds to avoid repeated schema SELECTs on every poll while still re-checking frequently.
- Non-JSON Worker failures now show HTTP status + API path in the Staff UI.
- No new D1 migration. Existing migration level remains 16/16.
- Android package stays `vn.lotusai.pos.phattaiapp`; LAN kitchen printer preferences (`lotus_kitchen_lan`) and SUNMI/native printer setup remain unchanged across an in-place update.
