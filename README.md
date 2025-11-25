# Local SSH MCP Server

**Claude Code를 위한 안전한 로컬 SSH 프록시 서버**

Node.js + TypeScript 기반의 로컬 전용 SSH 명령 실행 서버입니다. Claude Code가 원격 서버에 SSH로 접속하여 명령을 실행할 수 있도록 하되, SSH 인증 정보는 로컬 환경에서만 관리하여 외부 노출을 원천 차단합니다.

## 🎉 v3.0.0 주요 업데이트

### 새로운 기능
1. **MCP JSON-RPC 2.0 프로토콜 지원** 🎯
   - 표준 MCP 프로토콜 구현 (`tools/list`, `tools/call`)
   - JSON-RPC 2.0 기반 통신
   - 기존 REST API와 병행 지원

2. **멀티 서버 인증 정보 관리** 🔐
   - 여러 서버의 인증 정보를 메모리에 캐싱
   - 한 번 인증하면 JWT 만료 시까지 재사용
   - 비밀번호/SSH passphrase 자동 저장

3. **서버별 명령 규칙 관리** 📋
   - 서버마다 다른 화이트리스트/블랙리스트 적용 가능
   - `rules/{host}.json` 파일로 서버별 규칙 설정
   - `rules/default.json` 기본 규칙 사용

4. **향상된 보안 및 편의성** ✨
   - 인증 정보 중앙 관리 엔드포인트
   - SSH passphrase 캐싱 지원
   - 서버별 세밀한 권한 제어

---

## 📌 프로젝트 목적

이 프로젝트는 다음 세 가지 목적으로 개발되었습니다:

### 1. 🔒 보안 강화 (다른 오픈소스 MCP의 백도어 불안 해소)

기존 오픈소스 MCP 프로젝트들은 다음과 같은 보안 우려가 있습니다:
- SSH 키 파일이 외부 프로세스에 노출될 위험
- 인증 정보가 네트워크를 통해 전송될 가능성
- 신뢰할 수 없는 코드에 의한 백도어 설치 가능성

**Local SSH MCP는 이러한 문제를 해결합니다:**
- ✅ SSH 키 파일은 로컬 파일시스템에만 존재
- ✅ 서버는 `127.0.0.1`에서만 리스닝 (외부 접근 차단)
- ✅ JWT 기반 인증으로 무단 접근 방지
- ✅ 화이트리스트/블랙리스트 기반 명령 필터링
- ✅ 모든 코드가 공개되어 있어 투명한 검증 가능

### 2. 🎓 교육성 (MCP 아키텍처 학습)

이 프로젝트는 MCP(Model Context Protocol) 서버를 직접 구현하며 다음을 학습할 수 있습니다:
- REST API 기반 MCP 서버 설계 방법
- Claude Code와의 통신 방식
- 보안을 고려한 인증/인가 구현
- TypeScript + Express.js 실무 패턴

**학습 포인트:**
- MCP 서버는 반드시 복잡한 프로토콜을 따를 필요 없이 단순 REST API로도 구현 가능
- Claude Code는 Bash 도구를 통해 간접적으로 MCP 서버와 통신 가능
- 로컬 전용 서버 설계 시 보안 고려사항

### 3. 📚 학습성 (Node.js + TypeScript 실무 예제)

실무에서 자주 사용하는 기술 스택의 실전 예제로 활용할 수 있습니다:
- **Express.js**: REST API 서버 구축
- **TypeScript**: 타입 안전성과 개발 생산성 향상
- **JWT**: 토큰 기반 인증 구현
- **node-ssh**: SSH 클라이언트 라이브러리 사용
- **Winston**: 구조화된 로깅
- **dotenv**: 환경변수 관리 패턴

**실무 학습 자료:**
- 미들웨어 체이닝 패턴
- 에러 핸들링 베스트 프랙티스
- 환경 분리 (development/production)
- 보안 헤더 설정 (Helmet)
- 비동기 프로그래밍 패턴

---

## 🚀 주요 기능

### 보안 기능

- **JWT 인증**: Passphrase 기반 JWT 토큰 발급 (30분 유효)
- **명령 필터링**: 화이트리스트/블랙리스트 기반 명령 검증
- **로컬 전용**: 127.0.0.1에서만 리스닝, 외부 접근 차단
- **SSH 키 보호**: 키 파일 경로는 `.env`로만 관리, 코드에 하드코딩 금지
- **Hot-reload 룰**: `rules.json` 파일 변경 시 서버 재시작 없이 즉시 반영

