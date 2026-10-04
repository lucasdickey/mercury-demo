#!/usr/bin/env bash
# Reads a Mercury sandbox token or Anthropic API key from the clipboard, upserts
# it into .env.local, clears the clipboard, and verifies it with a read-only call
# (Mercury GET /accounts, Anthropic GET /v1/models).
# Never prints the token. Usage: scripts/set-token.sh [--verify-only]
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=.env.local

verify() {
  local var=$1 base tok status body
  tok=$(grep -E "^${var}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')  # vercel env pull quotes values
  [[ -n $tok ]] || { echo "$var: not set in $ENV_FILE"; return 1; }
  body=$(mktemp)
  if [[ $var == ANTHROPIC_API_KEY ]]; then
    base=https://api.anthropic.com/v1
    status=$(printf 'header = "x-api-key: %s"\nheader = "anthropic-version: 2023-06-01"\n' "$tok" |
      curl -sS --config - -o "$body" -w '%{http_code}' "$base/models")
    if [[ $status == 200 ]]; then
      echo "$var: OK (HTTP 200) against $base"
    else
      echo "$var: FAILED (HTTP $status) against $base"
      python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("  ", d.get("error") or d)' "$body" 2>/dev/null || true
    fi
    rm -f "$body"
    return
  fi
  base=https://api-sandbox.mercury.com/api/v1
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
  for v in MERCURY_SANDBOX_API_TOKEN ANTHROPIC_API_KEY; do
    grep -qE "^${v}=" "$ENV_FILE" 2>/dev/null && verify "$v"
  done
  exit 0
fi

tok=$(pbpaste | tr -d '[:space:]')
case $tok in
  secret-token:mercury_sandbox_*) var=MERCURY_SANDBOX_API_TOKEN ;;
  sk-ant-*)                       var=ANTHROPIC_API_KEY ;;
  secret-token:mercury_production_*)
    echo "That's a production Mercury token. Steward is sandbox-only (PLAN.md §6); not saved."; exit 1 ;;
  *) echo "Clipboard doesn't hold a Mercury sandbox token (secret-token:mercury_sandbox_…) or an Anthropic key (sk-ant-…). Nothing changed."; exit 1 ;;
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
