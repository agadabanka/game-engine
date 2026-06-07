#!/usr/bin/env bash
# Runs on every web session. Cold checkouts have no node_modules — install, then
# print the mission-control snapshot so a session opens already knowing the state
# of every game on the engine.
set -e
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "session-start: installing deps…"
  npm install --no-audit --no-fund >/dev/null 2>&1 || npm install
fi

# soft check on the hub's runtime key (only needed to deploy the hub, not to scaffold)
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "session-start: note — ANTHROPIC_API_KEY not set (fine for the hub; games need it at runtime)"
else
  echo "session-start: ✓ required env vars present"
fi

# show what mission control sees right now (best-effort; ignores network hiccups)
node hub/refresh.mjs 2>/dev/null || echo "session-start: (skipped live snapshot)"
echo "session-start: ready"