### 지원하는 인증 방식

1. **SSH 키 기반 인증** (권장)
   - `~/.ssh/id_rsa` 등 로컬 SSH 키 파일 사용
   - Passphrase 보호 키 지원

2. **비밀번호 인증**
   - 요청별로 비밀번호 전송
   - 로컬호스트 내에서만 전송되므로 상대적으로 안전

### 명령 필터링 예시

**허용된 명령 (화이트리스트)**:
```
kubectl, docker, htop, ls, df, free, uptime, tail, grep,
cat /var/log, ps, top, netstat, ss, journalctl, systemctl status
```

**차단된 패턴 (블랙리스트)**:
```
rm -rf, shutdown, reboot, passwd, chmod 777, cat ~/.ssh,
mkfs, dd if=, curl | bash, nc -l, iptables, ufw, firewall-cmd
```

---

## 📦 기술 스택

| 카테고리 | 기술 | 용도 |
|---------|------|------|
| 런타임 | Node.js 18+ | JavaScript 실행 환경 |
| 언어 | TypeScript | 타입 안전성 |
| 웹 프레임워크 | Express.js | REST API 서버 |
| SSH 클라이언트 | node-ssh | SSH 연결 및 명령 실행 |
| 인증 | jsonwebtoken | JWT 토큰 생성/검증 |
| 로깅 | Winston | 구조화된 로깅 |
| 보안 | Helmet | 보안 헤더 설정 |
| 환경변수 | dotenv | 설정 관리 |

---

## 🛠️ 설치 및 설정

### 1. 의존성 설치

```bash
git clone https://github.com/terria1020/local-ssh-mcp.git
cd local-ssh-mcp
npm install
```

### 2. 환경변수 설정

`.env.example`을 복사하여 `.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일 편집 (v2.0.0 - JWT 인증):

```env
# 서버 포트
PORT=4000

# 환경 (development | production)
NODE_ENV=development

# SSH 인증 정보
SSH_KEY_PATH=/Users/your-username/.ssh/id_rsa
SSH_PASSPHRASE=your-ssh-key-passphrase  # SSH 키에 passphrase가 있는 경우만

# JWT 인증 설정 (v2.0.0)
TOKEN_PASSPHRASE=your-super-secret-passphrase-here  # JWT 토큰 발급용 passphrase
JWT_SECRET_KEY=your-jwt-secret-key-here              # JWT 서명용 비밀키
JWT_ISSUER=local-ssh-mcp                              # JWT 발급자

# 로그 레벨
LOG_LEVEL=info  # error, warn, info, debug
```

**보안 권장사항:**
```bash
# 강력한 passphrase 생성
openssl rand -hex 32

# 강력한 JWT 비밀키 생성
openssl rand -hex 64
```

### 3. TypeScript 컴파일

```bash
npm run build
```

### 4. 서버 실행

**프로덕션 모드:**
```bash
npm start
```

**개발 모드 (ts-node, 파일 변경 감지):**
```bash
npm run dev
```

**백그라운드 실행:**
```bash
nohup npm start > logs/server.log 2>&1 &
```

### 5. 서버 확인

```bash
curl http://127.0.0.1:4000/mcp/health
```

예상 응답:
```json
{
  "status": "ok",
  "timestamp": "2025-11-05T12:34:56.789Z",
  "uptime": 123.456,
  "sshKeyConfigured": true,
  "environment": {
    "nodeVersion": "v20.11.0",
    "platform": "darwin",
    "pid": 12345
  }
}
```

---

## 🔐 JWT 인증 사용법 (v2.0.0)

### 1단계: JWT 토큰 발급

서버에 passphrase를 전송하여 JWT 토큰을 발급받습니다:

```bash
curl -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "your-passphrase-from-env"}'
```

응답:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30m",
  "message": "JWT token issued successfully",
  "usage": {
    "shell": "export MCP_JWT_TOKEN=\"eyJhbGciOiJI...\"",
    "curl": "curl -H \"Authorization: Bearer eyJhbGciOiJI...\""
  }
}
```

### 2단계: Shell 환경변수 설정

발급받은 JWT 토큰을 환경변수로 저장:

