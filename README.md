# Local SSH MCP Server

**Node.js 기반 SSH MCP 서버 - Claude Code를 위한 안전한 백엔드 프록시**

Claude Code가 SSH를 통해 원격 서버의 명령을 실행할 수 있도록 하는 로컬 프록시 서버입니다. SSH 키파일은 로컬에만 존재하며 Claude에 노출되지 않습니다.

## 목적

- Claude Code가 JSON 요청을 통해 원격 서버 명령 실행
- SSH 키파일의 안전한 관리 (로컬 환경에만 존재)
- 화이트리스트/블랙리스트 기반 명령 필터링
- 로컬 호스트(127.0.0.1)에서만 실행, 외부 노출 차단

## 기술 스택

- **Node.js** + **TypeScript**
- **Express.js** - REST API 서버
- **node-ssh** - SSH 연결 및 명령 실행
- **Winston** - 로깅
- **Helmet** - 보안 헤더
- **dotenv** - 환경변수 관리

## 보안 기능

### 명령 필터링

**화이트리스트 (허용된 명령)**
```
kubectl, docker, htop, ls, df, free, uptime, tail, grep, cat /var/log, ps, top, netstat, ss, journalctl
```

**블랙리스트 (차단된 패턴)**
```
rm -rf, shutdown, reboot, passwd, chmod 777, cat ~/.ssh, mkfs, dd if=, curl | bash, nc -l
```

### 인증
- API 토큰 기반 인증 (Authorization 헤더)
- 127.0.0.1에서만 리스닝
- SSH 키 파일 경로는 .env로만 관리

## 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.example`을 복사하여 `.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일 수정:

```env
PORT=4000
NODE_ENV=development
SSH_KEY_PATH=/Users/jaehan/.ssh/id_rsa
SSH_PASSPHRASE=your-ssh-key-passphrase  # SSH 키에 passphrase가 있는 경우만 설정
MCP_API_TOKEN=your-secure-token-here
LOG_LEVEL=info
```

**SSH Passphrase 설정:**
- SSH 키 파일에 passphrase가 **없는 경우**: `SSH_PASSPHRASE` 항목을 생략하거나 빈 문자열로 설정
- SSH 키 파일에 passphrase가 **있는 경우**: `SSH_PASSPHRASE=your-passphrase-here` 형태로 설정
- Passphrase는 절대 코드에 하드코딩하지 말고 반드시 `.env`로만 관리

### 3. TypeScript 컴파일

```bash
npm run build
```

### 4. 서버 실행

**프로덕션 모드:**
```bash
npm start
```

**개발 모드 (ts-node):**
```bash
npm run dev
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
  "sshConnected": false,
  "environment": {
    "nodeVersion": "v20.11.0",
    "platform": "darwin",
    "pid": 12345
  }
}
```

## API 사용법

### 엔드포인트

#### 1. `GET /mcp/health`
서버 상태 확인 (인증 불필요)

```bash
curl http://127.0.0.1:4000/mcp/health
```

#### 2. `GET /mcp/status`
상세 상태 확인 (인증 필요)

```bash
curl -H "Authorization: Bearer your-token-here" \
     http://127.0.0.1:4000/mcp/status
```

#### 3. `POST /mcp/run`
SSH 명령 실행 (인증 필요)

**요청 형식 (키 기반 인증):**
```json
{
  "host": "192.168.1.100",
  "username": "ubuntu",
  "command": "kubectl get pods",
  "port": 22
}
```

**요청 형식 (비밀번호 인증):**
```json
{
  "host": "192.168.1.100",
  "username": "ubuntu",
  "command": "kubectl get pods",
  "port": 22,
  "password": "your-ssh-password"
}
```

**응답 형식:**
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

## 인증 방식

### SSH 키 기반 인증 (권장)

`.env` 파일:
```env
SSH_KEY_PATH=/Users/jaehan/.ssh/id_rsa
SSH_PASSPHRASE=your-key-passphrase  # 키에 passphrase가 있는 경우만
```

API 요청에는 password 필드를 포함하지 않습니다.

### SSH 비밀번호 기반 인증

`.env` 파일에서 `SSH_KEY_PATH`를 생략하거나 빈 문자열로 설정:
```env
# SSH_KEY_PATH=  # 주석 처리 또는 생략
```

API 요청에 `password` 필드를 포함:
```json
{
  "host": "server.example.com",
  "username": "ubuntu",
  "password": "your-ssh-password",
  "command": "ls -la"
}
```

**보안 경고:**
- 비밀번호는 평문으로 전송됩니다 (localhost 내에서만)
- 프로덕션 환경에서는 키 기반 인증을 권장합니다
- 비밀번호는 로그에 기록되지 않습니다

## curl 사용 예시

### 예시 1: Kubernetes 파드 상태 확인

