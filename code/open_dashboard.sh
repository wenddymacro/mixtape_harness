#!/usr/bin/env bash
# code/open_dashboard.sh — make sure the harness dashboard is running, then print
# its URL on its own line.
#
# WHY THIS EXISTS. The dashboard is normally read inside DSH's right-sidebar
# browser. DSH's own rule (ui-chat README) is:
#
#   Settings -> General -> "Open chat links in" = In-App Sidebar   (the default)
#   ... opens a new right-Sidebar Browser tab for a chat HTTP(S) link.
#
# So "activate the dashboard" is a two-part gesture: make sure the server is up
# (this script), then put the URL in the conversation as a plain link (the skill
# does that). One click on it lands in the sidebar beside the session.
#
# WHY NOT FULLY AUTOMATIC. Opening a sidebar tab without a click needs a DSH
# *client* plugin calling `ctx.sidebarRight.openTab('browser', {params:{url}})`,
# and this installation is a packaged app.asar with no source tree and no pnpm,
# so a new client plugin cannot be built into it from here. Recorded rather than
# pretended; see STATE.md.
#
# USAGE:
#   bash code/open_dashboard.sh          # start if needed, print the URL
#   PORT=8081 bash code/open_dashboard.sh
set -uo pipefail

PORT="${PORT:-8080}"
URL="http://localhost:${PORT}/"
LOG="${TMPDIR:-/tmp}/harness_dashboard.log"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if curl -fsS -o /dev/null --max-time 2 "$URL" 2>/dev/null; then
  echo "dashboard already running" >&2
  echo "$URL"
  exit 0
fi

echo "starting dashboard_server.py from $ROOT ..." >&2
( cd "$ROOT" && PORT="$PORT" nohup python3 dashboard_server.py > "$LOG" 2>&1 & echo $! > "${TMPDIR:-/tmp}/harness_dashboard.pid" )
PID="$(cat "${TMPDIR:-/tmp}/harness_dashboard.pid" 2>/dev/null || echo '?')"
echo "  pid $PID, log $LOG" >&2

for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 1 "$URL" 2>/dev/null; then
    echo "ready" >&2
    echo "$URL"
    exit 0
  fi
  sleep 0.5
done

echo "dashboard did NOT come up within 30s — read $LOG" >&2
exit 1
