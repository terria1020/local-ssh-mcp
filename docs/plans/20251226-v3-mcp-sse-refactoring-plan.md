# Local SSH MCP Server v3.0.0 - 리팩토링 계획

**작성일**: 2025-12-26
**버전**: v2.0.0 → v3.0.0
**목표**: Claude Code MCP 공식 프로토콜 완전 호환

## 목표

1. JWT 인증 제거 및 MCP 프로토콜 기반 인증으로 전환
2. Claude Code MCP Streamable HTTP/SSE transport 완전 구현
3. 파일 기반 멀티 SSH 자격증명 시스템 구현
4. 세션 기반 다중 명령어 실행 기능 구현

## 작업 범위

### 삭제할 파일

- `src/middleware/auth.ts` - JWT 인증 미들웨어
- `src/utils/jwt.ts` - JWT 유틸리티
- `src/routes/auth.ts` - JWT 발급 엔드포인트

### 수정할 파일

- `src/index.ts` - 서버 설정, 미들웨어 체인 변경
- `src/routes/mcp.ts` - MCP 프로토콜 엔드포인트로 완전 재작성
- `src/services/ssh-manager.ts` - 세션 풀링 및 멀티 자격증명 지원
- `src/middleware/validator.ts` - MCP tool 호출 검증으로 변경
- `src/types/index.ts` - MCP 프로토콜 타입 추가
- `rules.json` - 명령어 규칙 유지 (구조 동일)
- `package.json` - 의존성 변경

### 생성할 파일

- `src/routes/mcp-transport.ts` - MCP Streamable HTTP/SSE transport
- `src/services/session-manager.ts` - SSH 세션 풀 관리
- `src/services/credential-manager.ts` - 멀티 SSH 자격증명 관리
- `src/types/mcp.ts` - MCP 프로토콜 전용 타입
- `credentials.json` - SSH 자격증명 파일 (gitignore 대상)
- `credentials.example.json` - 자격증명 예시 파일

## 구현 방안

### 1. MCP Streamable HTTP/SSE Transport 구현

#### 1.1 프로토콜 버전

```
MCP-Protocol-Version: 2025-11-25
```

#### 1.2 필수 엔드포인트

| 엔드포인트 | 메소드 | 목적 |
|-----------|--------|------|
| `/mcp` | POST | JSON-RPC 요청 수신 (initialize, tools/list, tools/call) |
| `/mcp` | GET | SSE 스트림 열기 (서버→클라이언트 알림) |
| `/mcp` | DELETE | 세션 종료 |

#### 1.3 JSON-RPC 2.0 메시지 형식

**요청**:

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": {
      "name": "claude-code",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

**응답**:

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

#### 1.4 구현할 MCP 메소드

| 메소드 | 설명 |
|--------|------|
| `initialize` | 핸드셰이크, 세션 생성, capabilities 교환 |
| `initialized` | 클라이언트 초기화 완료 알림 (notification) |
| `tools/list` | 사용 가능한 SSH 도구 목록 반환 |
| `tools/call` | SSH 명령 실행 |
| `ping` | 연결 상태 확인 |

#### 1.5 SSE 스트림 구현

```typescript
// GET /mcp - SSE 스트림
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'MCP-Session-Id': sessionId
});

// 이벤트 전송
res.write(`id: ${eventId}\n`);
res.write(`event: message\n`);
res.write(`data: ${JSON.stringify(notification)}\n\n`);
```

#### 1.6 세션 관리

- `MCP-Session-Id` 헤더로 세션 식별
- 세션별 SSH 연결 풀 유지
- 세션 타임아웃: 30분 (비활성 시)
- 세션당 최대 SSH 연결: 5개

### 2. JWT 인증 제거 및 대체

#### 2.1 인증 전략 변경

| 기존 (v2.0.0) | 신규 (v3.0.0) |
|--------------|--------------|
| JWT Bearer 토큰 | MCP 세션 기반 |
| 30분 만료 | 세션 타임아웃 |
| TOKEN_PASSPHRASE 검증 | localhost 바인딩만으로 보안 |

#### 2.2 보안 계층 (v3.0.0)

1. **네트워크 격리**: `127.0.0.1:4000` 전용 바인딩
2. **Origin 검증**: HTTP Origin 헤더 검증 (DNS rebinding 방지)
3. **명령어 검증**: 기존 whitelist/blacklist 유지
4. **SSH 자격증명 보호**: credentials.json 파일 기반

