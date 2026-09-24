#!/usr/bin/env bash
# Read-only health check for the abacus verification harness.
# Usage: .cursor/skills/verify-abacus/scripts/doctor.sh [port]   (default 5173)
set -u
cd "$(dirname "$0")/../../../.." || exit 1
PORT="${1:-5173}"
fail() { echo "doctor: FAIL — $1"; exit 1; }

# 1. Docker daemon reachable at all — distinguishes "Desktop stopped / WSL
#    integration off" from "stack stopped". Fixing the wrong one wastes a run.
command -v docker >/dev/null 2>&1 \
  || fail "docker CLI not on PATH — WSL integration is off; enable it in Docker Desktop (this is NOT a stopped stack)"
docker info >/dev/null 2>&1 \
  || fail "docker daemon unreachable — start Docker Desktop / enable WSL integration (this is NOT a stopped stack; npx supabase start will NOT help)"

# 2. Supabase stack up with keys
ENV_OUT=$(npx supabase status -o env 2>/dev/null) || fail "docker is up but the local Supabase stack is not running (npx supabase start)"
API_URL=$(printf '%s' "$ENV_OUT" | sed -n 's/^API_URL="\(.*\)"$/\1/p')
PUB=$(printf '%s' "$ENV_OUT" | sed -n 's/^PUBLISHABLE_KEY="\(.*\)"$/\1/p')
SVC=$(printf '%s' "$ENV_OUT" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
[ -n "$API_URL" ] && [ -n "$PUB" ] && [ -n "$SVC" ] || fail "supabase status missing API_URL/PUBLISHABLE_KEY/SERVICE_ROLE_KEY"

# 3. .env matches the stack URL and has a key
[ -f .env ] || fail ".env missing (copy .env.example)"
grep -q "VITE_SUPABASE_URL=$API_URL" .env || fail ".env VITE_SUPABASE_URL != $API_URL"
grep -q '^VITE_SUPABASE_PUBLISHABLE_KEY=.\+' .env || fail ".env VITE_SUPABASE_PUBLISHABLE_KEY empty"

# 4. Dependencies installed
[ -d node_modules ] || fail "node_modules missing (npm install)"

# 5. App port answering (ours) or free
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT" --max-time 2)
case "$CODE" in
  200) NOTE="app already answering on :$PORT (will be reused)" ;;
  000) NOTE=":$PORT free (Playwright will start the dev server)" ;;
  *)   fail ":$PORT answers HTTP $CODE — not the abacus dev server" ;;
esac

echo "doctor: OK — docker reachable, supabase at $API_URL, .env matches, node_modules present, $NOTE"
