# Local SSH MCP Server v2.0.0 - 구현 기능 레포트

**작성일**: 2025-12-26

## 개요

Claude Code가 원격 서버에 SSH 명령을 실행할 수 있게 해주는 localhost 전용 프록시 서버입니다. SSH 자격증명이 로컬에만 유지되어 Claude에게 노출되지 않습니다.

## 기술 스택

| 구성요소 | 기술 |
|---------|-----|
| Runtime | Node.js + TypeScript |
| Framework | Express.js 4.18.2 |
| SSH | node-ssh 13.1.0 |
| 인증 | jsonwebtoken 9.0.2 (JWT HS256) |
| 보안 | Helmet 7.1.0 |
| 로깅 | Winston 3.11.0 |

## API 엔드포인트

| 엔드포인트 | 메소드 | 인증 | 설명 |
|-----------|-------|------|-----|
| `/` | GET | 없음 | 서비스 정보 및 버전 |
| `/auth` | POST | 없음 | JWT 토큰 발급 (token_passphrase 필요) |
| `/mcp/health` | GET | 없음 | 헬스체크 (uptime, SSH 상태) |
| `/mcp/status` | GET | JWT | 상세 상태 (메모리, 환경 정보) |
| `/mcp/run` | POST | JWT + 검증 | SSH 명령 실행 |

## 보안 계층 (5단계)

### 1. 네트워크 격리

- **위치**: `src/index.ts:16,52-57`
- 서버 바인딩: `127.0.0.1:4000` 전용
- CORS: `localhost`, `127.0.0.1`만 허용

### 2. JWT 인증

- **위치**: `src/middleware/auth.ts`, `src/utils/jwt.ts`
- HS256 알고리즘 서명 검증
- 30분 만료 시간
- Issuer 검증
- 에러 유형별 응답: `expired`, `issuer_mismatch`, `invalid`

### 3. 토큰 발급 제어

- **위치**: `src/routes/auth.ts`
- `TOKEN_PASSPHRASE` 검증 후 JWT 발급
- 상세한 사용법 안내 메시지 포함

### 4. 명령어 검증

- **위치**: `src/middleware/validator.ts`
- **화이트리스트**: prefix 매칭 (예: `kubectl` → `kubectl get pods` 허용)
- **블랙리스트**: substring 매칭 (예: `rm -rf` 차단)
- 블랙리스트 우선 적용
- `rules.json` 핫 리로드 (fs.watch)

### 5. SSH 자격증명 보호

- **위치**: `src/services/ssh-manager.ts`
- SSH 키는 네트워크로 전송되지 않음
- 비밀번호는 localhost로만 전송
- 작업 디렉토리 `/tmp` 고정

## 명령어 필터링 규칙

**파일**: `rules.json`

### 허용 명령어 (14개)

```
kubectl, docker, htop, ls, df, free, uptime,
tail, grep, cat /var/log, ps, top, netstat, ss, journalctl
```

### 차단 패턴 (23개)

```
rm, rm -rf, shutdown, reboot, halt, poweroff, passwd,
scp, chmod 777, cat ~/.ssh, cat /etc/shadow, mkfs,
dd if=, > /dev/, curl | bash, wget | bash, nc -l 등
```

## SSH 연결 관리

**위치**: `src/services/ssh-manager.ts`

| 항목 | 설정 |
|-----|-----|
| 설계 | Ephemeral 연결 (요청마다 새 연결) |
| 인증 우선순위 | password > SSH key |
| 연결 타임아웃 | 10초 |
| PTY | 비활성화 (깔끔한 출력 분리) |
| 환경변수 | `LANG=en_US.UTF-8`, `LC_ALL=en_US.UTF-8` |

## TypeScript 타입 정의

**위치**: `src/types/index.ts`

```typescript
MCPRunRequest     // API 요청: host, username, command, port?, password?
SSHCommandResult  // 실행 결과: stdout, stderr, exitCode
MCPResponse<T>    // API 응답: success, result?, error?, timestamp?
JWTPayload        // JWT: issuer, iat, exp
AuthRequest       // 인증 요청: token_passphrase
AuthResponse      // 인증 응답: jwt, message, expiresIn, expiresAt
```

