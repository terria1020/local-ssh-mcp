# Local SSH MCP Server

**Claude Code를 위한 안전한 로컬 SSH MCP 서버**

Node.js + TypeScript 기반의 MCP(Model Context Protocol) 서버입니다. Claude Code가 원격 서버에 SSH로 접속하여 명령을 실행할 수 있도록 하되, SSH 인증 정보는 로컬 환경에서만 관리하여 외부 노출을 원천 차단합니다.

**Version**: 3.1.0 (MCP Protocol with Streamable HTTP/SSE + Command Validation Bypass)

---

## 📌 v3.1.0 주요 변경사항

| 항목 | v2.0.0 | v3.0.0 | v3.1.0 |
|------|--------|--------|--------|
| 프로토콜 | REST API | MCP (JSON-RPC 2.0) | MCP (JSON-RPC 2.0) |
| 인증 | JWT 토큰 | 세션 기반 (localhost 전용) | 세션 기반 (localhost 전용) |
| 자격증명 | 환경변수 (단일) | `credentials.json` (다중) | `credentials.json` (다중) |
| SSH 모드 | Ephemeral only | Ephemeral + Persistent | Ephemeral + Persistent |
| Claude Code 연동 | curl/스크립트 | MCP 네이티브 | MCP 네이티브 |
| 명령 검증 | ✅ 필수 | ✅ 필수 (규칙 기반) | ✅/⚠️ 선택 (`--dangerously-no-rules`) |

**v3.1.0 신규 기능:**
- ✨ `--dangerously-no-rules` 플래그: 명령 검증 비활성화
- 🔧 개발/테스트 환경을 위한 화이트리스트 제약 제거 옵션
- 📝 명령 실행 시 상세한 로깅 및 감사 추적

---

## 📌 프로젝트 목적

### 1. 🔒 보안 강화

기존 오픈소스 MCP 프로젝트들의 보안 우려를 해결합니다:

- ✅ SSH 키 파일은 로컬 파일시스템에만 존재
- ✅ 서버는 `127.0.0.1`에서만 리스닝 (외부 접근 차단)
- ✅ Origin 헤더 검증 (DNS rebinding 공격 방지)
- ✅ 화이트리스트/블랙리스트 기반 명령 필터링 (Hot-reload)
- ✅ 자격증명 파일 기반 관리 (`.gitignore` 처리)

### 2. 🎓 MCP 아키텍처 학습

이 프로젝트를 통해 다음을 학습할 수 있습니다:

- MCP (Model Context Protocol) 서버 구현
- JSON-RPC 2.0 over HTTP/SSE 통신
- Claude Code 네이티브 연동

### 3. 📚 Node.js + TypeScript 실무 예제

- **Express.js**: HTTP 서버 구축
- **TypeScript**: 타입 안전성
- **node-ssh**: SSH 클라이언트
- **Winston**: 구조화된 로깅

---

## 🚀 주요 기능

### MCP 도구 (Tools)

| 도구 | 설명 |
|------|------|
| `ssh_execute` | 원격 서버에서 SSH 명령 실행 |
| `ssh_list_credentials` | 등록된 자격증명 목록 조회 |
| `ssh_session_info` | SSH 세션 상태 조회 |

### 보안 기능

- **localhost 전용**: 127.0.0.1에서만 리스닝
- **Origin 검증**: DNS rebinding 공격 방지
- **명령 필터링**: 화이트리스트/블랙리스트 기반 검증 (기본값)
- **Hot-reload**: `rules.json` 변경 시 즉시 반영
- **명령 검증 우회** (선택): `--dangerously-no-rules` 플래그로 테스트 환경에서 제약 제거 가능

### SSH 연결 모드

| 모드 | 설명 |
|------|------|
| **Ephemeral** (기본) | 명령마다 새 연결 생성/종료 |
| **Persistent** | 연결 유지, cwd 추적, 5분 타임아웃 |

---

## 📦 기술 스택

| 카테고리 | 기술 | 용도 |
|---------|------|------|
| 런타임 | Node.js 18+ | JavaScript 실행 환경 |
| 언어 | TypeScript | 타입 안전성 |
| 웹 프레임워크 | Express.js | HTTP/SSE 서버 |
| SSH 클라이언트 | node-ssh | SSH 연결 및 명령 실행 |
| 로깅 | Winston | 구조화된 로깅 |
| 보안 | Helmet | 보안 헤더 설정 |

