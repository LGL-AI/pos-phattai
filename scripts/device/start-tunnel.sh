#!/usr/bin/env bash
# Public HTTPS address for a throwaway local Worker (Cloudflare quick tunnel, real certificate).
set -euo pipefail
mkdir -p device
curl -fsSL -o device/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x device/cloudflared
nohup device/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8787 > device/tunnel.log 2>&1 &
url=''
for _ in $(seq 1 90); do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' device/tunnel.log | head -1 || true)
  [ -n "$url" ] && break
  sleep 1
done
[ -n "$url" ] || { cat device/tunnel.log; echo 'no tunnel URL'; exit 1; }
echo "TEST_WORKER_URL=$url" >> "$GITHUB_ENV"
echo "test Worker will be reachable at $url"
