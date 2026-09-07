#!/usr/bin/env bash
# Usage: CONNECTOR_URL=https://...workers.dev CONNECTOR_SECRET=... bash scripts/smoke.sh
set -euo pipefail

: "${CONNECTOR_URL:?set CONNECTOR_URL}"
: "${CONNECTOR_SECRET:?set CONNECTOR_SECRET}"

rpc() {
  curl -sS -X POST "$CONNECTOR_URL" \
    -H "Authorization: Bearer $CONNECTOR_SECRET" \
    -H "content-type: application/json" \
    -d "$1"
}

echo "== initialize"
rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
echo; echo "== tools/list (count)"
rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | grep -o '"name":"[a-z_]*"' | wc -l | tr -d ' ' || true
echo "== tools/call list_websites"
rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_websites","arguments":{}}}'
echo; echo "== wrong secret should be 401"
curl -sS -o /dev/null -w "%{http_code}\n" -X POST "$CONNECTOR_URL" -H "Authorization: Bearer wrong" -d '{}'