```bash
# zsh 사용자 (macOS 기본)
echo 'export MCP_JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."' >> ~/.zshrc
source ~/.zshrc

# bash 사용자
echo 'export MCP_JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."' >> ~/.bashrc
source ~/.bashrc
```

**중요:**
- JWT 토큰은 30분 후 만료됨
- 만료 시 위 1단계로 재발급
- **절대 TOKEN_PASSPHRASE를 shell 파일에 저장하지 마세요** (보안 위험)

### 3단계: API 요청 시 JWT 사용

```bash
# 헬퍼 스크립트 사용 (자동으로 $MCP_JWT_TOKEN 사용)
./scripts/ssh-mcp-run.sh server.com ubuntu "kubectl get pods"

# 또는 직접 curl 사용
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MCP_JWT_TOKEN" \
  -d '{
    "host": "server.com",
    "username": "ubuntu",
    "command": "kubectl get pods"
  }'
```

---

## 📡 API 엔드포인트

### 1. `POST /auth` - JWT 토큰 발급

**요청:**
```json
{
  "token_passphrase": "your-passphrase-from-env"
}
```

**응답:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30m"
}
```

### 2. `GET /mcp/health` - 서버 상태 확인

인증 불필요

```bash
curl http://127.0.0.1:4000/mcp/health
```

### 3. `GET /mcp/status` - 상세 상태 확인

JWT 인증 필요

```bash
curl -H "Authorization: Bearer $MCP_JWT_TOKEN" \
     http://127.0.0.1:4000/mcp/status
```

### 4. `POST /mcp/run` - SSH 명령 실행

JWT 인증 필요

**요청 형식 (SSH 키 인증):**
```json
{
  "host": "server.example.com",
  "username": "ubuntu",
  "command": "kubectl get pods",
  "port": 22
}
```

**요청 형식 (비밀번호 인증):**
```json
{
  "host": "server.example.com",
  "username": "ubuntu",
  "password": "your-ssh-password",
  "command": "kubectl get pods",
  "port": 22
}
```

**응답 형식 (성공):**
```json
{
  "success": true,
  "result": {
    "stdout": "NAME   READY   STATUS    AGE\napp-1   1/1     Running   5m",
    "stderr": "",
    "exitCode": 0
  },
  "timestamp": "2025-11-05T12:34:56.789Z"
}
```

**응답 형식 (실패):**
```json
{
  "success": false,
  "error": "SSH connection failed: Connection timeout",
  "timestamp": "2025-11-05T12:34:56.789Z"
}
```

### 5. `POST /auth/add-server` - 서버 인증 정보 추가 (v3.0.0 신규)

JWT 인증 필요

서버 인증 정보를 캐시에 추가하여 이후 요청 시 재사용할 수 있습니다.

**요청 형식 (비밀번호 인증):**
```json
{
  "host": "server.example.com",
  "username": "ubuntu",
  "password": "your-ssh-password",
  "port": 22
}
```

**요청 형식 (SSH 키 + passphrase):**
```json
{
  "host": "server.example.com",
  "username": "ubuntu",
  "privateKeyPath": "/home/user/.ssh/id_rsa",
  "passphrase": "your-key-passphrase",
  "port": 22
}
```

**응답:**
```json
{
  "success": true,
  "result": {
    "message": "Credentials added successfully for ubuntu@server.example.com",
    "host": "server.example.com",
    "username": "ubuntu",
    "port": 22,
    "authMethod": "password",
    "cachedUntil": "Server restart or JWT expiration"
  }
}
```

### 6. `GET /auth/list-servers` - 캐시된 서버 목록 조회 (v3.0.0 신규)

JWT 인증 필요

```bash
curl -H "Authorization: Bearer $MCP_JWT_TOKEN" \
     http://127.0.0.1:4000/auth/list-servers
```

**응답:**
```json
{
  "success": true,
  "result": {
    "count": 2,
    "servers": [
      {
        "host": "server1.example.com",
        "username": "ubuntu",
        "port": 22,
        "privateKeyPath": "/home/user/.ssh/id_rsa",
        "addedAt": "2025-11-25T10:30:00.000Z"
      },
      {
        "host": "server2.example.com",
        "username": "admin",
        "port": 22,
        "addedAt": "2025-11-25T10:35:00.000Z"
      }
    ]
  }
}
```

### 7. `DELETE /auth/remove-server` - 서버 인증 정보 삭제 (v3.0.0 신규)

JWT 인증 필요

```bash
curl -X DELETE http://127.0.0.1:4000/auth/remove-server \
  -H "Authorization: Bearer $MCP_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"host": "server.example.com", "username": "ubuntu"}'
