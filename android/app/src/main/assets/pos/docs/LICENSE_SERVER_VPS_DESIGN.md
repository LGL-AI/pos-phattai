# License Server trên VPS — thiết kế production dự kiến

Tài liệu này là thiết kế tương lai, không phải thành phần đã triển khai trong POC tĩnh. License và thanh toán khách hàng là hai miền tách biệt: OCB của cửa hàng nhận tiền bán hàng; License Server chỉ quản lý phí phần mềm LotusAI.

## 1. Kiến trúc

| Thành phần | Trách nhiệm |
|---|---|
| POS/Staff client | Giữ lease đã ký và trạng thái license hiệu lực gần nhất; áp dụng phạm vi khóa; gửi heartbeat/sync |
| Customer QR backend | Kiểm tra trạng thái đã lưu trước khi nhận order mới; không trả dữ liệu license nhạy cảm cho khách |
| License API | Xác thực tenant/device, phát lease đã ký, trả trạng thái, nhận xác nhận đã áp dụng |
| Daily scheduler | Chạy duy nhất một lượt lúc 05:00 `Asia/Ho_Chi_Minh`, cập nhật trạng thái theo transaction/idempotency |
| LotusAI Admin Console | MFA, quản lý tenant/device/license; gia hạn/tạm ngưng/khôi phục thủ công; xem audit |
| PostgreSQL | Nguồn sự thật cho tenant, license, device, job run, audit và support session |
| Queue/outbox | Phát sự kiện license sau commit; retry không nhân đôi |

Client nghiệp vụ kiểm tra **trạng thái đã lưu** ở mỗi lệnh tạo order, nhưng không tự tính lại ngày hết hạn trên mỗi request. Việc chuyển trạng thái theo ngày chỉ do scheduler 05:00 hoặc thao tác System Admin được audit.

## 2. Schema tối thiểu

### `tenants`

`id UUID PK`, `code UNIQUE`, `name`, `timezone` mặc định `Asia/Ho_Chi_Minh`, `status`, `created_at`, `updated_at`.

### `licenses`

`tenant_id PK/FK`, `status` (`ACTIVE`, `EXPIRING_SOON`, `GRACE`, `SUSPENDED`, `OFFLINE_LOCKED`), `expires_on DATE`, `effective_at`, `suspension_reason`, `version BIGINT`, `last_daily_business_date`, `updated_by`, `updated_at`.

Mọi update dùng optimistic version hoặc row lock. Không lưu private signing key trong bảng/application log.

### `devices`

`id UUID PK`, `tenant_id FK`, `device_public_id UNIQUE`, `label`, `platform`, `public_key/thumbprint` nếu device-bound, `last_seen_at`, `last_successful_license_sync_at`, `last_ack_status`, `last_ack_at`, `revoked_at`, `created_at`.

### `offline_leases`

`id UUID PK`, `tenant_id`, `device_id`, `license_version`, `issued_at`, `not_before`, `expires_at`, `payload_hash`, `key_id`, `revoked_at`. Lease trả về dạng payload canonical + chữ ký, không lưu private key ở client.

### `license_job_runs`

`id UUID PK`, `tenant_id`, `business_date DATE`, `job_type`, `scheduled_for`, `started_at`, `finished_at`, `status_before`, `status_after`, `result`, `error_code`, `attempt`, `delayed BOOLEAN`, `created_at`.

Unique bắt buộc: `(tenant_id, business_date, job_type)`. Đây là idempotency của daily evaluation.

### `license_audit`

Append-only: `id`, `tenant_id`, `actor_type`, `actor_id`, `action`, `status_before`, `status_after`, `expiry_before`, `expiry_after`, `reason`, `reference`, `request_id`, `ip`, `user_agent`, `created_at`, `metadata JSONB`. Không cho update/delete qua API nghiệp vụ.

### `admin_users`

`id`, `email UNIQUE`, `password_hash` hoặc external IdP subject, `mfa_required`, `status`, `last_login_at`. Quyền hệ thống tách hoàn toàn khỏi staff tenant.

