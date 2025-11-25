# Claude Code 연동 가이드 (v3.0.0)

## 🎯 개요

이 가이드는 **Local SSH MCP Server v3.0.0**을 Claude Code와 연동하는 방법을 설명합니다.

### 아키텍처

```
Claude Code (MCP Client)
    ↕ stdin/stdout (표준 MCP 프로토콜)
mcp-stdio-wrapper.js (브릿지)
    ↕ HTTP + JWT (내부 통신)
Local SSH MCP Server (HTTP 서버)
    ↕ SSH
Remote Servers
```

## 🚀 설정 방법

### 1단계: HTTP MCP 서버 실행

```bash
cd /home/user/local-ssh-mcp

# .env 파일 설정 확인
cat .env

# 서버 빌드 및 실행
npm run build
npm start

# 또는 개발 모드
npm run dev
```

서버가 `http://127.0.0.1:4000`에서 실행되는지 확인:

```bash
curl http://127.0.0.1:4000/mcp/health
```

### 2단계: Claude Code 설정

Claude Code의 설정 파일을 수정합니다.

**macOS/Linux:**
```bash
nano ~/.config/claude/claude_desktop_config.json
```

**설정 내용:**

```json
{
  "mcpServers": {
    "local-ssh-mcp": {
      "command": "node",
      "args": [
        "/home/user/local-ssh-mcp/mcp-stdio-wrapper.js"
      ],
      "env": {
        "MCP_SERVER_URL": "http://127.0.0.1:4000",
        "TOKEN_PASSPHRASE": "test-passphrase-12345"
      }
    }
  }
}
```

**⚠️ 중요:**
- `TOKEN_PASSPHRASE`는 `.env` 파일의 값과 동일해야 합니다
- 절대 경로를 사용하세요 (`/home/user/...`)
- `~` 경로는 사용하지 마세요

### 3단계: Claude Code 재시작

설정을 적용하려면 Claude Code를 완전히 종료하고 재시작합니다.

### 4단계: 서버 인증 정보 추가

Claude Code에서 MCP 서버를 통해 서버 인증 정보를 추가해야 합니다.

**방법 1: Claude Code UI에서 직접**

```
User: 서버 인증 정보를 추가해줘
      host: example.com
      username: ubuntu
      password: mypassword
```

Claude Code가 내부적으로 이렇게 호출합니다:
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "add_server_credentials",
    "arguments": {...}
  }
}
```

**방법 2: HTTP API로 직접 추가 (초기 설정)**

```bash
# JWT 토큰 발급
export MCP_JWT_TOKEN=$(curl -s -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "test-passphrase-12345"}' \
  | jq -r '.jwt')

# 서버 인증 정보 추가
curl -X POST http://127.0.0.1:4000/auth/add-server \
  -H "Authorization: Bearer $MCP_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "example.com",
    "username": "ubuntu",
    "password": "mypassword",
    "port": 22
  }'
```

### 5단계: Claude Code에서 사용

이제 Claude Code에서 자연어로 요청할 수 있습니다:

```
User: example.com 서버에서 kubectl get pods 실행해줘

Claude: [MCP 서버를 통해 SSH 명령 실행]
        결과: NAME   READY   STATUS    AGE
              app-1   1/1     Running   5m
```

## 🔧 트러블슈팅

### 문제 1: "MCP server not responding"

**원인:** HTTP MCP 서버가 실행되지 않음

**해결:**
```bash
cd /home/user/local-ssh-mcp
npm start
```

### 문제 2: "JWT token failed"

**원인:** `TOKEN_PASSPHRASE`가 일치하지 않음

**해결:**
1. `.env` 파일의 `TOKEN_PASSPHRASE` 확인
2. `claude_desktop_config.json`의 `TOKEN_PASSPHRASE` 확인
3. 두 값이 동일한지 확인

### 문제 3: "No cached credentials"

**원인:** 서버 인증 정보가 추가되지 않음

**해결:**
```bash
# 캐시된 서버 목록 확인
curl -H "Authorization: Bearer $MCP_JWT_TOKEN" \
     http://127.0.0.1:4000/auth/list-servers