### 3. 멀티 SSH 자격증명 시스템

#### 3.1 자격증명 파일 형식 (`credentials.json`)

```json
{
  "version": "1.0",
  "credentials": [
    {
      "id": "prod-k8s",
      "name": "Production Kubernetes",
      "host": "k8s.example.com",
      "port": 22,
      "username": "ubuntu",
      "authType": "key",
      "privateKeyPath": "/Users/you/.ssh/id_rsa",
      "passphrase": "YmFzZTY0X2VuY29kZWRfcGFzc3BocmFzZQ=="
    },
    {
      "id": "dev-server",
      "name": "Development Server",
      "host": "dev.example.com",
      "port": 22,
      "username": "admin",
      "authType": "password",
      "password": "YmFzZTY0X2VuY29kZWRfcGFzc3dvcmQ="
    }
  ]
}
```

#### 3.2 base64 인코딩 필드

| 필드 | 인코딩 | 이유 |
|------|--------|------|
| `passphrase` | base64 | SSH 키 패스프레이즈 보호 |
| `password` | base64 | SSH 비밀번호 보호 |

#### 3.3 핫 리로드 구현

```typescript
// fs.watch로 파일 변경 감지
fs.watch('credentials.json', (eventType) => {
  if (eventType === 'change') {
    reloadCredentials();
    logger.info('Credentials reloaded');
  }
});
```

#### 3.4 자격증명 선택 방식

MCP tool 호출 시 `credentialId` 파라미터로 선택:

```json
{
  "method": "tools/call",
  "params": {
    "name": "ssh_execute",
    "arguments": {
      "credentialId": "prod-k8s",
      "command": "kubectl get pods"
    }
  }
}
```

### 4. 다중 명령어 세션 (Non-Ephemeral)

#### 4.1 세션 설계

| 항목 | 설정 |
|-----|------|
| 기본 모드 | Ephemeral (단일 명령) |
| 세션 모드 | Non-Ephemeral (다중 명령) |
| 세션당 최대 명령어 | 5개 |
| 세션 타임아웃 | 5분 (비활성 시) |
| SSH 연결 유지 | 세션 종료까지 |

#### 4.2 세션 생성 조건

1. `tools/call` 요청 시 `sessionMode: "persistent"` 파라미터
2. 동일 `credentialId`에 대한 연속 요청
3. 명령어 유사도 기반 자동 판단 (선택적)

#### 4.3 세션 풀 구조

```typescript
interface SSHSession {
  id: string;
  credentialId: string;
  connection: NodeSSH;
  createdAt: Date;
  lastUsedAt: Date;
  commandCount: number;
  maxCommands: number;
  cwd: string; // 현재 작업 디렉토리 유지
}

class SessionPool {
  sessions: Map<string, SSHSession>;
  maxSessionsPerCredential: number = 3;
  sessionTimeout: number = 300000; // 5분
}
```

#### 4.4 작업 디렉토리 유지

- 세션 모드에서 `cd` 명령 효과 유지
- 각 세션별 `cwd` 상태 저장
- 명령 실행 시 `cwd` 기준으로 실행

```typescript
// 세션 모드 명령 실행
async executeInSession(sessionId: string, command: string) {
  const session = this.sessions.get(sessionId);
  const result = await session.connection.execCommand(command, {
    cwd: session.cwd
  });

  // cd 명령 감지 및 cwd 업데이트
  if (command.startsWith('cd ')) {
    session.cwd = extractNewCwd(command, session.cwd);
  }

  return result;
}
```

### 5. MCP Tool 정의

#### 5.1 ssh_execute (기본 도구)

```json
{
  "name": "ssh_execute",
  "description": "Execute SSH command on remote server",
  "inputSchema": {
    "type": "object",
    "properties": {
      "credentialId": {
        "type": "string",
        "description": "ID of SSH credential to use"
      },
      "command": {
        "type": "string",
        "description": "Command to execute"
      },
      "sessionMode": {
        "type": "string",
        "enum": ["ephemeral", "persistent"],
        "default": "ephemeral"
      }
    },
    "required": ["credentialId", "command"]
  }
}
```