---

## 🛠️ 설치 및 설정

### 1. 의존성 설치

```bash
git clone https://github.com/terria1020/local-ssh-mcp.git
cd local-ssh-mcp
npm install
```

### 2. 자격증명 설정

```bash
cp credentials.example.json credentials.json
```

`credentials.json` 편집:

```json
{
  "version": "1.0",
  "credentials": [
    {
      "id": "my-server",
      "name": "My Production Server",
      "host": "server.example.com",
      "port": 22,
      "username": "ubuntu",
      "authType": "key",
      "privateKeyPath": "/Users/you/.ssh/id_rsa"
    },
    {
      "id": "dev-server",
      "name": "Development Server",
      "host": "dev.example.com",
      "port": 22,
      "username": "developer",
      "authType": "password",
      "password": "base64-encoded-password"
    }
  ]
}
```

**비밀번호 Base64 인코딩:**

```bash
echo -n "your-password" | base64
```

### 3. 환경변수 설정 (선택)

```bash
cp .env.example .env
```

`.env` 파일:

```env
PORT=4000
LOG_LEVEL=info
SESSION_TIMEOUT=300000
```

### 4. 빌드 및 실행

**일반 모드 (명령 검증 활성화 - 권장):**

```bash
# 빌드
npm run build

# 프로덕션 실행
npm start

# 개발 모드
npm run dev
```

**NO-RULES 모드 (명령 검증 비활성화 - 개발/테스트 환경만):**

```bash
# 개발 모드
npm run dev -- --dangerously-no-rules

# 프로덕션 모드
npm start -- --dangerously-no-rules

# 또는 직접 실행
node dist/index.js -- --dangerously-no-rules
```

> ⚠️ **보안 경고**: `--dangerously-no-rules` 모드는 모든 SSH 명령을 제약 없이 실행합니다. 신뢰할 수 있는 개발/테스트 환경에서만 사용하세요. 프로덕션 환경에서는 절대 사용하지 마세요.

### 5. 서버 확인

```bash
curl http://127.0.0.1:4000/mcp/health
```

---

## 🔗 Claude Code 연동 가이드

### 방법 1: HTTP/SSE 방식 (권장)

#### 1단계: MCP 서버 실행

```bash
cd /path/to/local-ssh-mcp
npm run build && npm start
```

서버가 `http://127.0.0.1:4000`에서 실행됩니다.

#### 2단계: Claude Code에 MCP 서버 등록

```bash
claude mcp add local-ssh --transport http http://127.0.0.1:4000/mcp
```

#### 3단계: 등록 확인

```bash
claude mcp list
```

출력 예시:

```
local-ssh: http://127.0.0.1:4000/mcp (connected)
  Tools: ssh_execute, ssh_list_credentials, ssh_session_info
```

#### 연결 상태 확인

`/mcp` 명령으로 MCP 서버 상태를 확인할 수 있습니다:

```
┌─────────────────────────────────────────────────────────────┐
│ Local-ssh MCP Server                                        │
│                                                             │
│ Status: ✔ connected                                         │
│ Auth: ✘ not authenticated  ← 정상 (OAuth 미사용)            │
│ URL: http://127.0.0.1:4000/mcp                              │
│ Tools: 3 tools                                              │
└─────────────────────────────────────────────────────────────┘
```

> **참고**: `Auth: ✘ not authenticated`는 정상입니다. 이 서버는 localhost 전용이므로 OAuth 인증을 사용하지 않습니다.

### 방법 2: 수동 설정 (.mcp.json)

`~/.claude/.mcp.json` 또는 프로젝트 루트의 `.mcp.json`:

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

### MCP 서버 관리

```bash
# 서버 목록
claude mcp list

# 서버 제거
claude mcp remove local-ssh

# 서버 재연결
claude mcp add local-ssh --transport http http://127.0.0.1:4000/mcp
```

---

## 💡 Claude Code 사용 시나리오

### 기본 사용법

Claude Code에서 자연어로 요청하면 자동으로 MCP 도구를 사용합니다:

#### 시나리오 1: 파드 상태 확인

**사용자:**

```
my-server에서 kubectl get pods 실행해줘
```

**Claude:**

```
파드 상태를 확인하겠습니다.
[ssh_execute 도구 사용: credentialId="my-server", command="kubectl get pods"]
```

#### 시나리오 2: 자격증명 목록 조회

**사용자:**

