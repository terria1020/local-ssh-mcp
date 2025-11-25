#!/bin/bash

# MCP JWT 자동 갱신 스크립트
# 사용법: ./scripts/auto-refresh-jwt.sh
# Cron에 등록하여 25분마다 실행 권장: */25 * * * * /path/to/auto-refresh-jwt.sh

set -e

# 환경변수 로드
if [ -f "$HOME/.mcp_config" ]; then
    source "$HOME/.mcp_config"
else
    echo "Error: ~/.mcp_config not found"
    echo "Please create it with:"
    echo "  TOKEN_PASSPHRASE=your-passphrase"
    echo "  MCP_SERVER_URL=http://127.0.0.1:4000"
    exit 1
fi

# 새 JWT 토큰 발급
RESPONSE=$(curl -s -X POST "${MCP_SERVER_URL}/auth" \
    -H "Content-Type: application/json" \
    -d "{\"token_passphrase\": \"${TOKEN_PASSPHRASE}\"}")

# JWT 추출
NEW_TOKEN=$(echo "$RESPONSE" | jq -r '.jwt')

if [ -z "$NEW_TOKEN" ] || [ "$NEW_TOKEN" = "null" ]; then
    echo "Error: Failed to obtain JWT token"
    echo "Response: $RESPONSE"
    exit 1
fi

# Shell 설정 파일 업데이트
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
else
    echo "Error: No shell configuration file found"
    exit 1
fi

# 기존 MCP_JWT_TOKEN 라인 제거하고 새로 추가
sed -i.bak '/^export MCP_JWT_TOKEN=/d' "$SHELL_RC"
echo "export MCP_JWT_TOKEN=\"${NEW_TOKEN}\"" >> "$SHELL_RC"

echo "✓ JWT token refreshed successfully"
echo "✓ Updated: $SHELL_RC"
echo "✓ Token expires in: 30 minutes"
echo ""
echo "To apply immediately in current shell:"
echo "  source $SHELL_RC"