```

### 8. `POST /mcp/jsonrpc` - MCP JSON-RPC 2.0 엔드포인트 (v3.0.0 신규)

JWT 인증 필요

표준 MCP 프로토콜을 사용하여 SSH 명령을 실행합니다.

**tools/list 요청:**
```bash
curl -X POST http://127.0.0.1:4000/mcp/jsonrpc \
  -H "Authorization: Bearer $MCP_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

**응답:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "ssh_exec",
        "description": "Execute SSH commands on remote servers with cached credentials",
        "inputSchema": {
          "type": "object",
          "properties": {
            "host": {
              "type": "string",
              "description": "Target server hostname or IP address"
            },
            "username": {
              "type": "string",
              "description": "SSH username"
            },
            "command": {
              "type": "string",
              "description": "Command to execute on the remote server"
            },
            "port": {
              "type": "number",
              "description": "SSH port (default: 22)",
              "default": 22
            }
          },
          "required": ["host", "username", "command"]
        }
      }
    ]
  }
}
```

**tools/call 요청:**
```bash
curl -X POST http://127.0.0.1:4000/mcp/jsonrpc \
  -H "Authorization: Bearer $MCP_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "ssh_exec",
      "arguments": {
        "host": "server.example.com",
        "username": "ubuntu",
        "command": "kubectl get pods"
      }
    }
  }'
```

**응답 (성공):**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "NAME   READY   STATUS    AGE\napp-1   1/1     Running   5m\n\nExit Code: 0"
      }
    ],
    "isError": false
  }
}
```

---

## 📋 서버별 명령 규칙 관리 (v3.0.0)

v3.0.0부터 서버마다 다른 명령 규칙을 적용할 수 있습니다.

### 규칙 파일 구조

```
rules/
├── default.json          # 기본 규칙 (모든 서버에 적용)
├── prod-server.json      # prod-server 호스트 전용 규칙
└── dev-server.json       # dev-server 호스트 전용 규칙
```

### 규칙 우선순위

1. 서버 호스트명과 일치하는 파일 (`rules/{host}.json`)
2. 기본 규칙 파일 (`rules/default.json`)

### 규칙 파일 예시

**`rules/prod-server.json`** (프로덕션 서버 - 엄격한 규칙):
```json
{
  "allowedCommands": [
    "kubectl get",
    "kubectl describe",
    "docker ps",
    "docker logs",
    "systemctl status"
  ],
  "blockedPatterns": [
    "rm",
    "delete",
    "kill",
    "shutdown",
    "reboot"
  ]
}
```

**`rules/dev-server.json`** (개발 서버 - 느슨한 규칙):
```json
{
  "allowedCommands": [
    "kubectl",
    "docker",
    "npm",
    "yarn",
    "git",
    "ls",
    "cat",
    "grep"
  ],
  "blockedPatterns": [
    "rm -rf /",
    "shutdown"
  ]
}
```

### 규칙 적용 방식

- 화이트리스트 (`allowedCommands`): 명령어가 이 목록의 prefix와 일치해야 실행 가능
- 블랙리스트 (`blockedPatterns`): 명령어에 이 패턴이 포함되면 차단 (우선순위 높음)
- 파일 변경 시 자동 리로드 (서버 재시작 불필요)

---

## 🎯 Claude Code 연동 가이드

### 설정 방법

#### 1. MCP 서버 실행

터미널에서 MCP 서버를 실행합니다:

```bash
cd /path/to/local-ssh-mcp
npm run dev  # 또는 npm start
```

서버가 `http://127.0.0.1:4000`에서 실행됩니다.

#### 2. JWT 토큰 발급 및 환경변수 설정

JWT 토큰을 발급받고 Shell 설정 파일에 추가합니다:

**토큰 발급:**
```bash
curl -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "your-passphrase-from-env"}'
```

**bash 사용자:**
```bash
nano ~/.bashrc
```

