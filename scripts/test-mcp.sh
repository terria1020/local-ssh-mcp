#!/bin/bash
# MCP 프로토콜 테스트 스크립트

set -e

echo "=== Starting server ==="
node dist/index.js &
SERVER_PID=$!
sleep 2

cleanup() {
  echo "=== Cleanup ==="
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

echo ""
echo "=== Step 1: Initialize ==="
INIT_RESPONSE=$(curl -s -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -D /tmp/mcp_headers.txt \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}')

echo "$INIT_RESPONSE" | jq . 2>/dev/null || echo "$INIT_RESPONSE"

SESSION_ID=$(grep -i "mcp-session-id" /tmp/mcp_headers.txt | awk '{print $2}' | tr -d '\r\n')
echo ""
echo "Session ID: $SESSION_ID"

echo ""
echo "=== Step 2: Tools List ==="
curl -s -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq .

echo ""
echo "=== Step 3: Ping ==="
curl -s -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"ping","params":{}}' | jq .

echo ""
echo "=== All tests passed! ==="
