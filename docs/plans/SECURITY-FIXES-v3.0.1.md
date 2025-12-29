# v3.0.1 보안 개선사항

## 개요

PR #3 코드 리뷰에서 발견된 Critical 보안 이슈 수정

## 이슈 목록

### 1. Passphrase 환경변수 노출

**파일**: `src/routes/mcp-tools.ts:244-248`

**문제**: SSH 패스프레이즈를 `process.env.SSH_PASSPHRASE`에 저장하여 민감 정보 노출 및 Race Condition 발생 가능

**해결**: SSH config 객체에 직접 전달

### 2. Command Injection via cwd

**파일**: `src/services/session-manager.ts:203-204`

**문제**: `cd ${session.cwd}` 형태로 쉘 명령 구성 시 cwd에 `; malicious_command` 주입 가능

**해결**: cwd 값을 쉘 이스케이프 처리

### 3. SSHManager 싱글톤 Race Condition

**파일**: `src/routes/mcp-tools.ts:251-255`

**문제**: 싱글톤 SSHManager를 동시 요청에서 공유하여 연결 충돌

**해결**: Ephemeral 모드에서 새 NodeSSH 인스턴스 생성

### 4. 보안 규칙 로드 실패 시 Fallback

**파일**: `src/middleware/validator.ts:37-46`

**문제**: rules.json 로드 실패 시 기본 규칙으로 대체되어 의도치 않은 명령 허용 가능

**해결**: 로드 실패 시 서버 시작 차단 (fail-fast)

### 5. 위험한 타입 단언

**파일**: `src/routes/mcp-tools.ts:93`

**문제**: `as unknown as T` 패턴으로 타입 안전성 우회

**해결**: 런타임 검증 함수 추가