파일 끝에 추가:
```bash
# SSH MCP Server Configuration (v2.0.0 - JWT)
export MCP_JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # 발급받은 토큰
export MCP_SERVER_URL="http://127.0.0.1:4000"

# 헬퍼 스크립트를 PATH에 추가
export PATH="$PATH:/path/to/local-ssh-mcp/scripts"
```

적용:
```bash
source ~/.bashrc
```

**zsh 사용자:**
```bash
nano ~/.zshrc
```

같은 내용 추가 후:
```bash
source ~/.zshrc
```

#### 3. Claude Code에서 사용하기

##### 방법 1: 헬퍼 스크립트 사용 (권장)

헬퍼 스크립트는 자동으로 `$MCP_JWT_TOKEN`을 읽어서 인증합니다:

```bash
# 기본 사용법
./scripts/ssh-mcp-run.sh <HOST> <USERNAME> <COMMAND> [PORT]

# 예시: Kubernetes 파드 조회
./scripts/ssh-mcp-run.sh k8s.example.com ubuntu "kubectl get pods"

# 예시: 비밀번호 인증
./scripts/ssh-mcp-run.sh -p mypassword server.com admin "docker ps"

# 예시: 커스텀 포트
./scripts/ssh-mcp-run.sh server.com user "ls" 2222
```

##### 방법 2: 직접 curl 사용

```bash
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MCP_JWT_TOKEN" \
  -d '{
    "host": "server.example.com",
    "username": "ubuntu",
    "command": "kubectl get pods"
  }'
```

---

## 💡 Claude Code 사용 시나리오

### 기본 사용법

Claude Code를 실행하고 자연스럽게 요청하세요:

#### 시나리오 1: 명령 실행 요청

**사용자:**
```
production.example.com 서버에 ubuntu 계정으로 접속해서
쿠버네티스 파드 상태를 확인해줘
```

**Claude:**
```
파드 상태를 확인하겠습니다.
```

Claude가 자동으로 실행:
```bash
./scripts/ssh-mcp-run.sh production.example.com ubuntu "kubectl get pods"
```

결과를 받아서 분석하고 리포트 제공.

#### 시나리오 2: 비밀번호 인증

**사용자:**
```
legacy-server.com 서버에 admin/password123으로 접속해서
디스크 사용량을 확인해줘
```

**Claude:**
```
디스크 사용량을 확인하겠습니다.
```

Claude가 실행:
```bash
./scripts/ssh-mcp-run.sh -p password123 legacy-server.com admin "df -h"
```

#### 시나리오 3: 여러 서버 확인

**사용자:**
```
web-01.example.com, web-02.example.com, web-03.example.com
3개 서버의 uptime을 각각 확인해줘
```

**Claude:**
Claude가 순차적으로 3개 서버에 명령을 실행하고 결과를 비교/요약합니다.

### 고급 사용법

#### 로그 분석 요청

**사용자:**
```
nginx-server의 /var/log/nginx/error.log에서
최근 1시간 동안의 500 에러를 찾아서 분석해줘
```

**Claude:**
```
nginx 에러 로그를 분석하겠습니다.
```

1. 먼저 로그 파일을 조회
2. 500 에러 패턴을 필터링
3. 에러 발생 빈도와 패턴 분석
4. 가능한 원인과 해결책 제안

#### 리소스 모니터링

**사용자:**
```
k8s-cluster의 모든 파드 중에서
CPU 사용률이 80% 이상인 파드를 찾아줘
```

**Claude:**
```
리소스 사용률을 확인하겠습니다.
```

1. `kubectl top pods` 실행
2. CPU 사용률 파싱
3. 80% 이상 파드 필터링
4. 결과를 표로 정리하여 제공

#### 문제 진단

**사용자:**
```
db-server의 메모리 사용률이 높은데,
어떤 프로세스가 메모리를 많이 쓰는지 확인해줘
```

**Claude:**
```
메모리 사용 현황을 분석하겠습니다.
```

1. `ps aux --sort=-%mem | head -20` 실행
2. 메모리 사용량이 많은 프로세스 확인
3. 프로세스별 메모리 사용량 분석
4. 최적화 방안 제안

### 복합 시나리오

#### 전체 인프라 헬스 체크

