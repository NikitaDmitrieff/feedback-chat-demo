#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")/../packages/agent" && pwd)"
PID_FILE="/tmp/feedback-chat-worker.pid"

current_mode() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "local"
  else
    rm -f "$PID_FILE"
    echo "railway"
  fi
}

start_local() {
  echo "=> Pausing Railway worker..."
  (cd "$AGENT_DIR" && railway variables set WORKER_PAUSED=true 2>/dev/null) || echo "   (railway CLI not linked — skip)"

  echo "=> Building agent..."
  (cd "$AGENT_DIR" && npm run build --silent)

  echo "=> Starting local worker..."
  cd "$AGENT_DIR"
  node --env-file=.env dist/managed-worker.js &
  echo $! > "$PID_FILE"

  echo ""
  echo "Local worker running (PID $(cat "$PID_FILE")). Run this script again to switch back."
}

stop_local() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "=> Stopping local worker (PID $pid)..."
      kill "$pid"
      # Wait for clean shutdown
      for i in {1..10}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
    fi
    rm -f "$PID_FILE"
  fi

  echo "=> Resuming Railway worker..."
  (cd "$AGENT_DIR" && railway variables set WORKER_PAUSED=false 2>/dev/null) || echo "   (railway CLI not linked — skip)"

  echo ""
  echo "Railway worker resumed."
}

mode=$(current_mode)

echo "feedback-chat worker switch"
echo "Current mode: $mode"
echo ""

if [[ "$mode" == "local" ]]; then
  echo "Switching to Railway..."
  stop_local
else
  echo "Switching to local..."
  start_local
fi
