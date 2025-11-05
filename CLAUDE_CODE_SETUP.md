# Claude Code 완전 설정 가이드

이 가이드는 SSH MCP 서버를 Claude Code와 함께 사용하는 방법을 단계별로 설명합니다.

## 중요: MCP 설정 파일에 등록하지 않음

이 서버는 REST API 서버이므로 **Claude Code의 MCP 설정 파일(`claude_desktop_config.json`)에 등록하지 않습니다**.

대신 Claude Code가 **Bash 도구**를 통해 헬퍼 스크립트나 curl을 실행합니다.

---

## 1. 서버 실행

### 옵션 A: 개발 모드 (터미널에서 계속 실행)

터미널 창을 하나 열고:

```bash
cd /Users/jaehan1346/Github/local-ssh-mcp
npm run dev
```

이 터미널은 계속 켜두세요.

### 옵션 B: 백그라운드 실행 (권장)

```bash
cd /Users/jaehan1346/Github/local-ssh-mcp
npm run build
nohup npm start > logs/server.log 2>&1 &

# 프로세스 ID 확인
echo $!
```

백그라운드 프로세스 종료:
```bash
# 프로세스 찾기
ps aux | grep "node dist/index.js"

# 프로세스 종료
kill <PID>
```

### 옵션 C: PM2로 실행 (프로덕션)

PM2 설치:
```bash
npm install -g pm2
```

서버 시작:
```bash
cd /Users/jaehan1346/Github/local-ssh-mcp
npm run build
pm2 start dist/index.js --name ssh-mcp

# 시스템 재시작 시 자동 실행
pm2 startup
pm2 save
```

PM2 관리:
```bash
pm2 list          # 실행 중인 프로세스 확인
pm2 logs ssh-mcp  # 로그 확인
pm2 stop ssh-mcp  # 중지
pm2 restart ssh-mcp  # 재시작
pm2 delete ssh-mcp   # 제거
```

---

## 2. Shell 환경변수 설정 (v2.0.0 - JWT 인증)

### JWT 토큰 발급받기

먼저 서버로부터 JWT 토큰을 발급받아야 합니다:

```bash
# .env 파일에 설정된 TOKEN_PASSPHRASE 사용
curl -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "your-passphrase-from-env"}'
```

응답 예시:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30m",
  "message": "JWT token issued successfully"
}
```

### zsh 사용자 (macOS 기본)

`~/.zshrc` 파일 편집:

```bash
nano ~/.zshrc
```

파일 끝에 추가:

```bash
# SSH MCP Server Configuration (v2.0.0 - JWT)
export MCP_JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # 발급받은 JWT 토큰
export MCP_SERVER_URL="http://127.0.0.1:4000"

# 헬퍼 스크립트를 PATH에 추가 (어디서든 실행 가능)
export PATH="$PATH:/Users/jaehan1346/Github/local-ssh-mcp/scripts"
```

**중요:**
- `MCP_JWT_TOKEN`에는 위에서 발급받은 JWT 토큰을 입력하세요
- JWT 토큰은 30분 후 만료되므로 만료 시 재발급 필요
- **절대 TOKEN_PASSPHRASE를 zshrc에 저장하지 마세요** (보안 위험)

적용:
```bash
source ~/.zshrc
```

### bash 사용자

`~/.bashrc` 파일 편집:

```bash
nano ~/.bashrc
```

같은 내용 추가 후:

```bash
source ~/.bashrc
```

### 환경변수 확인

```bash
echo $MCP_JWT_TOKEN
echo $MCP_SERVER_URL
which ssh-mcp-run.sh
```

### JWT 토큰 재발급 (만료 시)

JWT 토큰은 30분 후 만료됩니다. 만료 시 다음과 같이 재발급:

```bash
# 1. 새 토큰 발급
curl -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "your-passphrase-from-env"}'

# 2. ~/.zshrc 파일에서 MCP_JWT_TOKEN 값 업데이트
# 3. 적용
source ~/.zshrc
```

---

## 3. 서버 동작 확인

```bash
# Health check (인증 불필요)
curl http://127.0.0.1:4000/mcp/health

# Status check (JWT 인증 필요)
curl -H "Authorization: Bearer $MCP_JWT_TOKEN" \
     http://127.0.0.1:4000/mcp/status

# 헬퍼 스크립트 테스트 (실제 서버 필요)
./scripts/ssh-mcp-run.sh your-server.com your-username "uptime"
```

---

## 4. Claude Code에서 사용하기

### 기본 사용법

Claude Code를 실행하고 자연스럽게 요청하세요:

**예시 1: 명령 실행 요청**
```
사용자: production.example.com 서버에 ubuntu 계정으로 접속해서
      쿠버네티스 파드 상태를 확인해줘
```

Claude가 자동으로 다음을 실행합니다:
```bash
./scripts/ssh-mcp-run.sh production.example.com ubuntu "kubectl get pods"
```

**예시 2: 비밀번호 인증**
```
사용자: legacy-server.com 서버에 admin/password123으로 접속해서
      디스크 사용량을 확인해줘
```

Claude가 실행:
```bash
./scripts/ssh-mcp-run.sh -p password123 legacy-server.com admin "df -h"
```

**예시 3: 여러 서버 확인**
```
사용자: web-01.example.com, web-02.example.com, web-03.example.com
      3개 서버의 uptime을 각각 확인해줘
