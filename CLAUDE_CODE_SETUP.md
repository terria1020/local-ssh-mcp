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

## 2. Shell 환경변수 설정

### zsh 사용자 (macOS 기본)

`~/.zshrc` 파일 편집:

```bash
nano ~/.zshrc
```

파일 끝에 추가:

```bash
# SSH MCP Server Configuration
export MCP_API_TOKEN="my-local-token"
export MCP_SERVER_URL="http://127.0.0.1:4000"

# 헬퍼 스크립트를 PATH에 추가 (어디서든 실행 가능)
export PATH="$PATH:/Users/jaehan1346/Github/local-ssh-mcp/scripts"
```

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
echo $MCP_API_TOKEN
echo $MCP_SERVER_URL
which ssh-mcp-run.sh
```

---

## 3. 서버 동작 확인

```bash
# Health check
curl http://127.0.0.1:4000/mcp/health

# 헬퍼 스크립트 테스트 (실제 서버 필요)
ssh-mcp-run.sh your-server.com your-username "uptime"
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
ssh-mcp-run.sh production.example.com ubuntu "kubectl get pods"
```

**예시 2: 비밀번호 인증**
```
사용자: legacy-server.com 서버에 admin/password123으로 접속해서
      디스크 사용량을 확인해줘
```

Claude가 실행:
```bash
ssh-mcp-run.sh -p password123 legacy-server.com admin "df -h"
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

### 환경변수가 설정되었는지 확인

```bash
echo $MCP_API_TOKEN
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

API 토큰이 서버의 `.env` 파일과 일치하는지 확인:

```bash
# Shell 환경변수
echo $MCP_API_TOKEN

# 서버 설정 파일
cat /Users/jaehan1346/Github/local-ssh-mcp/.env | grep MCP_API_TOKEN
```

### SSH 연결 실패

- SSH 키 파일 권한 확인: `chmod 600 ~/.ssh/id_rsa`
- 서버 로그 확인: `tail -f logs/combined.log`

---

## 7. 보안 모범 사례

1. **API 토큰 보호**
   - 강력한 토큰 사용: `openssl rand -hex 32`
   - 토큰을 코드에 하드코딩하지 않기

2. **SSH 키 사용 권장**
   - 비밀번호보다 키 기반 인증 사용
   - 키 파일에 passphrase 설정

3. **로컬 전용**
   - 서버는 127.0.0.1에서만 리스닝
   - 외부 네트워크 노출 금지

4. **로그 모니터링**
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
        <key>MCP_API_TOKEN</key>
        <string>my-local-token</string>
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
2. ✅ Shell 환경변수 설정 (`~/.zshrc` 또는 `~/.bashrc`)
3. ✅ Claude Code에서 자연스럽게 요청
4. ✅ **MCP 설정 파일에는 등록하지 않음**

이제 Claude Code와 SSH MCP 서버를 함께 사용할 준비가 완료되었습니다! 🚀