### `support_sessions`

`id`, `admin_user_id`, `tenant_id`, `approved_by`, `scope`, `reason`, `starts_at`, `expires_at`, `revoked_at`. Truy cập dữ liệu tenant chỉ qua phiên hỗ trợ có thời hạn và audit.

### `idempotency_keys` và `outbox_events`

Lưu request key, actor, route, request hash, response/status và thời hạn; outbox phát `license.changed` sau cùng transaction để thiết bị online nhận update an toàn.

## 3. Quy tắc scheduler 05:00

1. Scheduler chạy lúc `05:00` theo `Asia/Ho_Chi_Minh`, lấy advisory lock toàn job.
2. Với từng tenant, insert `license_job_runs` theo unique key `tenant_id + business_date + DAILY_LICENSE`.
3. Nếu key đã tồn tại trạng thái thành công, bỏ qua; không chuyển trạng thái hoặc audit lần hai.
4. Lock row license, tính state từ `expires_on`, business date và mốc 05:00.
5. `D−3` → `EXPIRING_SOON`; `D`, `D+1`, `D+2` → `GRACE`; `D+3 05:00` → `SUSPENDED`.
6. Nếu thiết bị không sync **quá** 10 ngày, lease hợp lệ đã hết và điều kiện sản phẩm cho phép → `OFFLINE_LOCKED`. Đúng 10 ngày chưa khóa.
7. Commit license, job run, audit và outbox trong một transaction.

Nếu VPS lỡ 05:00, lần scheduler hoạt động kế tiếp chạy bù **một lần cho ngày hiện tại**, đánh dấu `delayed=true`, giữ `scheduled_for` và thời gian thực chạy. Do yêu cầu không có job quét phụ, hệ thống không được tuyên bố đã khóa chính xác 05:00 khi job chưa chạy.

PWA bị đóng/ngủ không thể bảo đảm chạy nền lúc 05:00. Khi mở lại, client sync và áp dụng trạng thái server; dashboard chỉ ghi “nghi ngờ bị khóa do offline” cho đến khi nhận ACK từ thiết bị.

## 4. API contract dự kiến

Tất cả API dùng HTTPS, access token ngắn hạn, `request_id`, tenant context từ token chứ không tin `tenant_id` do client tự gửi. Các mutation quan trọng nhận `Idempotency-Key`.

| Method | Endpoint | Quyền | Chức năng |
|---|---|---|---|
| `POST` | `/v1/device/activate` | Activation grant một lần | Đăng ký device, trả device credential |
| `POST` | `/v1/license/sync` | Device | Trả state/version + signed offline lease; cập nhật successful sync khi response hợp lệ |
| `POST` | `/v1/license/ack` | Device | Xác nhận device đã áp dụng version/status |
| `GET` | `/v1/store/license` | Store Owner/Manager | Chỉ xem license của chính tenant |
| `GET` | `/v1/admin/tenants` | System Admin + MFA | Danh sách tenant, expiry, last_seen, offline suspicion |
| `GET` | `/v1/admin/tenants/{id}/license` | System Admin + MFA | Chi tiết state, devices, job runs, audit |
| `POST` | `/v1/admin/tenants/{id}/renew` | System Admin + MFA | Hạn mới, chứng từ, lý do; mở lại idempotent |
| `POST` | `/v1/admin/tenants/{id}/suspend` | System Admin + MFA | Tạm ngưng thủ công có reason/audit |
| `POST` | `/v1/admin/tenants/{id}/restore` | System Admin + MFA | Khôi phục theo policy, không tự gia hạn |
| `POST` | `/v1/admin/tenants/{id}/support-sessions` | System Admin + approval | Phiên hỗ trợ có scope và thời hạn |

Store Owner/Manager gửi lệnh renew/suspend/restore phải nhận `403`; tenant A truy cập ID tenant B nhận `404` hoặc `403` nhất quán, không rò rỉ tồn tại. Customer/Cashier không nhận payload license quản trị.

