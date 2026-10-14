#!/usr/bin/env bash
# Print the public URL of the running tunnel (deploy copy first, then this checkout).
LIVE="${STRANGER_LIVE_DIR:-$HOME/.stranger-live}"
for f in "$LIVE/.tunnel-url" "$(cd "$(dirname "$0")/.." && pwd)/.tunnel-url"; do
  if [ -s "$f" ]; then cat "$f"; exit 0; fi
done
echo "tunnel is not running (no .tunnel-url found)"; exit 1
