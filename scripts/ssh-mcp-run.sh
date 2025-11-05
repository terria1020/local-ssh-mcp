#!/bin/bash

#############################################################
# SSH MCP Helper Script for Claude Code
#
# 이 스크립트는 Claude Code가 SSH MCP 서버를 쉽게 호출할 수 있도록
# curl 명령을 래핑한 헬퍼 스크립트입니다.
#
# Usage: ./scripts/ssh-mcp-run.sh [-p password] <host> <username> <command> [port]
#
# Example:
#   ./scripts/ssh-mcp-run.sh server.com ubuntu "kubectl get pods"
#   ./scripts/ssh-mcp-run.sh -p mypassword server.com ubuntu "docker ps"
#   ./scripts/ssh-mcp-run.sh 192.168.1.100 admin "docker ps" 22
#############################################################

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 환경변수에서 설정 읽기
MCP_SERVER_URL="${MCP_SERVER_URL:-http://127.0.0.1:4000}"
MCP_JWT_TOKEN="${MCP_JWT_TOKEN}"

# 사용법 출력
usage() {
  echo "Usage: $0 [-p password] <host> <username> <command> [port]"
  echo ""
  echo "Options:"
  echo "  -p password    SSH password (for password-based authentication)"
  echo ""
  echo "Example:"
  echo "  # Key-based authentication:"
  echo "  $0 server.com ubuntu \"kubectl get pods\""
  echo ""
  echo "  # Password-based authentication:"
  echo "  $0 -p mypassword server.com ubuntu \"docker ps\""
  echo ""
  echo "  # With custom port:"
  echo "  $0 192.168.1.100 admin \"docker ps\" 2222"
  echo ""
  echo "Environment Variables:"
  echo "  MCP_SERVER_URL - MCP 서버 URL (기본값: http://127.0.0.1:4000)"
  echo "  MCP_JWT_TOKEN  - JWT 인증 토큰 (필수)"
  echo ""
  echo "JWT 토큰 발급 방법:"
  echo "  curl -X POST http://127.0.0.1:4000/auth \\"
  echo "    -H \"Content-Type: application/json\" \\"
  echo "    -d '{\"token_passphrase\": \"your-passphrase\"}'"
  echo ""
  echo "발급받은 JWT를 환경변수로 저장:"
  echo "  export MCP_JWT_TOKEN=\"your-jwt-token\""
  exit 1
}

# 비밀번호 옵션 파싱
PASSWORD=""
while getopts "p:" opt; do
  case $opt in
    p)
      PASSWORD="$OPTARG"
      ;;
    *)
      usage
      ;;
  esac
done
shift $((OPTIND-1))

# 인자 검사
if [ $# -lt 3 ]; then
  echo -e "${RED}Error: 인자가 부족합니다${NC}"
  usage
fi

HOST="$1"
USERNAME="$2"
COMMAND="$3"
PORT="${4:-22}"

# JWT 토큰 검사
if [ -z "$MCP_JWT_TOKEN" ]; then
  echo -e "${RED}Error: MCP_JWT_TOKEN 환경변수가 설정되지 않았습니다${NC}"
  echo ""
  echo "1. 먼저 JWT 토큰을 발급받으세요:"
  echo "   curl -X POST http://127.0.0.1:4000/auth \\"
  echo "     -H \"Content-Type: application/json\" \\"
  echo "     -d '{\"token_passphrase\": \"your-passphrase\"}'"
  echo ""
  echo "2. 발급받은 JWT를 환경변수로 설정:"
  echo "   export MCP_JWT_TOKEN='your-jwt-token'"
  echo ""
  echo "3. 또는 ~/.bashrc 또는 ~/.zshrc에 추가 (30분마다 갱신 필요):"
  echo "   echo 'export MCP_JWT_TOKEN=\"your-jwt-token\"' >> ~/.zshrc"
  echo ""
  echo "참고: JWT 토큰은 30분 후 만료되므로 주기적으로 갱신해야 합니다."
  exit 1
fi

# JSON 페이로드 생성
if [ -n "$PASSWORD" ]; then
  # 비밀번호가 제공된 경우
  JSON_PAYLOAD=$(cat <<EOF
{
  "host": "$HOST",
  "username": "$USERNAME",
  "command": "$COMMAND",
  "port": $PORT,
  "password": "$PASSWORD"
}
EOF
  )
  AUTH_METHOD="password"
else
  # 키 기반 인증
  JSON_PAYLOAD=$(cat <<EOF
{
  "host": "$HOST",
  "username": "$USERNAME",
  "command": "$COMMAND",
  "port": $PORT
}
EOF
  )
  AUTH_METHOD="key"
fi

echo -e "${YELLOW}SSH MCP Request:${NC}"
echo "  Host: $USERNAME@$HOST:$PORT"
echo "  Auth: $AUTH_METHOD"
echo "  Command: $COMMAND"
echo ""

# curl 요청 실행
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$MCP_SERVER_URL/mcp/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MCP_JWT_TOKEN" \
  -d "$JSON_PAYLOAD")

# HTTP 상태 코드와 응답 본문 분리
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

# HTTP 상태 코드 확인
if [ "$HTTP_CODE" -eq 200 ]; then
  echo -e "${GREEN}✓ Success (HTTP $HTTP_CODE)${NC}"
  echo ""

  # jq가 설치되어 있으면 예쁘게 출력, 아니면 그대로 출력
  if command -v jq &> /dev/null; then
    echo "$RESPONSE_BODY" | jq .

    # stdout만 추출해서 출력
    STDOUT=$(echo "$RESPONSE_BODY" | jq -r '.result.stdout // empty')
    STDERR=$(echo "$RESPONSE_BODY" | jq -r '.result.stderr // empty')
    EXIT_CODE=$(echo "$RESPONSE_BODY" | jq -r '.result.exitCode // 0')

    if [ -n "$STDOUT" ]; then
      echo ""
      echo -e "${GREEN}=== Command Output ===${NC}"
      echo "$STDOUT"
    fi

    if [ -n "$STDERR" ]; then
      echo ""
      echo -e "${YELLOW}=== Stderr ===${NC}"
      echo "$STDERR"
    fi

    echo ""
    echo -e "Exit Code: ${GREEN}$EXIT_CODE${NC}"
  else
    echo "$RESPONSE_BODY"
  fi
else
  echo -e "${RED}✗ Failed (HTTP $HTTP_CODE)${NC}"
  echo ""

  if command -v jq &> /dev/null; then
    echo "$RESPONSE_BODY" | jq .
  else
    echo "$RESPONSE_BODY"
  fi

  exit 1
fi
