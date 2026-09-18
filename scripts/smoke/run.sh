#!/usr/bin/env bash
# Offline end-to-end smoke: mock Mercury sandbox → built Next app → real MCP SDK clients.
# Verifies tools/list, close_month, the approve-URL fallback, and the elicitation (MRTR) round trip
# that ends in a request-transfer call. No Mercury token needed.  Usage: scripts/smoke/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export MCP_PATH_SECRET="smoke-secret-0123456789abcdef"
export STATE_SECRET="0123456789abcdef0123456789abcdef0123456789abcdef"
export PUBLIC_BASE_URL="http://localhost:3999"
export MERCURY_SANDBOX_API_TOKEN="secret-token:mercury_sandbox_smoke_yrucrem"
export MERCURY_BASE_URL="http://localhost:3998/api/v1"
export ANTHROPIC_API_KEY="sk-ant-smoke"
# Offline smoke uses the static bills catalog, never a demo file written by demo:prep.
export STEWARD_BILLS_FILE="/nonexistent/bills.json"
cleanup() { kill "${MOCK_PID:-}" "${NEXT_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT
node "$ROOT/scripts/smoke/mock-mercury.mjs" >/dev/null 2>&1 & MOCK_PID=$!
( cd "$ROOT/apps/web" && [ -d .next ] || npx next build >/dev/null )
( cd "$ROOT/apps/web" && npx next start -p 3999 >/dev/null 2>&1 ) & NEXT_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:3999/ && curl -s -o /dev/null http://localhost:3998/__log && break; sleep 0.5; done
MCP_URL="http://localhost:3999/api/mcp/$MCP_PATH_SECRET" node "$ROOT/scripts/smoke/mcp-client.mjs"
echo "--- mock Mercury received:"; curl -s http://localhost:3998/__log | node -e "JSON.parse(require('fs').readFileSync(0,'utf8')).filter(l=>l.startsWith('POST')).forEach(l=>console.log(' ',l))"