```
등록된 SSH 서버 목록을 보여줘
```

**Claude:**

```
[ssh_list_credentials 도구 사용]

등록된 서버 목록:
1. my-server (server.example.com) - ubuntu
2. dev-server (dev.example.com) - developer
```

#### 시나리오 3: 여러 서버 확인

**사용자:**

```
my-server와 dev-server의 디스크 사용량을 비교해줘
```

**Claude:**

```
두 서버의 디스크 사용량을 확인하겠습니다.
[두 서버에 df -h 실행 후 결과 비교 분석]
```

### 고급 사용법

#### Persistent 세션 모드

```
my-server에서 persistent 모드로:
1. cd /var/log
2. ls -la
3. tail -n 50 syslog
```

Persistent 모드에서는 작업 디렉토리(cwd)가 유지됩니다.

#### 로그 분석

```
dev-server의 nginx 에러 로그에서 최근 500 에러를 찾아 분석해줘
```

#### 리소스 모니터링

```
my-server의 메모리 사용량이 높은 프로세스 상위 10개를 보여줘
```

---

## 📡 MCP 프로토콜

### 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | /mcp | JSON-RPC 2.0 요청 |
| GET | /mcp | SSE 스트림 |
| DELETE | /mcp | 세션 종료 |
| GET | /mcp/health | 헬스 체크 |

### MCP 메소드

| 메소드 | 설명 |
|--------|------|
| `initialize` | 클라이언트 핸드셰이크 |
| `initialized` | 초기화 완료 알림 |
| `ping` | 연결 확인 |
| `tools/list` | 사용 가능한 도구 목록 |
| `tools/call` | 도구 실행 |

### 수동 테스트