**사용자:**
```
내가 관리하는 서버 정보:
- production.example.com (username: ubuntu, 키 인증)
- staging.example.com (username: ubuntu, 키 인증)
- db-server.example.com (username: postgres, 키 인증)

이 3개 서버의 헬스 체크를 해줘:
1. 디스크 사용량 (80% 이상 경고)
2. 메모리 사용률 (90% 이상 경고)
3. CPU 로드 (5.0 이상 경고)
4. 시스템 업타임
```

**Claude:**
Claude가 각 서버에 대해:
1. `df -h` 실행 → 디스크 사용량 확인
2. `free -h` 실행 → 메모리 사용률 확인
3. `uptime` 실행 → CPU 로드 및 업타임 확인
4. 모든 결과를 종합하여 표 형태로 리포트 작성
5. 경고 임계값 초과 항목 강조

#### 배포 후 검증

**사용자:**
```
production 서버에 방금 배포한 app-service의 상태를 확인해줘:
1. 파드가 Running 상태인지
2. 로그에 에러가 없는지
3. 서비스 엔드포인트가 응답하는지
```

**Claude:**
1. `kubectl get pods -l app=app-service` 실행
2. 파드 상태 확인 (Running인지)
3. `kubectl logs <pod-name> --tail=50` 실행
4. 로그에서 ERROR, FATAL 패턴 검색
5. `curl http://service-endpoint/health` 실행
6. 전체 검증 결과 리포트 작성

#### 로그 트러블슈팅

**사용자:**
```
api-server에서 갑자기 응답이 느려졌어.
최근 30분 동안의 로그를 보고 원인을 찾아줘.
```

**Claude:**
1. `journalctl -u api-server --since "30 minutes ago"` 실행
2. 에러 메시지 패턴 검색
3. 타임스탬프 기준으로 문제 발생 시점 특정
4. 느려진 시점 전후 로그 비교 분석
5. 가능한 원인 추론 (DB 연결, 메모리 부족, 네트워크 등)
6. 해결 방안 제안

### 사용 팁

#### 서버 정보를 명확하게 제공

❌ **나쁜 예:**
```
사용자: 서버 상태 확인해줘
```

✅ **좋은 예:**
```
사용자: production.example.com 서버에 ubuntu 계정으로 접속해서
      kubectl get pods 명령으로 파드 상태 확인해줘
```

#### 서버 정보를 미리 알려주기

대화 시작 시:
```
사용자: 내가 관리하는 서버 정보:
- production.example.com (username: ubuntu, 키 인증)
- staging.example.com (username: ubuntu, 키 인증)
- legacy.example.com (username: admin, 비밀번호: pass123)

앞으로 이 서버들에 대해 물어볼게
```

이후 간단하게:
```
사용자: production 서버의 파드 상태 확인해줘
```

Claude가 이전 대화 내용을 참고하여 서버 정보를 알아서 사용합니다.

#### Claude에게 결과 분석 요청

단순히 명령 실행만이 아니라 결과 해석도 요청:

```
사용자: production 서버의 파드 상태를 확인하고,
      문제가 있는 파드가 있으면 알려줘. 그리고 원인을 추론해봐.
```

Claude가 결과를 분석하고:
- 파드 상태 요약
- CrashLoopBackOff, ImagePullBackOff 등 문제 있는 파드 식별
- 로그 확인 필요성 제안
- 가능한 원인 추론

---

## 🔧 개발 명령어

```bash
npm run build    # TypeScript 컴파일
npm start        # 프로덕션 모드 실행
npm run dev      # 개발 모드 실행 (ts-node, hot-reload)
npm run watch    # TypeScript watch 모드
npm run clean    # dist/ 폴더 삭제
```

---

## 📂 프로젝트 구조