#### 5.2 ssh_list_credentials (자격증명 조회)

```json
{
  "name": "ssh_list_credentials",
  "description": "List available SSH credentials",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

#### 5.3 ssh_session_info (세션 정보)

```json
{
  "name": "ssh_session_info",
  "description": "Get current SSH session information",
  "inputSchema": {
    "type": "object",
    "properties": {
      "credentialId": {
        "type": "string"
      }
    }
  }
}
```

## 작업 단계

### Phase 1: 기반 구조 변경

- [ ] Step 1.1: JWT 관련 코드 제거 (`auth.ts`, `jwt.ts`, 환경변수)
- [ ] Step 1.2: MCP 타입 정의 (`src/types/mcp.ts`)
- [ ] Step 1.3: JSON-RPC 2.0 파서/빌더 유틸리티 구현

### Phase 2: MCP Transport 구현

- [ ] Step 2.1: MCP 엔드포인트 라우터 생성 (`/mcp` POST/GET/DELETE)
- [ ] Step 2.2: `initialize` 핸드셰이크 구현
- [ ] Step 2.3: `tools/list` 구현
- [ ] Step 2.4: `tools/call` 기본 구현 (ephemeral)
- [ ] Step 2.5: SSE 스트림 구현 (GET `/mcp`)
- [ ] Step 2.6: Origin 헤더 검증 미들웨어

### Phase 3: 멀티 자격증명

- [ ] Step 3.1: `credentials.json` 스키마 및 예시 파일 생성
- [ ] Step 3.2: `CredentialManager` 클래스 구현
- [ ] Step 3.3: base64 인코딩/디코딩 유틸리티
- [ ] Step 3.4: 파일 핫 리로드 (fs.watch)
- [ ] Step 3.5: `ssh_list_credentials` tool 구현

### Phase 4: 세션 관리

- [ ] Step 4.1: `SessionManager` 클래스 구현
- [ ] Step 4.2: SSH 연결 풀링 로직
- [ ] Step 4.3: 세션 타임아웃 및 정리 로직
- [ ] Step 4.4: 작업 디렉토리(cwd) 유지 로직
- [ ] Step 4.5: `tools/call` persistent 모드 구현
- [ ] Step 4.6: `ssh_session_info` tool 구현

### Phase 5: 통합 및 테스트

- [ ] Step 5.1: 기존 validator.ts MCP tool 호출용으로 수정
- [ ] Step 5.2: index.ts 서버 설정 업데이트
- [ ] Step 5.3: 헬퍼 스크립트 업데이트 또는 제거
- [ ] Step 5.4: Claude Code 연동 테스트
- [ ] Step 5.5: 문서 업데이트 (README, CLAUDE.md)

### Phase 6: 정리

- [ ] Step 6.1: 불필요한 의존성 제거 (`jsonwebtoken`)
- [ ] Step 6.2: 환경변수 정리 (JWT 관련 제거)
- [ ] Step 6.3: 로깅 업데이트
- [ ] Step 6.4: 버전 3.0.0 태깅

## 환경변수 변경

### 제거

```
TOKEN_PASSPHRASE
JWT_SECRET_KEY
JWT_ISSUER
```

### 유지

```
SSH_KEY_PATH (기본값으로 사용, credentials.json이 우선)
SSH_PASSPHRASE (기본값으로 사용)
PORT
LOG_LEVEL
NODE_ENV
```

### 추가

```
CREDENTIALS_FILE=./credentials.json
SESSION_TIMEOUT=300000
MAX_COMMANDS_PER_SESSION=5
MCP_PROTOCOL_VERSION=2025-11-25
```

## 파일 구조 (v3.0.0)

```
src/
├── index.ts                    # Express 서버 설정
├── routes/
│   └── mcp-transport.ts        # MCP Streamable HTTP/SSE transport
├── middleware/
│   ├── origin-validator.ts     # Origin 헤더 검증
│   └── command-validator.ts    # 명령어 검증 (기존 validator.ts 리네임)
├── services/
│   ├── ssh-manager.ts          # SSH 실행 (수정)
│   ├── session-manager.ts      # SSH 세션 풀 관리 (신규)
│   └── credential-manager.ts   # 멀티 자격증명 관리 (신규)
├── utils/
│   ├── logger.ts               # Winston 로거 (유지)
│   ├── json-rpc.ts             # JSON-RPC 2.0 유틸리티 (신규)
│   └── base64.ts               # base64 인코딩 유틸리티 (신규)
└── types/
    ├── index.ts                # 기존 타입 (수정)
    └── mcp.ts                  # MCP 프로토콜 타입 (신규)