```bash
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-local-token" \
  -d '{
    "host": "k8s-master.example.com",
    "username": "ubuntu",
    "command": "kubectl get pods -o wide"
  }'
```

### 예시 2: Docker 컨테이너 목록

```bash
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-local-token" \
  -d '{
    "host": "docker-host.example.com",
    "username": "admin",
    "command": "docker ps -a"
  }'
```

### 예시 3: 시스템 디스크 사용량

```bash
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-local-token" \
  -d '{
    "host": "server.example.com",
    "username": "ops",
    "command": "df -h"
  }'
```

### 예시 4: 로그 파일 확인 (마지막 10줄)

```bash
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-local-token" \
  -d '{
    "host": "web-server.example.com",
    "username": "www-data",
    "command": "tail -n 10 /var/log/nginx/access.log"
  }'
```

### 예시 5: Kubernetes 리소스 모니터링

```bash
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-local-token" \
  -d '{
    "host": "k8s-master.example.com",
    "username": "ubuntu",
    "command": "kubectl top pods"
  }'
```

### 예시 6: 비밀번호 인증 사용

```bash
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-local-token" \
  -d '{
    "host": "legacy-server.example.com",
    "username": "admin",
    "password": "your-ssh-password",
    "command": "df -h"
  }'
```

### 예시 7: 헬퍼 스크립트 - 비밀번호 인증

```bash
# 키 기반 인증 (기본)
./scripts/ssh-mcp-run.sh server.com ubuntu "kubectl get pods"

# 비밀번호 인증
./scripts/ssh-mcp-run.sh -p mypassword server.com admin "docker ps"
```

## Claude Code 연동 가이드

### 설정 방법

#### 1. MCP 서버 실행

터미널에서 MCP 서버를 실행합니다:

```bash
cd /Users/jaehan1346/Github/local-ssh-mcp
npm run dev  # 또는 npm start
```

서버가 `http://127.0.0.1:4000`에서 실행됩니다.

#### 2. 환경변수 설정

Shell 설정 파일에 API 토큰을 추가합니다:

**bash 사용자:**
```bash
echo 'export MCP_API_TOKEN="my-local-token"' >> ~/.bashrc
source ~/.bashrc
```

**zsh 사용자:**
```bash
echo 'export MCP_API_TOKEN="my-local-token"' >> ~/.zshrc
source ~/.zshrc
```

#### 3. Claude Code에서 사용하기

##### 방법 1: 헬퍼 스크립트 사용 (권장)

```bash
# 프로젝트 디렉토리의 헬퍼 스크립트 사용
./scripts/ssh-mcp-run.sh server.example.com ubuntu "kubectl get pods"

# 또는 PATH에 추가하여 어디서든 사용
export PATH="$PATH:/Users/jaehan1346/Github/local-ssh-mcp/scripts"
ssh-mcp-run.sh server.example.com ubuntu "docker ps"
```

##### 방법 2: 직접 curl 사용

```bash
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MCP_API_TOKEN" \
  -d '{
    "host": "server.example.com",
    "username": "ubuntu",
    "command": "kubectl get pods"
  }'
```

### Claude Code 사용 시나리오

Claude Code와 대화할 때 다음과 같이 요청하세요:

**예시 1: 쿠버네티스 파드 상태 확인**
```
사용자: 프로덕션 서버(k8s-prod.example.com)의 쿠버네티스 파드 상태를 확인해줘

Claude: 헬퍼 스크립트를 사용해서 확인하겠습니다.
[Claude가 실행]
./scripts/ssh-mcp-run.sh k8s-prod.example.com ubuntu "kubectl get pods -o wide"

[결과 분석 후 사용자에게 리포트]
```

**예시 2: 서버 리소스 모니터링**
```
사용자: web-server01의 디스크 사용량과 메모리 상태 확인해줘

Claude: 디스크와 메모리 상태를 확인하겠습니다.
[Claude가 실행]
./scripts/ssh-mcp-run.sh web-server01 admin "df -h && free -h"

[결과 분석 및 리포트]
```

**예시 3: 로그 분석**
```
사용자: nginx 서버의 최근 에러 로그 10줄 보여줘

Claude: nginx 에러 로그를 확인하겠습니다.
[Claude가 실행]
./scripts/ssh-mcp-run.sh nginx-server www-data "tail -n 10 /var/log/nginx/error.log"

[로그 분석 및 설명]
```

### 헬퍼 스크립트 장점

- **간편한 사용**: 긴 curl 명령 대신 간단한 인자만 전달
- **자동 인증**: 환경변수에서 API 토큰 자동 로드
- **예쁜 출력**: jq가 설치되어 있으면 JSON을 보기 좋게 포맷팅
- **에러 처리**: 실패 시 명확한 에러 메시지 출력

### Claude Code 사용 팁

