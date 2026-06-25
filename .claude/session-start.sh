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

# repo-access protocol (see CLAUDE.md): fetch repos via $GH_TOKEN over GIT, not the API.
if [ -n "${GH_TOKEN:-}" ]; then
  echo "session-start: ✓ GH_TOKEN present — clone/fetch repos with"
  echo "               git clone https://x-access-token:\$GH_TOKEN@github.com/<owner>/<repo>.git"
  echo "               (api.github.com is gated → use mcp__github__* + git, not curl;"
  echo "                out-of-scope repo = 'Repository not found' → add_repo / widen scope. See CLAUDE.md)"
else
  echo "session-start: note — GH_TOKEN not set; repo fetch + git push will be limited"
fi

# show what mission control sees right now (best-effort; ignores network hiccups)
node hub/refresh.mjs 2>/dev/null || echo "session-start: (skipped live snapshot)"
echo "session-start: ready"
