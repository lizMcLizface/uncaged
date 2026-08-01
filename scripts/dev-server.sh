#!/usr/bin/env bash
# Start/stop/status for the CRA dev server (port 3000), used by the run-app
# skill and manual verification. Lives at a fixed repo path with a fixed
# log/pid location so the Bash permission for it can be allowlisted once
# (Bash(bash scripts/dev-server.sh *)) instead of re-approved per session -
# the old approach (inline netstat/taskkill pipelines, or scripts written to
# the session scratch directory) produced a new, unapprovable command string
# every time.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$REPO_ROOT/.tmp"
LOG_FILE="$TMP_DIR/dev-server.log"
PORT=3000

mkdir -p "$TMP_DIR"

is_up() {
    curl -sf "http://localhost:$PORT" >/dev/null 2>&1
}

start() {
    if is_up; then
        echo "Dev server already running on port $PORT"
        return 0
    fi
    cd "$REPO_ROOT"
    (BROWSER=none npm run start > "$LOG_FILE" 2>&1 &)
    echo "Waiting for dev server on port $PORT..."
    for _ in $(seq 1 30); do
        if is_up; then
            echo "READY"
            return 0
        fi
        sleep 2
    done
    echo "Timed out waiting for dev server. Check $LOG_FILE"
    return 1
}

stop() {
    # npm run start's own PID is just the npm wrapper - it doesn't forward
    # signals to the actual node process, so kill whatever is actually
    # listening on the port instead.
    local pids
    pids=$(netstat -ano | grep ":$PORT" | grep LISTENING | awk '{print $5}' | sort -u)
    if [ -z "$pids" ]; then
        echo "No process listening on port $PORT"
        return 0
    fi
    for pid in $pids; do
        taskkill //F //PID "$pid" 2>/dev/null || true
    done
    echo "Stopped dev server (port $PORT)"
}

status() {
    if is_up; then
        echo "RUNNING"
    else
        echo "STOPPED"
    fi
}

case "${1:-}" in
    start) start ;;
    stop) stop ;;
    status) status ;;
    *) echo "Usage: $0 {start|stop|status}"; exit 1 ;;
esac