1. **서버 정보를 명확히 전달**: "서버A의 쿠버네티스 파드 확인해줘" 보다 "k8s-prod.example.com 서버의 파드 상태 확인해줘"가 더 명확
2. **여러 서버 동시 확인**: Claude에게 여러 서버를 순차적으로 확인하도록 요청 가능
3. **결과 분석 요청**: Claude가 결과를 해석하고 문제점을 찾아달라고 요청 가능

## 연동 시나리오 요약

| Claude 요청 | MCP 실행 명령 | 결과 |
|------------|---------------|------|
| "쿠버네티스 파드 상태 알려줘" | `kubectl get pods -o wide` | Running 상태 목록 반환 |
| "nginx 로그 10줄만 봐줘" | `tail -n 10 /var/log/nginx/access.log` | 로그 문자열 반환 |
| "스토리지 여유 공간은?" | `df -h` | 디스크 사용량 정보 반환 |
| "CPU 높은 파드 찾아줘" | `kubectl top pods --sort-by=cpu` | 리소스 모니터링 결과 반환 |
| "Docker 컨테이너 확인해줘" | `docker ps -a` | 컨테이너 목록 반환 |

## 에러 처리

### 인증 실패 (401)
```json
{
  "success": false,
  "error": "Invalid authentication token",
  "timestamp": "2025-11-05T12:34:56.789Z"
}
```

### 명령 차단 (403)
```json
{
  "success": false,
  "error": "Command validation failed: Command contains blocked pattern: rm -rf",
  "timestamp": "2025-11-05T12:34:56.789Z"
}
```

### SSH 연결 실패 (500)
```json
{
  "success": false,
  "error": "SSH connection failed: Connection timeout",
  "timestamp": "2025-11-05T12:34:56.789Z"
}
```

### 명령 실행 실패 (200, exitCode != 0)
```json
{
  "success": true,
  "result": {
    "stdout": "",
    "stderr": "kubectl: command not found",
    "exitCode": 127
  },
  "timestamp": "2025-11-05T12:34:56.789Z"
}
```

## 로그 확인

로그 파일 위치:
- `logs/combined.log` - 전체 로그
- `logs/error.log` - 에러 로그만

로그 레벨 변경 (.env):
```env
LOG_LEVEL=debug  # error, warn, info, debug
```

## 프로젝트 구조

```
local-ssh-mcp/
├── src/
│   ├── index.ts                    # 메인 서버
│   ├── routes/
│   │   └── mcp.ts                  # MCP API 라우트
│   ├── services/
│   │   └── ssh-manager.ts          # SSH 연결 관리
│   ├── middleware/
│   │   ├── auth.ts                 # API 토큰 인증
│   │   └── validator.ts            # 명령 검증
│   ├── utils/
│   │   └── logger.ts               # Winston 로거
│   └── types/
│       └── index.ts                # TypeScript 타입
├── logs/                            # 로그 파일 (자동 생성)
├── dist/                            # 컴파일된 JS (자동 생성)
├── .env                             # 환경변수 (직접 생성 필요)
├── .env.example                     # 환경변수 템플릿
├── package.json                     # 의존성 관리
├── tsconfig.json                    # TypeScript 설정
└── README.md                        # 이 문서
```

## 보안 권장사항

1. **SSH 키 권한 설정**
   ```bash
   chmod 600 ~/.ssh/id_rsa
   ```

2. **SSH 키 Passphrase 사용 (권장)**
   - 보안을 위해 SSH 키 파일에 passphrase를 설정하는 것을 권장합니다
   - 새로운 SSH 키 생성 시 passphrase 설정:
     ```bash
     ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
     # passphrase 입력 프롬프트에서 강력한 passphrase 입력
     ```
   - 기존 SSH 키에 passphrase 추가:
     ```bash
     ssh-keygen -p -f ~/.ssh/id_rsa
     ```

3. **강력한 API 토큰 생성**
   ```bash
   openssl rand -hex 32
   ```

4. **방화벽 설정** (필요시)
   ```bash
   # 127.0.0.1에서만 접근 허용
   sudo ufw allow from 127.0.0.1 to any port 4000
   ```

5. **프로덕션 환경**
   - `NODE_ENV=production` 설정
   - 에러 메시지 최소화
   - 로그 레벨을 `warn` 또는 `error`로 설정
   - `.env` 파일 권한을 `600`으로 설정하여 passphrase 보호:
     ```bash
     chmod 600 .env
     ```

## 개발 명령어

```bash
npm run build    # TypeScript 컴파일
npm start        # 프로덕션 모드 실행
npm run dev      # 개발 모드 실행 (ts-node)
npm run watch    # TypeScript watch 모드
npm run clean    # dist 폴더 삭제
```

## 라이선스

MIT

## 문의 및 지원

이슈 리포트: GitHub Issues
