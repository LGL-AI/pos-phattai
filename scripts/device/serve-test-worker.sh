#!/usr/bin/env bash
# Throwaway Worker + local D1 for the device test; reachable by the emulator through the tunnel.
set -euo pipefail
: "${TEST_WORKER_URL:?}" "${TEST_APP_ID:?}" "${TEST_SIGNER:?}" "${DEVICE_PASSWORD:?}"
export WRANGLER_SEND_METRICS=false CI=1
wrangler="node node_modules/wrangler/bin/wrangler.js"
$wrangler d1 migrations apply DB --local --persist-to device/d1 > device/migrate.log 2>&1 || { cat device/migrate.log; exit 1; }
nohup $wrangler dev --local --ip 127.0.0.1 --port 8787 --persist-to device/d1 \
  --var SESSION_SECRET:device-session-secret-0123456789abcdef --var "POS_STAFF_PASSWORD:$DEVICE_PASSWORD" > device/worker.log 2>&1 &
for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:8787/api/health > /dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8787/api/health || { tail -50 device/worker.log; exit 1; }
for _ in $(seq 1 60); do curl -fsS "$TEST_WORKER_URL/api/health" > /dev/null 2>&1 && break; sleep 2; done
echo; curl -fsS "$TEST_WORKER_URL/api/health"
echo; curl -fsS "$TEST_WORKER_URL/api/android/update?applicationId=$TEST_APP_ID&signerSha256=$TEST_SIGNER&versionCode=2000001&sdk=30" | tee device/update-check.json
grep -q '"AVAILABLE"' device/update-check.json