# 서버 추가
curl -X POST http://127.0.0.1:4000/auth/add-server ...
```

### 문제 4: Wrapper 로그 확인

Wrapper의 로그는 stderr로 출력됩니다:

```bash
# Claude Code 로그 확인
tail -f ~/Library/Logs/Claude/mcp*.log
```

## 📋 서버별 명령 규칙 설정

서버마다 다른 명령 규칙을 적용할 수 있습니다.

**예: 프로덕션 서버는 읽기 전용**

```bash
# rules/prod-server.example.com.json
cat > rules/prod-server.example.com.json << 'EOF'
{
  "allowedCommands": [
    "kubectl get",
    "kubectl describe",
    "docker ps",
    "docker logs"
  ],
  "blockedPatterns": [
    "rm",
    "delete",
    "kill",
    "shutdown"
  ]
}
EOF
```

규칙은 자동으로 hot-reload됩니다 (서버 재시작 불필요).

## 🔐 보안 권장사항

### 1. TOKEN_PASSPHRASE 보안

```bash
# 강력한 passphrase 생성
openssl rand -hex 32

# .env 파일 권한 제한
chmod 600 .env
```

### 2. JWT_SECRET_KEY 보안

```bash
# 강력한 비밀키 생성
openssl rand -hex 64
```

### 3. SSH 키 권한

```bash
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
```

### 4. 프로덕션 환경

```env
# .env (프로덕션)
NODE_ENV=production
LOG_LEVEL=warn
TOKEN_PASSPHRASE=<strong-passphrase>
JWT_SECRET_KEY=<strong-secret>
```

## 🎨 고급 사용법

### JWT 토큰 자동 갱신

```bash
# Cron에 등록 (25분마다 갱신)
crontab -e

# 추가
*/25 * * * * /home/user/local-ssh-mcp/scripts/auto-refresh-jwt.sh
```

### 여러 MCP 서버 실행

포트를 다르게 하여 여러 인스턴스 실행:

```json
{
  "mcpServers": {
    "ssh-prod": {
      "command": "node",
      "args": ["/path/to/mcp-stdio-wrapper.js"],
      "env": {
        "MCP_SERVER_URL": "http://127.0.0.1:4000",
        "TOKEN_PASSPHRASE": "prod-passphrase"
      }
    },
    "ssh-dev": {
      "command": "node",
      "args": ["/path/to/mcp-stdio-wrapper.js"],
      "env": {
        "MCP_SERVER_URL": "http://127.0.0.1:4001",
        "TOKEN_PASSPHRASE": "dev-passphrase"
      }
    }
  }
}
```

## 📊 작동 확인

### 1. Wrapper 테스트

```bash
# 수동으로 wrapper 테스트
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  TOKEN_PASSPHRASE="test-passphrase-12345" \
  MCP_SERVER_URL="http://127.0.0.1:4000" \
  node mcp-stdio-wrapper.js
```

예상 출력:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "ssh_exec",
        "description": "Execute SSH commands on remote servers with cached credentials",
        ...
      }
    ]
  }
}
```

### 2. 전체 플로우 테스트

```bash
# 1. 서버 실행 확인
curl http://127.0.0.1:4000/mcp/health

# 2. JWT 발급
export TOKEN=$(curl -s -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "test-passphrase-12345"}' \
  | jq -r '.jwt')

# 3. 서버 추가
curl -X POST http://127.0.0.1:4000/auth/add-server \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"host":"example.com","username":"ubuntu","password":"pass","port":22}'

# 4. tools/call 테스트
curl -X POST http://127.0.0.1:4000/mcp/jsonrpc \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "ssh_exec",
      "arguments": {
        "host": "example.com",
        "username": "ubuntu",
        "command": "ls -la"
      }
    }
  }'
```

## ❓ FAQ

### Q: JWT 토큰이 30분마다 만료되는데 괜찮나요?

A: Wrapper가 자동으로 갱신합니다. Claude Code 사용 중에는 투명하게 처리됩니다.

### Q: 비밀번호가 메모리에 저장되나요?

A: 네, 하지만:
- 로컬 메모리에만 저장 (네트워크 전송 없음)
- 서버 재시작 시 초기화
- JWT 만료 시 초기화

### Q: 여러 사용자가 사용할 수 있나요?

A: 이 서버는 단일 사용자용입니다. 여러 사용자가 사용하려면:
- 각 사용자가 별도 인스턴스 실행
- 포트를 다르게 설정

### Q: 프로덕션에서 사용해도 되나요?

A: 네, 하지만:
- 강력한 passphrase 사용
- NODE_ENV=production 설정
- 방화벽으로 4000 포트 보호
- 로그 레벨 조정 (warn/error)

## 🔗 관련 문서

- [README.md](./README.md) - 프로젝트 개요
- [CLAUDE.md](./CLAUDE.md) - 개발자 가이드
- [MCP Specification](https://modelcontextprotocol.io/specification) - 공식 스펙

## 📝 변경 이력

### v3.0.0 (2025-11-25)
- MCP JSON-RPC 2.0 프로토콜 지원
- Stdio wrapper 구현
- 멀티 서버 인증 정보 관리
- 서버별 명령 규칙