credentials.json                # SSH 자격증명 (gitignore)
credentials.example.json        # 자격증명 예시
rules.json                      # 명령어 규칙 (유지)
```

## 위험 요소 및 대응

| 위험 | 영향 | 대응 |
|-----|-----|------|
| MCP 프로토콜 호환성 | Claude Code 연동 실패 | 공식 스펙 준수, 단계별 테스트 |
| 세션 메모리 누수 | 서버 리소스 고갈 | 타임아웃 자동 정리, 최대 세션 제한 |
| 자격증명 파일 노출 | 보안 사고 | gitignore, 파일 권한 600 |
| 핫 리로드 경합 조건 | 자격증명 불일치 | 리로드 중 락 처리 |

## 참고 자료

- [MCP Specification - Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Claude Code MCP Documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

## 상세 태스크 문서

### 공통 규칙

- [00-CLARIFY-common-rules.md](./00-CLARIFY-common-rules.md) - 공통 규칙 및 검증 기준
- [00-VERIFICATION-RESULT.md](./00-VERIFICATION-RESULT.md) - 일관성 검증 결과

### Phase 1: 기반 구조 변경

| 태스크 | 파일 | 설명 |
|-------|-----|------|
| [TASK-01-01](./TASK-01-01-remove-jwt.md) | - | JWT 인증 코드 제거 |
| [TASK-01-02](./TASK-01-02-mcp-types.md) | `src/types/mcp.ts` | MCP 프로토콜 타입 정의 |
| [TASK-01-03](./TASK-01-03-jsonrpc-utils.md) | `src/utils/json-rpc.ts` | JSON-RPC 2.0 유틸리티 |

### Phase 2: MCP Transport 구현

| 태스크 | 파일 | 설명 |
|-------|-----|------|
| [TASK-02-01](./TASK-02-01-mcp-router.md) | `src/routes/mcp-transport.ts` | MCP 엔드포인트 라우터 |
| [TASK-02-02](./TASK-02-02-mcp-handlers.md) | `src/routes/mcp-handlers.ts` | MCP 메소드 핸들러 |
| [TASK-02-03](./TASK-02-03-origin-validator.md) | `src/middleware/origin-validator.ts` | Origin 헤더 검증 |

### Phase 3: 멀티 자격증명

| 태스크 | 파일 | 설명 |
|-------|-----|------|
| [TASK-03-01](./TASK-03-01-credentials-schema.md) | `credentials.*.json` | 자격증명 스키마 정의 |
| [TASK-03-02](./TASK-03-02-credential-manager.md) | `src/services/credential-manager.ts` | CredentialManager 구현 |
| [TASK-03-03](./TASK-03-03-integrate-credentials.md) | `src/routes/mcp-tools.ts` | 자격증명 시스템 통합 |

### Phase 4: 세션 관리

| 태스크 | 파일 | 설명 |
|-------|-----|------|
| [TASK-04-01](./TASK-04-01-session-manager.md) | `src/services/session-manager.ts` | SessionManager 구현 |
| [TASK-04-02](./TASK-04-02-integrate-sessions.md) | `src/routes/mcp-tools.ts` | 세션 시스템 통합 |

### Phase 5: 통합 및 테스트

| 태스크 | 파일 | 설명 |
|-------|-----|------|
| [TASK-05-01](./TASK-05-01-server-integration.md) | `src/index.ts` | 서버 통합 |
| [TASK-05-02](./TASK-05-02-claude-code-test.md) | - | Claude Code 연동 테스트 |

### Phase 6: 정리

| 태스크 | 파일 | 설명 |
|-------|-----|------|
| [TASK-06-01](./TASK-06-01-cleanup.md) | - | 정리 및 버전 릴리스 |

## 승인 체크리스트

- [ ] 아키텍처 변경 승인
- [ ] 보안 모델 변경 승인 (JWT → 세션 기반)
- [ ] 멀티 자격증명 파일 형식 승인
- [ ] 세션 설정값 (타임아웃, 최대 명령어) 승인
