# TASK-02-03: Origin 헤더 검증 미들웨어

**Phase**: 2 (MCP Transport 구현)
**의존성**: TASK-02-02
**산출물**: `src/middleware/origin-validator.ts` (신규)

## 목표

DNS rebinding 공격을 방지하기 위한 Origin 헤더 검증 미들웨어를 구현합니다.

## 상세 작업

### 3.1 파일 생성: `src/middleware/origin-validator.ts`

```typescript
/**
 * Origin 헤더 검증 미들웨어
 * DNS rebinding 공격 방지
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// 허용된 Origin 목록
const ALLOWED_ORIGINS = new Set([
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  // Claude Code는 Origin 없이 요청할 수도 있음
]);

// Origin 검증을 건너뛸 경로
const SKIP_PATHS = new Set([
  '/mcp/health',
  '/',
]);

/**
 * Origin 헤더 검증
 * - localhost/127.0.0.1만 허용
 * - Origin 헤더가 없으면 허용 (CLI 클라이언트)
 */
export function validateOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 건너뛸 경로 확인
  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  const origin = req.headers.origin;

  // Origin 헤더가 없으면 허용 (CLI 클라이언트, curl 등)
  if (!origin) {
    next();
    return;
  }

  // 허용된 Origin인지 확인
  if (isAllowedOrigin(origin)) {
    next();
    return;
  }

  // 거부
  logger.warn(`[Security] Blocked request from origin: ${origin}`);
  res.status(403).json({
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: 'Forbidden: Invalid origin',
      data: { origin },
    },
    id: null,
  });
}

/**
 * Origin이 허용되는지 확인
 */
function isAllowedOrigin(origin: string): boolean {
  // 정확히 일치
  if (ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  // localhost 또는 127.0.0.1로 시작하는지 확인 (포트 번호 포함)
  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    // ::1 (IPv6 localhost)
    if (hostname === '::1' || hostname === '[::1]') {
      return true;
    }
  } catch {
    // URL 파싱 실패
    return false;
  }

  return false;
}

/**
 * 동적으로 허용 Origin 추가 (테스트용)
 */
export function addAllowedOrigin(origin: string): void {
  ALLOWED_ORIGINS.add(origin);
  logger.info(`[Security] Added allowed origin: ${origin}`);
}

/**
 * 허용 Origin 목록 조회
 */
export function getAllowedOrigins(): string[] {
  return Array.from(ALLOWED_ORIGINS);
}
```

### 3.2 index.ts에 미들웨어 적용

```typescript
import { validateOrigin } from './middleware/origin-validator';

// CORS 다음에 Origin 검증 적용
app.use(cors({ /* ... */ }));
app.use(validateOrigin);  // 추가
```

### 3.3 MCP 라우터에서 CORS 조정

기존 `helmet`과 `cors` 설정은 유지하되, `/mcp` 엔드포인트에 대해 Origin 검증을 강화합니다.

```typescript
// index.ts에서 MCP 라우트 전에 적용
app.use('/mcp', validateOrigin, mcpTransportRoutes);
```

## 입력

- CLARIFY 섹션 6 (보안 규칙)

## 출력

- `src/middleware/origin-validator.ts` 파일
- Origin 기반 요청 필터링

## 검증 기준

- [ ] `src/middleware/origin-validator.ts` 파일 생성됨
- [ ] `Origin: http://localhost` 허용
- [ ] `Origin: http://127.0.0.1` 허용
- [ ] `Origin: http://evil.com` 차단 (403)
- [ ] Origin 헤더 없는 요청 허용 (CLI)
- [ ] `/mcp/health`는 검증 스킵
- [ ] 로깅에 차단된 Origin 기록
- [ ] `npm run build` 성공

## 참조

- CLARIFY: 섹션 6 (보안 규칙)
- 선행 태스크: TASK-02-02
- 후행 태스크: TASK-03-01