```
local-ssh-mcp/
├── src/
│   ├── index.ts                    # 메인 서버 엔트리포인트
│   ├── routes/
│   │   ├── auth.ts                 # JWT 토큰 발급 라우트
│   │   └── mcp.ts                  # MCP API 라우트 (health, status, run)
│   ├── services/
│   │   └── ssh-manager.ts          # SSH 연결 및 명령 실행 관리
│   ├── middleware/
│   │   ├── auth.ts                 # JWT 인증 미들웨어
│   │   └── validator.ts            # 명령 검증 미들웨어 (hot-reload)
│   ├── utils/
│   │   ├── jwt.ts                  # JWT 생성/검증 유틸리티
│   │   └── logger.ts               # Winston 로거 설정
│   └── types/
│       └── index.ts                # TypeScript 타입 정의
├── scripts/
│   └── ssh-mcp-run.sh              # 헬퍼 스크립트 (JWT 자동 로드)
├── logs/                            # 로그 파일 (자동 생성)
│   ├── combined.log                # 전체 로그
│   └── error.log                   # 에러 로그
├── dist/                            # 컴파일된 JavaScript (자동 생성)
├── .env                             # 환경변수 (직접 생성 필요, .gitignore)
├── .env.example                     # 환경변수 템플릿
├── rules.json                       # 명령 필터링 룰 (hot-reload)
├── package.json                     # 의존성 관리
├── tsconfig.json                    # TypeScript 설정
├── CLAUDE.md                        # 프로젝트 상세 문서 (Claude Code용)
├── CLAUDE_CODE_SETUP.md             # Claude Code 설정 가이드
└── README.md                        # 이 문서
```

---

## 🔒 보안 권장사항

### 1. SSH 키 권한 설정
```bash
chmod 600 ~/.ssh/id_rsa
```

### 2. SSH 키 Passphrase 사용
```bash
# 새로운 SSH 키 생성 (passphrase 설정)
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# 기존 SSH 키에 passphrase 추가
ssh-keygen -p -f ~/.ssh/id_rsa
```

### 3. 강력한 인증 정보 생성
```bash
# TOKEN_PASSPHRASE 생성
openssl rand -hex 32

# JWT_SECRET_KEY 생성
openssl rand -hex 64
```

### 4. `.env` 파일 권한 설정
```bash
chmod 600 .env
```

### 5. 프로덕션 환경 설정
```env
NODE_ENV=production
LOG_LEVEL=warn
```

### 6. 방화벽 설정 (선택사항)
```bash
# 127.0.0.1에서만 접근 허용
sudo ufw allow from 127.0.0.1 to any port 4000
```

---

## 📝 로그 확인

로그 파일 위치:
- `logs/combined.log` - 전체 로그 (INFO, WARN, ERROR)
- `logs/error.log` - 에러 로그만 (ERROR)

실시간 로그 모니터링:
```bash
tail -f logs/combined.log
```

로그 레벨 변경 (`.env`):
```env
LOG_LEVEL=debug  # error, warn, info, debug
```

---

## 🐛 문제 해결

### JWT 토큰이 만료된 경우

에러: `"JWT token expired. Please obtain a new token..."`

해결:
```bash
curl -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "your-passphrase"}'

# 응답의 token 값을 복사하여 환경변수 업데이트
export MCP_JWT_TOKEN="new-token-here"

# ~/.zshrc 또는 ~/.bashrc에도 업데이트
nano ~/.zshrc  # 또는 ~/.bashrc
# MCP_JWT_TOKEN 값 변경 후 저장
source ~/.zshrc
```

### SSH 연결 실패

1. SSH 키 권한 확인:
```bash
ls -la ~/.ssh/id_rsa  # -rw------- (600) 이어야 함
chmod 600 ~/.ssh/id_rsa  # 권한 수정
```

2. 수동 SSH 연결 테스트:
```bash
ssh -i ~/.ssh/id_rsa username@server.com
```

3. 서버 로그 확인:
```bash
tail -f logs/combined.log
```

### 명령이 차단된 경우

에러: `"Command validation failed: Command does not match any allowed pattern"`

해결: `rules.json` 파일에서 허용 명령 추가:
```json
{
  "allowedCommands": [
    "kubectl",
    "docker",
    "your-command-here"
  ],
  "blockedPatterns": [
    "rm -rf",
    "shutdown"
  ]
}
```

파일 저장 시 자동으로 반영됨 (서버 재시작 불필요)

### 헬퍼 스크립트를 찾지 못하는 경우

```bash
# 스크립트가 PATH에 있는지 확인
which ssh-mcp-run.sh

# 없으면 PATH에 추가
export PATH="$PATH:/path/to/local-ssh-mcp/scripts"

# 또는 절대 경로로 실행
/path/to/local-ssh-mcp/scripts/ssh-mcp-run.sh server.com user "ls"
```

---

<!-- ## 🤝 기여하기

이슈 리포트 및 풀 리퀘스트를 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request -->

---

## 📧 문의 및 지원

- **Issues**: [GitHub Issues](https://github.com/terria1020/local-ssh-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/terria1020/local-ssh-mcp/discussions)