Ví dụ payload lease đã ký:

```json
{
  "tenant_id": "uuid",
  "device_id": "uuid",
  "license_version": 42,
  "status": "ACTIVE",
  "issued_at": "2026-10-01T05:00:00+07:00",
  "expires_at": "2026-10-12T05:00:00+07:00",
  "key_id": "license-signing-2026-01"
}
```

Response mang thêm chữ ký detached/JWS. Client bundle chỉ chứa public key hiện hành và key rotation set; private key nằm trong KMS/HSM hoặc secret store của VPS, quyền ký tách khỏi web process nếu có thể.

## 5. Phạm vi khóa

`SUSPENDED` và `OFFLINE_LOCKED` chặn tạo order/payment request **mới** từ POS, Staff và QR. Vẫn cho:

- xem và export dữ liệu;
- xử lý/đối soát payment request đã tồn tại;
- hoàn tất order tạo trước thời điểm khóa;
- xem lịch sử, báo cáo và backup;
- sync, gia hạn và khôi phục hợp lệ.

Order tạo 04:59 vẫn được settle 05:01; order mới sau khi trạng thái đã chuyển khóa bị từ chối. Thông báo khách chỉ nói cửa hàng tạm ngừng nhận đơn, không lộ tranh chấp phí/license.

## 6. Bảo mật và vận hành

- MFA bắt buộc cho System Admin; RBAC và tenant isolation thực thi backend, không dựa vào ẩn nút.
- Rate limit activation/sync/admin; chống brute force; revoke device; rotate key và credential.
- TLS, HSTS, CSP, secure cookie hoặc OAuth/OIDC; CSRF protection nếu dùng cookie.
- Mã hóa backup/database; log không chứa token, lease private material, PII không cần thiết hoặc thông tin ngân hàng nhạy cảm.
- Audit append-only, xuất sang log store riêng; cảnh báo gia hạn/tạm ngưng hàng loạt, nhiều lần fail MFA và clock anomaly.
- Health check scheduler, alert khi thiếu job run sau 05:00, queue lag, ký lease lỗi hoặc tenant không liên lạc.
- Clock rollback: dựa vào server time, lease expiry đã ký và last-seen monotonic/native storage nếu có. Browser PWA không thể chống chỉnh đồng hồ tuyệt đối; không quảng cáo bảo vệ tương đương native secure hardware.
- Admin renew cần `new_expiry`, `reference`, `reason`, xác nhận tenant và idempotency key. Bấm lại trả cùng kết quả.
- Không liên kết webhook bán hàng OCB với gia hạn license LotusAI.

## 7. Di trú từ POC sang VPS

1. Chốt database và chính sách dữ liệu; cấp tenant UUID, migrate products/customers/vouchers/recipes/inventory/orders từ export JSON.
2. Đưa service order/payment/inventory/loyalty lên backend transactionally; giữ idempotency order/payment.
3. Thay local role matrix bằng auth + tenant RBAC backend; tạo System Admin realm riêng có MFA.
4. Đăng ký thiết bị và triển khai `/license/sync`, signed lease, ACK, key rotation.
5. Chạy scheduler ở staging với virtual clock; test D−3/D/D+3, downtime/backfill, offline 10/11 ngày và retry.
6. Tích hợp realtime/outbox cho nhiều thiết bị; localStorage chỉ làm cache, không là nguồn sự thật.
7. UAT SUNMI/browser/clock/network; canary một cửa hàng; có kill switch và rollback server-side.
8. Chỉ bật enforcement cho khách thật sau khi hợp đồng, thông báo, grace period, backup/export và quy trình hỗ trợ đã duyệt.

## 8. Giới hạn còn lại

Thiết kế không tự tạo ra khả năng chạy nền đúng 05:00 trên thiết bị ngủ, không chứng minh app OCB hoặc phần cứng SUNMI, và không thay thế threat model/penetration test. FaceID/customer API đang được bảo lưu theo quyết định dự án và không nằm trong contract này.

