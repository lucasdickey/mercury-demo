#!/usr/bin/env bash
# Reads a Mercury token from the clipboard, upserts it into .env.local, clears
# the clipboard, and verifies it with a read-only GET /accounts.
# Never prints the token. Usage: scripts/set-token.sh [--verify-only]
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=.env.local

verify() {
  local var=$1 base tok status body
  case $var in
    MERCURY_API_TOKEN)         base=https://api.mercury.com/api/v1 ;;
    MERCURY_SANDBOX_API_TOKEN) base=https://api-sandbox.mercury.com/api/v1 ;;
  esac
  tok=$(grep -E "^${var}=" "$ENV_FILE" | tail -1 | cut -d= -f2-)
  [[ -n $tok ]] || { echo "$var: not set in $ENV_FILE"; return 1; }
  body=$(mktemp)
  # Header goes via stdin config so the token never appears in process args.
  # -4: allowlists are IPv4; dual-stack Macs otherwise egress over a rotating IPv6.
  status=$(printf 'header = "Authorization: Bearer %s"\n' "$tok" |
    curl -4 -sS --config - -o "$body" -w '%{http_code}' "$base/accounts")
  if [[ $status == 200 ]]; then
    count=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1])).get("accounts", [])))' "$body")
    echo "$var: OK (HTTP 200, $count account(s)) against $base"
  else
    echo "$var: FAILED (HTTP $status) against $base"
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("  ", d.get("errors") or d)' "$body" 2>/dev/null || true
  fi
  rm -f "$body"
}

if [[ ${1:-} == --verify-only ]]; then
  for v in MERCURY_API_TOKEN MERCURY_SANDBOX_API_TOKEN; do
    grep -qE "^${v}=" "$ENV_FILE" 2>/dev/null && verify "$v"
  done
  exit 0
fi

tok=$(pbpaste | tr -d '[:space:]')
case $tok in
  secret-token:mercury_production_*) var=MERCURY_API_TOKEN ;;
  secret-token:mercury_sandbox_*)    var=MERCURY_SANDBOX_API_TOKEN ;;
  *) echo "Clipboard doesn't hold a Mercury token (expected secret-token:mercury_production_… or …sandbox_…). Nothing changed."; exit 1 ;;
esac

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
tmp=$(mktemp)
grep -vE "^${var}=" "$ENV_FILE" > "$tmp" || true
printf '%s=%s\n' "$var" "$tok" >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
printf '' | pbcopy

echo "$var: written to $ENV_FILE (len=${#tok}); clipboard cleared"
verify "$var"