## 에러 처리

| HTTP 코드 | 상황 |
|----------|-----|
| 400 | 필수 파라미터 누락 |
| 401 | JWT 인증 실패 (만료/무효/issuer 불일치) |
| 403 | 명령어 검증 실패 |
| 404 | 엔드포인트 없음 |
| 500 | SSH 연결 실패, 서버 오류 |

## 로깅

**위치**: `src/utils/logger.ts`

| 항목 | 설정 |
|-----|-----|
| 출력 | Console + 파일 |
| 파일 위치 | `logs/combined.log`, `logs/error.log` |
| 로테이션 | 5MB, 5개 파일 유지 |
| 레벨 | development=debug, production=info |

## 환경변수

| 변수 | 필수 | 설명 |
|-----|-----|-----|
| `TOKEN_PASSPHRASE` | O | JWT 발급용 패스프레이즈 |
| `JWT_SECRET_KEY` | O | JWT 서명 키 |
| `JWT_ISSUER` | O | JWT 발급자 식별자 |
| `SSH_KEY_PATH` | X | SSH 개인키 경로 |
| `SSH_PASSPHRASE` | X | SSH 키 패스프레이즈 |
| `PORT` | X | 서버 포트 (기본: 4000) |
| `LOG_LEVEL` | X | 로그 레벨 |

## 파일 구조

```
src/
├── index.ts              # Express 서버, 미들웨어 설정
├── routes/
│   ├── auth.ts           # POST /auth - JWT 발급
│   └── mcp.ts            # /mcp/* 엔드포인트
├── middleware/
│   ├── auth.ts           # JWT 인증 미들웨어
│   └── validator.ts      # 명령어 검증 미들웨어
├── services/
│   └── ssh-manager.ts    # SSH 연결/실행 (싱글톤)
├── utils/
│   ├── jwt.ts            # JWT 생성/검증 유틸
│   └── logger.ts         # Winston 로거
└── types/
    └── index.ts          # TypeScript 인터페이스
```

## 특이사항

1. **Ephemeral SSH**: 세션 상태가 유지되지 않음 (`cd` 명령 효과 없음)
2. **핫 리로드**: `rules.json` 변경 시 서버 재시작 없이 적용
3. **Fallback 규칙**: rules.json 로드 실패 시 안전한 기본값 사용
4. **Graceful Shutdown**: SIGTERM/SIGINT 처리
5. **Body 제한**: 10KB (DoS 방지)

## 요청 흐름

### 인증 흐름

```
1. Client: POST /auth + token_passphrase
    ↓
2. Server: TOKEN_PASSPHRASE 검증
    ↓
3. Server: JWT 생성 (30분 만료, JWT_SECRET_KEY 서명)
    ↓
4. Server: JWT + 사용법 안내 반환
    ↓
5. Client: MCP_JWT_TOKEN 환경변수에 저장
```

### API 요청 흐름

```
Client Request
    ↓
Express Global Middleware
    ├─ Helmet (보안 헤더)
    ├─ CORS (localhost 전용)
    ├─ Body Parser (10kb 제한)
    └─ Request Logger
    ↓
Route: POST /mcp/run
    ↓
Route-Specific Middleware Chain
    ├─ authenticateToken
    │   ├─ Authorization 헤더에서 JWT 추출
    │   ├─ JWT_SECRET_KEY로 서명 검증
    │   ├─ JWT_ISSUER 일치 확인
    │   └─ 만료 시간 검증 (30분)
    ├─ validateCommandMiddleware
    │   ├─ rules.json 로드 (핫 리로드)
    │   ├─ blockedPatterns 검사 (substring)
    │   └─ allowedCommands 검사 (prefix)
    ↓
Route Handler
    ├─ params 추출: {host, username, command, port, password}
    ├─ SSHManager.runCommand() 호출
    │   ├─ SSH 연결 생성 (10s 타임아웃)
    │   ├─ /tmp 디렉토리에서 명령 실행
    │   ├─ stdout/stderr/exitCode 캡처
    │   └─ 즉시 연결 종료
    └─ MCPResponse JSON 반환
```
