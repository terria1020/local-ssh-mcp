# CLARIFY: v3.0.0 구현 공통 규칙 및 검증 기준

**문서 ID**: CLARIFY-001
**버전**: 1.0.0
**최종 수정**: 2025-12-26
**상태**: 활성

## 목적

이 문서는 v3.0.0 리팩토링의 모든 태스크가 준수해야 하는 공통 규칙을 정의합니다. 모든 구현 태스크는 이 문서의 규칙을 따라야 하며, 문서 간 충돌 시 이 문서가 우선합니다.

---

## 1. 용어 정의

| 용어 | 정의 | 사용 맥락 |
|-----|------|----------|
| MCP | Model Context Protocol | Claude Code 통신 프로토콜 |
| Transport | HTTP/SSE 기반 메시지 전송 계층 | MCP 서버-클라이언트 통신 |
| Session | MCP 세션 (MCP-Session-Id로 식별) | 클라이언트-서버 연결 단위 |
| SSH Session | SSH 연결 (SessionManager 관리) | 원격 서버 연결 단위 |
| Credential | SSH 접속 자격증명 | host, username, 인증정보 묶음 |
| Tool | MCP tool (ssh_execute 등) | Claude Code가 호출하는 기능 |
| Ephemeral | 단일 명령 후 연결 종료 | SSH 연결 모드 |
| Persistent | 다중 명령 동안 연결 유지 | SSH 연결 모드 |

---

## 2. 프로토콜 규격

### 2.1 MCP 프로토콜 버전

```
MCP-Protocol-Version: 2025-11-25
```

**모든 구현체는 이 버전을 사용해야 함**

### 2.2 JSON-RPC 2.0 형식

**요청 (Request)**:

```typescript
interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id: number | string;  // notification이면 없음
}
```

**응답 (Response)**:

```typescript
interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: JsonRpcError;
  id: number | string | null;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
```

### 2.3 표준 에러 코드

| 코드 | 이름 | 의미 |
|-----|------|------|
| -32700 | Parse error | JSON 파싱 실패 |
| -32600 | Invalid Request | 유효하지 않은 JSON-RPC 요청 |
| -32601 | Method not found | 존재하지 않는 메소드 |
| -32602 | Invalid params | 잘못된 파라미터 |
| -32603 | Internal error | 내부 서버 오류 |
| -32000 | Server error (SSH) | SSH 연결/실행 오류 |
| -32001 | Server error (Credential) | 자격증명 오류 |
| -32002 | Server error (Session) | 세션 오류 |
| -32003 | Server error (Validation) | 명령어 검증 실패 |

---

## 3. HTTP 헤더 규격

### 3.1 필수 요청 헤더

| 헤더 | 값 | 필수 |
|-----|---|-----|
| `Content-Type` | `application/json` | POST 요청 시 |
| `Accept` | `application/json` 또는 `text/event-stream` | 항상 |
| `MCP-Protocol-Version` | `2025-11-25` | 항상 |

### 3.2 선택적 요청 헤더

| 헤더 | 값 | 용도 |
|-----|---|-----|
| `MCP-Session-Id` | 세션 ID 문자열 | 세션 유지 |
| `Last-Event-ID` | SSE 이벤트 ID | SSE 재연결 시 |

### 3.3 응답 헤더

| 헤더 | 값 | 조건 |
|-----|---|-----|
| `Content-Type` | `application/json` | JSON 응답 시 |
| `Content-Type` | `text/event-stream` | SSE 스트림 시 |
| `MCP-Session-Id` | 세션 ID | 세션 생성/유지 시 |
| `Cache-Control` | `no-cache` | SSE 스트림 시 |

---

## 4. 파일 명명 규칙

### 4.1 소스 파일

| 패턴 | 예시 | 용도 |
|-----|------|------|
| `kebab-case.ts` | `mcp-transport.ts` | 일반 모듈 |
| `*.types.ts` 또는 `types/*.ts` | `mcp.ts` | 타입 정의 |
| `*.test.ts` | `mcp-transport.test.ts` | 테스트 파일 |

### 4.2 설정 파일

| 파일명 | 용도 | gitignore |
|-------|------|-----------|
| `credentials.json` | SSH 자격증명 | O (필수) |
| `credentials.example.json` | 자격증명 예시 | X |
| `rules.json` | 명령어 규칙 | X |
| `.env` | 환경변수 | O |
| `.env.example` | 환경변수 예시 | X |

### 4.3 문서 파일

| 패턴 | 예시 | 용도 |
|-----|------|------|
| `YYYYMMDD-{name}-plan.md` | `20251226-v3-mcp-sse-refactoring-plan.md` | 계획 문서 |
| `TASK-{phase}-{number}.md` | `TASK-01-01.md` | 태스크 문서 |
| `00-CLARIFY-*.md` | `00-CLARIFY-common-rules.md` | 검증 기준 |

---

## 5. 코드 규칙

### 5.1 TypeScript 규칙

```typescript
// 인터페이스: Pascal + 접두어
interface MCPRequest { }
interface SSHConfig { }
interface JsonRpcRequest { }

// 타입: Pascal
type CredentialId = string;
type SessionId = string;

// 클래스: Pascal
class SessionManager { }
class CredentialManager { }

// 함수: camelCase
function parseJsonRpc() { }
function validateCommand() { }

// 상수: UPPER_SNAKE
const MAX_COMMANDS_PER_SESSION = 5;
const SESSION_TIMEOUT_MS = 300000;
```

### 5.2 에러 처리 패턴