```

Claude가 순차적으로 실행하고 결과를 비교/요약합니다.

### 고급 사용법

**로그 분석 요청**
```
사용자: nginx-server의 /var/log/nginx/error.log에서
      최근 1시간 동안의 500 에러를 찾아서 분석해줘
```

**리소스 모니터링**
```
사용자: k8s-cluster의 모든 파드 중에서
      CPU 사용률이 80% 이상인 파드를 찾아줘
```

**문제 진단**
```
사용자: db-server의 메모리 사용률이 높은데,
      어떤 프로세스가 메모리를 많이 쓰는지 확인해줘
```

---

## 5. 사용 팁

### 서버 정보를 명확하게 제공

❌ **나쁜 예:**
```
사용자: 서버 상태 확인해줘
```

✅ **좋은 예:**
```
사용자: production.example.com 서버에 ubuntu 계정으로 접속해서
      kubectl get pods 명령으로 파드 상태 확인해줘
```

### 서버 정보를 미리 알려주기

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

### Claude에게 결과 분석 요청

```
사용자: production 서버의 파드 상태를 확인하고,
      문제가 있는 파드가 있으면 알려줘
```

Claude가 결과를 분석하고 해석해줍니다.

---

## 6. 문제 해결

### 서버가 실행 중인지 확인

```bash
curl http://127.0.0.1:4000/mcp/health
```

### JWT 토큰이 만료된 경우

에러 메시지: `"JWT token expired. Please obtain a new token..."`

해결 방법:
```bash
# 1. 새 토큰 발급
curl -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "your-passphrase"}'

# 2. ~/.zshrc에서 MCP_JWT_TOKEN 업데이트
# 3. 적용
source ~/.zshrc
```

### 환경변수가 설정되었는지 확인

```bash
echo $MCP_JWT_TOKEN
echo $MCP_SERVER_URL
```

### 헬퍼 스크립트가 PATH에 있는지 확인

```bash
which ssh-mcp-run.sh
```

없으면:
```bash
export PATH="$PATH:/Users/jaehan1346/Github/local-ssh-mcp/scripts"
```

### Claude Code가 스크립트를 찾지 못하는 경우

Claude Code를 재시작하세요. 환경변수는 Claude Code 시작 시 로드됩니다.

### 인증 에러 (401)

**JWT 토큰 관련 에러:**
- "JWT token expired" → 토큰 재발급 필요
- "JWT issuer mismatch" → 서버 설정 확인
- "Invalid JWT token" → 토큰이 변조되었거나 잘못됨

**해결 방법:**
```bash
# Shell 환경변수 확인
echo $MCP_JWT_TOKEN

# 서버 설정 확인
cat /Users/jaehan1346/Github/local-ssh-mcp/.env | grep JWT
```

### SSH 연결 실패

- SSH 키 파일 권한 확인: `chmod 600 ~/.ssh/id_rsa`
- 서버 로그 확인: `tail -f logs/combined.log`

---

## 7. 보안 모범 사례 (v2.0.0)

1. **TOKEN_PASSPHRASE 보호**
   - 강력한 passphrase 사용: `openssl rand -hex 32`
   - **절대 zshrc에 저장하지 않기** (오직 .env에만)
   - JWT 토큰만 zshrc에 저장 (30분 후 만료)

2. **JWT 토큰 관리**
   - 만료된 토큰은 즉시 재발급
   - 토큰이 노출된 경우 TOKEN_PASSPHRASE 변경

3. **SSH 키 사용 권장**
   - 비밀번호보다 키 기반 인증 사용
   - 키 파일에 passphrase 설정

4. **로컬 전용**
   - 서버는 127.0.0.1에서만 리스닝
   - 외부 네트워크 노출 금지

5. **로그 모니터링**
   - 정기적으로 로그 확인: `tail -f logs/combined.log`
   - 의심스러운 활동 감지

---

## 8. 자동 시작 설정 (선택사항)

macOS에서 로그인 시 자동 시작:

### launchd 사용

`~/Library/LaunchAgents/com.local.ssh-mcp.plist` 생성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.local.ssh-mcp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/jaehan1346/Github/local-ssh-mcp/dist/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/jaehan1346/Github/local-ssh-mcp/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/jaehan1346/Github/local-ssh-mcp/logs/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SSH_KEY_PATH</key>
        <string>/Users/jaehan1346/.ssh/id_rsa</string>
        <key>TOKEN_PASSPHRASE</key>
        <string>your-token-passphrase</string>
        <key>JWT_SECRET_KEY</key>
        <string>your-jwt-secret</string>
        <key>JWT_ISSUER</key>
        <string>local-ssh-mcp</string>
    </dict>
</dict>
</plist>
```

launchd 등록:
```bash
launchctl load ~/Library/LaunchAgents/com.local.ssh-mcp.plist
launchctl start com.local.ssh-mcp
```

---

## 요약

1. ✅ 서버 실행 (백그라운드 또는 터미널)
2. ✅ JWT 토큰 발급받기 (POST /auth)
3. ✅ Shell 환경변수 설정 (`~/.zshrc`에 JWT 토큰 저장)
4. ✅ Claude Code에서 자연스럽게 요청
5. ✅ **MCP 설정 파일에는 등록하지 않음**
6. ✅ JWT 토큰 만료 시 재발급 (30분마다)

이제 Claude Code와 SSH MCP 서버를 함께 사용할 준비가 완료되었습니다! 🚀