```bash
# MCP 테스트 스크립트
./scripts/test-mcp.sh

# 또는 수동으로
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

---

## ⚙️ 설정 파일

### credentials.json

SSH 자격증명 저장 (gitignore 처리됨):

```json
{
  "version": "1.0",
  "credentials": [
    {
      "id": "server-id",
      "name": "서버 이름",
      "host": "hostname",
      "port": 22,
      "username": "user",
      "authType": "key",
      "privateKeyPath": "/path/to/key",
      "passphrase": "base64-encoded"
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✅ | 고유 식별자 (소문자, 숫자, 하이픈) |
| `name` | ✅ | 표시 이름 |
| `host` | ✅ | 호스트명 또는 IP |
| `port` | ✅ | SSH 포트 (기본: 22) |
| `username` | ✅ | SSH 사용자명 |
| `authType` | ✅ | `key` 또는 `password` |
| `privateKeyPath` | key일 때 | SSH 키 파일 경로 |
| `passphrase` | 선택 | 키 패스프레이즈 (base64) |
| `password` | password일 때 | SSH 비밀번호 (base64) |

### rules.json

명령 필터링 규칙 (Hot-reload 지원):

```json
{
  "allowedCommands": [
    "kubectl",
    "docker",
    "ls",
    "cat",
    "grep"
  ],
  "blockedPatterns": [
    "rm -rf",
    "shutdown",
    "reboot"
  ]
}
```

**검증 우회 옵션:**

기본적으로 `rules.json`에 정의된 규칙으로 모든 명령을 검증합니다. 개발/테스트 환경에서 검증을 완전히 비활성화하려면 서버 실행 시 `--dangerously-no-rules` 플래그를 사용하세요:

```bash
npm run dev -- --dangerously-no-rules
```

이 모드에서는:
- ✅ 모든 SSH 명령이 제약 없이 실행됨
- 📝 명령 실행이 `[NO-RULES MODE]` 접두어로 로깅됨
- ⚠️ 서버 시작 시 명확한 경고 메시지 표시

**사용 사례:**
- 새로운 명령어 테스트
- 화이트리스트 미리 정의가 어려운 경우
- CI/CD 파이프라인 실험

---

## 📂 프로젝트 구조

```
local-ssh-mcp/
├── src/
│   ├── index.ts                    # 서버 엔트리포인트
│   ├── routes/
│   │   ├── mcp-transport.ts        # MCP HTTP 트랜스포트
│   │   ├── mcp-handlers.ts         # MCP 메소드 핸들러
│   │   ├── mcp-tools.ts            # MCP 도구 구현
│   │   └── mcp.ts                  # 헬스/상태 엔드포인트
│   ├── services/
│   │   ├── ssh-manager.ts          # SSH 실행
│   │   ├── session-manager.ts      # 세션 관리
│   │   └── credential-manager.ts   # 자격증명 관리
│   ├── middleware/
│   │   ├── origin-validator.ts     # Origin 검증
│   │   └── validator.ts            # 명령 검증
│   ├── utils/
│   │   ├── logger.ts               # Winston 로거
│   │   ├── json-rpc.ts             # JSON-RPC 유틸리티
│   │   └── base64.ts               # Base64 인코딩
│   └── types/
│       ├── index.ts                # 레거시 타입
│       ├── mcp.ts                  # MCP 타입
│       └── credentials.ts          # 자격증명 타입
├── scripts/
│   └── test-mcp.sh                 # MCP 테스트 스크립트
├── credentials.json                # SSH 자격증명 (gitignore)
├── credentials.example.json        # 자격증명 예시
├── credentials.schema.json         # JSON 스키마
├── rules.json                      # 명령 필터링 규칙
├── .mcp.json.example               # Claude Code 설정 예시
└── CLAUDE.md                       # Claude Code 가이드
```

---

## 🔧 개발 명령어

```bash
npm run build    # TypeScript 컴파일
npm start        # 프로덕션 실행
npm run dev      # 개발 모드 (ts-node)
npm run watch    # TypeScript watch 모드
npm run clean    # dist/ 삭제
```

---

## 🔒 보안 권장사항

### 1. SSH 키 권한 설정

```bash
chmod 600 ~/.ssh/id_rsa
```

### 2. credentials.json 권한 설정

```bash
chmod 600 credentials.json
```

### 3. 명령 검증 활성화 (필수)

프로덕션 환경에서는 항상 명령 검증을 활성화하세요. `--dangerously-no-rules` 플래그를 **절대 사용하지 마세요**.

```bash
# ✅ 프로덕션 (검증 활성화 - 기본값)
npm start

# ❌ 프로덕션 (검증 비활성화 - 금지)
npm start -- --dangerously-no-rules
```

`--dangerously-no-rules` 모드는:
- ⚠️ 모든 SSH 명령을 제약 없이 실행
- ❌ 악의적인 명령어 실행 방지 불가
- ❌ 시스템 손상, 데이터 유출 위험
- 🚫 **프로덕션 환경 사용 금지**

### 4. NO-RULES 모드 사용 가이드

`--dangerously-no-rules`는 오직 다음 환경에서만 사용하세요:
- ✅ 개인 개발 머신
- ✅ 신뢰할 수 있는 내부 테스트 환경
- ✅ 격리된 네트워크 (외부 접근 불가)
- ❌ 프로덕션 환경
- ❌ 다중 사용자 환경
- ❌ 외부 네트워크 노출 환경

### 5. 프로덕션 환경

```env
NODE_ENV=production
LOG_LEVEL=warn
# dangerously-no-rules 플래그 사용 금지
```

---

## 🐛 문제 해결

### MCP 서버 연결 실패

1. 서버가 실행 중인지 확인:

```bash
curl http://127.0.0.1:4000/mcp/health
```

2. 서버 재시작:

```bash
npm run build && npm start
```

3. Claude Code에서 재연결:

```bash
claude mcp remove local-ssh
claude mcp add local-ssh --transport http http://127.0.0.1:4000/mcp
```

### "Credential not found" 오류

`credentials.json`에 해당 `id`가 있는지 확인:

```bash
cat credentials.json | jq '.credentials[].id'
```

### "Command validation failed" 오류

`rules.json`에서 명령어를 허용 목록에 추가:

```json
{
  "allowedCommands": [
    "your-command-here"
  ]
}
```

파일 저장 시 자동 반영 (서버 재시작 불필요)

### SSH 연결 실패

1. 수동 SSH 테스트:

```bash
ssh -i ~/.ssh/id_rsa user@host
```

2. 키 파일 경로 확인 (`credentials.json`)

3. 디버그 로그 활성화:

```bash
LOG_LEVEL=debug npm run dev
```

---

## 📝 로그 확인

```bash
# 실시간 로그
tail -f logs/combined.log

# 에러 로그만
tail -f logs/error.log
```

로그 레벨 변경 (`.env`):

```env
LOG_LEVEL=debug  # error, warn, info, debug
```

---

## 📧 문의 및 지원

- **Issues**: [GitHub Issues](https://github.com/terria1020/local-ssh-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/terria1020/local-ssh-mcp/discussions)