```typescript
// JSON-RPC 에러 반환
function createJsonRpcError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    error: { code, message, data },
    id
  };
}

// 사용 예시
return createJsonRpcError(req.id, -32001, "Credential not found", { credentialId });
```

### 5.3 로깅 패턴

```typescript
// 레벨별 사용 기준
logger.error()  // 복구 불가능한 오류
logger.warn()   // 복구 가능한 오류, 잠재적 문제
logger.info()   // 중요한 상태 변경 (연결, 세션, 요청)
logger.debug()  // 개발용 상세 정보

// 로그 포맷
logger.info(`[MCP] ${method} request from session ${sessionId}`);
logger.error(`[SSH] Connection failed: ${error.message}`, { host, username });
```

---

## 6. 보안 규칙

### 6.1 필수 보안 요구사항

| 항목 | 규칙 | 검증 방법 |
|-----|------|----------|
| 서버 바인딩 | `127.0.0.1` 전용 | `app.listen(PORT, '127.0.0.1')` |
| Origin 검증 | localhost만 허용 | Origin 헤더 검사 |
| 자격증명 보호 | base64 인코딩 | credentials.json 형식 확인 |
| 명령어 검증 | whitelist/blacklist | rules.json 적용 |
| 로그 보안 | 비밀번호 로깅 금지 | 코드 리뷰 |

### 6.2 금지 사항

- 자격증명 평문 로깅
- 외부 IP 바인딩
- Origin 검증 우회
- 명령어 검증 우회

---

## 7. 의존성 규칙

### 7.1 허용된 의존성

| 패키지 | 버전 | 용도 |
|-------|-----|------|
| express | ^4.18.x | HTTP 서버 |
| node-ssh | ^13.x | SSH 연결 |
| helmet | ^7.x | 보안 헤더 |
| cors | ^2.x | CORS 처리 |
| winston | ^3.x | 로깅 |
| dotenv | ^16.x | 환경변수 |

### 7.2 제거 대상

| 패키지 | 이유 |
|-------|------|
| jsonwebtoken | JWT 인증 제거 |

### 7.3 추가 금지

- 새로운 인증 라이브러리
- 외부 API 호출 라이브러리
- 데이터베이스 라이브러리

---

## 8. 테스트 기준

### 8.1 테스트 범위

| 구성요소 | 테스트 유형 | 필수 여부 |
|---------|-----------|----------|
| JSON-RPC 파서 | 단위 테스트 | 필수 |
| MCP 핸들러 | 통합 테스트 | 필수 |
| CredentialManager | 단위 테스트 | 필수 |
| SessionManager | 단위 테스트 | 필수 |
| 명령어 검증 | 단위 테스트 | 필수 |
| E2E (Claude Code 연동) | 수동 테스트 | 필수 |

### 8.2 테스트 시나리오

**MCP 핸드셰이크**:

1. initialize 요청 → 정상 응답
2. 잘못된 protocolVersion → 에러 응답
3. initialized 알림 → 세션 활성화

**SSH 실행**:

1. Ephemeral 단일 명령 → 성공
2. Persistent 다중 명령 → 세션 유지 확인
3. 차단된 명령 → -32003 에러
4. 잘못된 credentialId → -32001 에러

---

## 9. 태스크 문서 구조

모든 태스크 문서는 아래 구조를 따릅니다:

```markdown
# TASK-{phase}-{number}: {제목}

**Phase**: {phase 번호}
**의존성**: {선행 태스크 ID}
**산출물**: {생성/수정 파일 목록}

## 목표
{이 태스크가 달성해야 하는 것}

## 상세 작업

### {작업번호}. {작업명}
{상세 설명}

## 입력
{필요한 선행 결과물}

## 출력
{생성되는 결과물}

## 검증 기준
- [ ] {체크리스트 항목}

## 참조
- CLARIFY: {관련 섹션}
- 선행 태스크: {TASK-XX-XX}
```

---

## 10. 문서 간 일관성 검증 체크리스트

### 10.1 용어 일관성

- [ ] 모든 문서에서 "MCP Session"과 "SSH Session" 구분 사용
- [ ] credentialId vs credential_id → `credentialId` (camelCase) 통일
- [ ] sessionId vs session_id → `sessionId` (camelCase) 통일

### 10.2 프로토콜 일관성

- [ ] 모든 JSON-RPC 예시가 `"jsonrpc": "2.0"` 포함
- [ ] 에러 코드가 섹션 2.3 표와 일치
- [ ] HTTP 헤더명이 섹션 3과 일치

### 10.3 파일 참조 일관성

- [ ] 파일 경로가 섹션 4와 일치
- [ ] 타입 정의 위치가 일관됨 (`src/types/mcp.ts`)

### 10.4 설정값 일관성

| 설정 | 기준값 | 검증 |
|-----|-------|------|
| SESSION_TIMEOUT | 300000ms (5분) | 모든 문서 동일 |
| MAX_COMMANDS_PER_SESSION | 5 | 모든 문서 동일 |
| MCP_PROTOCOL_VERSION | 2025-11-25 | 모든 문서 동일 |
| SSH_CONNECTION_TIMEOUT | 10000ms (10초) | 모든 문서 동일 |

---

## 11. 변경 이력

| 버전 | 날짜 | 변경 내용 |
|-----|------|----------|
| 1.0.0 | 2025-12-26 | 초기 작성 |

---

## 12. 승인

- [ ] 아키텍트 검토
- [ ] 보안 규칙 검토
- [ ] 용어 정의 검토
