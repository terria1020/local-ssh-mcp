# TASK-05-02: Claude Code 연동 테스트

**Phase**: 5 (통합 및 테스트)
**의존성**: TASK-05-01
**산출물**: 테스트 결과 문서, `.mcp.json` 예시

## 목표

완성된 MCP 서버를 Claude Code에 연동하고 전체 기능을 테스트합니다.

## 상세 작업

### 2.1 Claude Code에 서버 등록

```bash
# 서버 시작
npm run dev

# Claude Code에 등록
claude mcp add --transport http local-ssh http://127.0.0.1:4000/mcp
```

### 2.2 .mcp.json 예시 생성

프로젝트 루트에 `.mcp.json.example` 생성:

```json
{
  "mcpServers": {
    "local-ssh": {
      "type": "http",
      "url": "http://127.0.0.1:4000/mcp"
    }
  }
}
```

### 2.3 테스트 시나리오

#### 시나리오 1: MCP 핸드셰이크

```bash
# curl로 직접 테스트
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

**예상 응답**:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "local-ssh-mcp",
      "version": "3.0.0"
    }
  },
  "id": 1
}
```

#### 시나리오 2: Tool 목록 조회

```bash
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "MCP-Session-Id: <session-id-from-initialize>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }'
```

**예상 응답**:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "ssh_execute",
        "description": "Execute SSH command...",
        "inputSchema": { ... }
      },
      {
        "name": "ssh_list_credentials",
        "description": "List available SSH credentials...",
        "inputSchema": { ... }
      },
      {
        "name": "ssh_session_info",
        "description": "Get session information...",
        "inputSchema": { ... }
      }
    ]
  },
  "id": 2
}
```

#### 시나리오 3: 자격증명 목록

```bash
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "ssh_list_credentials",
      "arguments": {}
    },
    "id": 3
  }'
```

#### 시나리오 4: SSH 명령 실행 (Ephemeral)

```bash
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "ssh_execute",
      "arguments": {
        "credentialId": "my-server",
        "command": "ls -la",
        "sessionMode": "ephemeral"
      }
    },
    "id": 4
  }'
```

#### 시나리오 5: SSH 세션 (Persistent)

```bash
# 1. cd 명령
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "ssh_execute",
      "arguments": {
        "credentialId": "my-server",
        "command": "cd /var/log",
        "sessionMode": "persistent"
      }
    },
    "id": 5
  }'

# 2. ls 명령 (cwd 유지 확인)
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "ssh_execute",
      "arguments": {
        "credentialId": "my-server",
        "command": "pwd && ls",
        "sessionMode": "persistent"
      }
    },
    "id": 6
  }'
```

#### 시나리오 6: SSE 스트림

```bash
curl -N http://127.0.0.1:4000/mcp \
  -H "Accept: text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "MCP-Session-Id: <session-id>"
```

#### 시나리오 7: 명령어 차단

```bash
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "ssh_execute",
      "arguments": {
        "credentialId": "my-server",
        "command": "rm -rf /"
      }
    },
    "id": 7
  }'
```

**예상**: `isError: true`, 차단 메시지

#### 시나리오 8: Claude Code 내에서 테스트

```
# Claude Code 실행
claude

# MCP 상태 확인
/mcp

# Tool 사용
> local-ssh 서버에서 kubectl get pods 실행해줘
```

### 2.4 테스트 결과 기록

각 시나리오의 결과를 기록:

| 시나리오 | 예상 | 실제 | 통과 |
|---------|------|------|------|
| MCP 핸드셰이크 | 성공 | | |
| Tool 목록 | 3개 tool | | |
| 자격증명 목록 | 목록 반환 | | |
| Ephemeral 실행 | 성공 | | |
| Persistent 세션 | cwd 유지 | | |
| SSE 스트림 | 연결 유지 | | |
| 명령어 차단 | 차단됨 | | |
| Claude Code 연동 | 정상 동작 | | |

## 입력

- TASK-05-01 통합된 서버

## 출력

- Claude Code 연동 확인
- 테스트 결과 문서
- `.mcp.json.example` 파일

## 검증 기준

- [ ] Claude Code에 서버 등록 성공
- [ ] initialize 핸드셰이크 성공
- [ ] tools/list에서 3개 tool 반환
- [ ] ssh_list_credentials 동작
- [ ] ssh_execute ephemeral 동작
- [ ] ssh_execute persistent 동작 (cwd 유지)
- [ ] 명령어 차단 동작
- [ ] SSE 스트림 동작
- [ ] Claude Code에서 실제 사용 가능

## 참조

- CLARIFY: 섹션 8 (테스트 기준)
- 선행 태스크: TASK-05-01
- 후행 태스크: TASK-06-01
