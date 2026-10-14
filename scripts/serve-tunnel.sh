#!/usr/bin/env bash
# Serve STRANGER from this machine on a public HTTPS URL via a Cloudflare quick tunnel.
# No Cloudflare account is needed; the URL changes every run. Requirements: cloudflared
# (brew install cloudflared), local Redis + Postgres with migrations applied (docs/SETUP.md),
# and a .env with IDENTITY_SECRET set.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"
LOG="${TMPDIR:-/tmp}/stranger-tunnel.log"
: >"$LOG"

if ! command -v cloudflared >/dev/null; then
  echo "cloudflared is not installed: brew install cloudflared" >&2
  exit 1
fi

cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate >"$LOG" 2>&1 &
TUNNEL_PID=$!
cleanup() { kill "$TUNNEL_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "Starting Cloudflare quick tunnel..."
URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "Tunnel did not come up; see $LOG" >&2
  exit 1
fi

echo "Building the web app for $URL ..."
npm run build:protocol >/dev/null
VITE_SITE_URL="$URL" npm run build -w apps/web >/dev/null

cat <<BANNER

==============================================================
  STRANGER is public at:  $URL
  Share this link; it works on phones and other networks.
  Admin console:          $URL/admin   (token: ADMIN_TOKEN in .env)
  Press Ctrl-C to stop the server and the tunnel.
==============================================================

BANNER

export NODE_ENV="${NODE_ENV:-production}"
export PORT
export HOST="${HOST:-127.0.0.1}"
export SITE_URL="$URL"
export STATIC_DIR="apps/web/dist"
export TRUST_PROXY="true"
export LOG_LEVEL="${LOG_LEVEL:-info}"
# Friendlier for small test groups: after Next, the same two people can meet again after 3 s.
export MATCH_REMATCH_GRACE_MS="${MATCH_REMATCH_GRACE_MS:-3000}"
exec node_modules/.bin/tsx apps/server/src/index.ts
