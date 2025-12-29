# TASK-01-01: JWT 인증 코드 제거

**Phase**: 1 (기반 구조 변경)
**의존성**: 없음 (첫 번째 태스크)
**산출물**: 삭제된 파일 3개, 수정된 파일 4개

## 목표

JWT 기반 인증 시스템을 완전히 제거하여 MCP 세션 기반 아키텍처로 전환할 준비를 합니다.

## 상세 작업

### 1.1 파일 삭제

| 파일 | 이유 |
|-----|------|
| `src/middleware/auth.ts` | JWT 인증 미들웨어 |
| `src/utils/jwt.ts` | JWT 생성/검증 유틸리티 |
| `src/routes/auth.ts` | JWT 발급 엔드포인트 |

### 1.2 index.ts 수정

**제거할 import**:

```typescript
// 삭제
import authRoutes from './routes/auth';
```

**제거할 라우트**:

```typescript
// 삭제
app.use('/auth', authRoutes);
```

**수정할 루트 응답** (`/` 엔드포인트):

```typescript
// 기존
authentication: 'JWT-based (30 minute expiry)',
endpoints: {
  auth: 'POST /auth (issue JWT token with token_passphrase)',
  // ...
}

// 변경
authentication: 'MCP session-based',
endpoints: {
  mcp: 'POST/GET/DELETE /mcp (MCP protocol)',
  // ...
}
```

**제거할 환경변수 검증**:

```typescript
// 기존
const requiredEnvVars = ['TOKEN_PASSPHRASE', 'JWT_SECRET_KEY', 'JWT_ISSUER'];

// 변경
const requiredEnvVars: string[] = []; // JWT 관련 제거
```

**제거할 시작 로그**:

```typescript
// 삭제
logger.info(`🔐 SSH Key Path: ${process.env.SSH_KEY_PATH || 'Not configured'}`);
logger.info(`🛡️  Authentication: JWT-based (30 minute expiry)`);
logger.info(`🔑 JWT Issuer: ${process.env.JWT_ISSUER}`);
logger.info(`  POST http://${HOST}:${PORT}/auth (obtain JWT token)`);
```

### 1.3 routes/mcp.ts 수정

**제거할 import**:

```typescript
// 삭제
import { authenticateToken } from '../middleware/auth';
```

**제거할 미들웨어 적용**:

```typescript
// 기존
router.get('/status', authenticateToken, (req, res) => { ... });
router.post('/run', authenticateToken, validateCommandMiddleware, async (req, res) => { ... });

// 변경 (임시 - Phase 2에서 완전 재작성)
router.get('/status', (req, res) => { ... });
router.post('/run', validateCommandMiddleware, async (req, res) => { ... });
```

### 1.4 types/index.ts 수정

**제거할 타입**:

```typescript
// 삭제
export interface JWTPayload {
  issuer: string;
  iat: number;
  exp: number;
}

export interface AuthRequest {
  token_passphrase: string;
}

export interface AuthResponse {
  jwt: string;
  message: string;
  expiresIn: string;
  expiresAt: string;
}
```

### 1.5 package.json 수정

**제거할 의존성**:

```json
// dependencies에서 삭제
"jsonwebtoken": "^9.0.2"
```

**제거할 devDependencies**:

```json
// devDependencies에서 삭제
"@types/jsonwebtoken": "^9.0.5"
```

### 1.6 환경변수 정리

**.env에서 제거**:

```
TOKEN_PASSPHRASE=...
JWT_SECRET_KEY=...
JWT_ISSUER=...
```

**.env.example 업데이트** (있는 경우):

```
# 제거
TOKEN_PASSPHRASE=your-secure-passphrase
JWT_SECRET_KEY=your-256-bit-secret
JWT_ISSUER=local-ssh-mcp
```

### 1.7 스크립트 수정

**scripts/ssh-mcp-run.sh**:

JWT 토큰 관련 로직 제거 (Phase 5에서 완전 재작성 또는 삭제 예정, 이 태스크에서는 주석 처리)

```bash
# 주석 처리
# if [ -z "$MCP_JWT_TOKEN" ]; then
#   echo "Error: MCP_JWT_TOKEN not set"
#   exit 1
# fi
```

## 입력

- 현재 v2.0.0 코드베이스

## 출력

- JWT 관련 코드가 완전히 제거된 코드베이스
- 서버가 인증 없이 동작 (임시 상태)

## 검증 기준

- [ ] `src/middleware/auth.ts` 파일 삭제됨
- [ ] `src/utils/jwt.ts` 파일 삭제됨
- [ ] `src/routes/auth.ts` 파일 삭제됨
- [ ] `npm run build` 성공 (TypeScript 컴파일 에러 없음)
- [ ] `npm run dev` 실행 시 JWT 관련 에러 없음
- [ ] `/auth` 엔드포인트 404 반환
- [ ] `/mcp/health` 정상 동작
- [ ] `/mcp/run` 인증 없이 동작 (임시)

## 참조

- CLARIFY: 섹션 7.2 (제거 대상 의존성)
- 선행 태스크: 없음
- 후행 태스크: TASK-01-02
