#!/usr/bin/env bash
# Keep STRANGER's public test site running on this Mac.
#
# Installs a per-user LaunchAgent (com.stranger.tunnel) that runs scripts/serve-tunnel.sh at login,
# restarts it whenever it exits, and prevents idle sleep while it runs (caffeinate; a closed lid still
# sleeps unless the Mac is on power with an external display).
#
# macOS does not let background launchd jobs read ~/Documents, ~/Desktop or ~/Downloads, so the agent
# runs from a deploy copy of the committed repository at $STRANGER_LIVE_DIR (default ~/.stranger-live).
# Re-run this script after new commits to update the copy and restart the site.
# Remove everything with: bash scripts/install-launchagent.sh --uninstall
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LIVE="${STRANGER_LIVE_DIR:-$HOME/.stranger-live}"
LABEL="com.stranger.tunnel"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/stranger-tunnel.log"
UID_NUM="$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL (deploy copy left at $LIVE; delete it if you like)"
  exit 0
fi

# 1. Sync the deploy copy from the committed state of this repository.
if [ ! -d "$LIVE/.git" ]; then
  echo "Creating deploy copy at $LIVE ..."
  git clone -q "$REPO" "$LIVE"
else
  echo "Updating deploy copy at $LIVE ..."
  git -C "$LIVE" fetch -q origin
  git -C "$LIVE" reset -q --hard origin/HEAD
fi
if [ -f "$REPO/.env" ]; then cp "$REPO/.env" "$LIVE/.env"; fi
if [ ! -f "$LIVE/.env" ]; then
  echo "No .env found; copy .env.example to .env and set IDENTITY_SECRET first." >&2
  exit 1
fi
(cd "$LIVE" && npm ci --no-audit --no-fund --silent)

# 2. Write the LaunchAgent.
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string><string>-i</string><string>-s</string>
    <string>/bin/bash</string><string>$LIVE/scripts/serve-tunnel.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$LIVE</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
    <key>LC_ALL</key><string>en_US.UTF-8</string>
    <key>LANG</key><string>en_US.UTF-8</string>
  </dict>
</dict>
</plist>
PLIST

# 3. (Re)start it.
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
launchctl kickstart -k "gui/$UID_NUM/$LABEL"
echo "installed $LABEL (runs at login, restarts on exit); log: $LOG"
echo "public URL: wait a minute, then run  npm run tunnel:url"
