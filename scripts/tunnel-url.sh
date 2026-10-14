#!/usr/bin/env bash
# Print the public URL of the currently running tunnel (written by scripts/serve-tunnel.sh).
cd "$(dirname "$0")/.."
if [ -s .tunnel-url ]; then cat .tunnel-url; else echo "tunnel is not running (no .tunnel-url)"; exit 1; fi
