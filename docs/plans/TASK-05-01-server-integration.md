# TASK-05-01: 서버 통합 및 설정

**Phase**: 5 (통합 및 테스트)
**의존성**: TASK-04-02
**산출물**: `src/index.ts` 완전 재작성

## 목표

모든 구성요소를 통합하여 v3.0.0 서버를 완성합니다. 기존 REST API 엔드포인트를 제거하고 MCP 전용으로 전환합니다.

## 상세 작업

### 1.1 index.ts 완전 재작성

```typescript
/**
 * Local SSH MCP Server v3.0.0
 * Claude Code MCP 프로토콜 구현
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import mcpTransportRoutes from './routes/mcp-transport';
import { validateOrigin } from './middleware/origin-validator';
import { initializeCredentialManager, getCredentialManager } from './services/credential-manager';
import { getSessionManager } from './services/session-manager';
import logger from './utils/logger';
import { MCP_PROTOCOL_VERSION } from './types/mcp';

// 환경변수 로드
dotenv.config();

// Express 앱 생성
const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '127.0.0.1'; // 로컬 호스트 전용

// ============================================
// 미들웨어 설정
// ============================================

// 보안 헤더
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}));

// CORS (localhost 전용)
app.use(cors({
  origin: ['http://127.0.0.1', 'http://localhost'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: [
    'Content-Type',
    'Accept',
    'MCP-Protocol-Version',
    'MCP-Session-Id',
    'Last-Event-ID',
  ],
  exposedHeaders: [
    'MCP-Session-Id',
    'MCP-Protocol-Version',
  ],
  credentials: true,
}));

// Origin 검증
app.use(validateOrigin);

// JSON 파서
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 요청 로깅
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path} from ${req.ip}`);
  next();
});

// ============================================
// 라우트 등록
// ============================================

// MCP Transport (핵심)
app.use('/mcp', mcpTransportRoutes);

// 루트: 서비스 정보
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'Local SSH MCP Server',
    version: '3.0.0',
    protocol: 'MCP (Model Context Protocol)',
    protocolVersion: MCP_PROTOCOL_VERSION,
    status: 'running',
    transport: 'Streamable HTTP with SSE',
    endpoints: {
      mcp: {
        POST: '/mcp - JSON-RPC requests (initialize, tools/list, tools/call)',
        GET: '/mcp - SSE stream for server notifications',
        DELETE: '/mcp - Close session',
      },
    },
    tools: [
      'ssh_execute - Execute SSH commands',
      'ssh_list_credentials - List available credentials',
      'ssh_session_info - Get session information',
    ],
    security: [
      'Localhost-only binding (127.0.0.1)',
      'Origin header validation',
      'Command whitelist/blacklist (rules.json)',
      'Base64 encoded credentials (credentials.json)',
    ],
  });
});

// Health check (간단한 상태)
app.get('/health', (_req: Request, res: Response) => {
  const credManager = getCredentialManager();
  const sessionManager = getSessionManager();

  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    credentials: credManager.count,
    activeSessions: sessionManager.getSessionsByCredential().length,
  });
});

// ============================================
// 에러 핸들러
// ============================================

// 404
app.use((req: Request, res: Response) => {
  logger.warn(`404 - ${req.method} ${req.path}`);
  res.status(404).json({
    jsonrpc: '2.0',
    error: {
      code: -32601,
      message: 'Endpoint not found',
      data: { path: req.path },
    },
    id: null,
  });
});

// 500
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`, err);

  res.status(500).json({
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
    },
    id: null,
  });
});

// ============================================
// 서버 시작
// ============================================

async function startServer(): Promise<void> {
  try {
    // 자격증명 관리자 초기화
    await initializeCredentialManager();

    // 세션 관리자 초기화
    getSessionManager();

    // 서버 시작
    app.listen(Number(PORT), HOST, () => {
      logger.info('='.repeat(60));
      logger.info('Local SSH MCP Server v3.0.0');
      logger.info('='.repeat(60));
      logger.info(`Server: http://${HOST}:${PORT}`);
      logger.info(`Protocol: MCP ${MCP_PROTOCOL_VERSION}`);
      logger.info(`Transport: Streamable HTTP with SSE`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('='.repeat(60));
      logger.info('Claude Code integration:');
      logger.info(`  claude mcp add local-ssh http://${HOST}:${PORT}/mcp`);
      logger.info('='.repeat(60));
    });

  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

// ============================================
// Graceful Shutdown
// ============================================

function shutdown(): void {
  logger.info('Shutting down...');

  try {
    getSessionManager().dispose();
    getCredentialManager().dispose();
  } catch (error) {
    logger.error(`Shutdown error: ${error}`);
  }

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', promise, 'reason:', reason);
});

// 시작
startServer();
```

### 1.2 기존 routes/mcp.ts 삭제

이전 REST API 라우터 삭제:

```bash
rm src/routes/mcp.ts
```

### 1.3 환경변수 템플릿 업데이트

`.env.example` 생성/수정:

```env
# Server Configuration
PORT=4000
NODE_ENV=development
LOG_LEVEL=info

# Credentials
CREDENTIALS_FILE=./credentials.json

# Session Settings
SESSION_TIMEOUT=300000
MAX_COMMANDS_PER_SESSION=5

# Optional: Default SSH Key (fallback)
# SSH_KEY_PATH=/path/to/.ssh/id_rsa
# SSH_PASSPHRASE=optional-passphrase
```

### 1.4 package.json 업데이트

```json
{
  "name": "local-ssh-mcp",
  "version": "3.0.0",
  "description": "MCP server for SSH command execution via Claude Code",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "clean": "rm -rf dist",
    "watch": "tsc -w"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "node-ssh": "^13.1.0",
    "uuid": "^9.0.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.2"
  }
}
```

## 입력

- Phase 1-4의 모든 구성요소

## 출력

- 완전히 통합된 v3.0.0 서버
- MCP 전용 엔드포인트
- 환경변수 템플릿

## 검증 기준

- [ ] 서버 시작 성공
- [ ] `GET /` 서비스 정보 반환
- [ ] `GET /health` 상태 반환
- [ ] `POST /mcp` JSON-RPC 처리
- [ ] `GET /mcp` SSE 스트림
- [ ] `DELETE /mcp` 세션 종료
- [ ] 기존 `/auth`, `/mcp/run` 엔드포인트 제거됨
- [ ] Graceful shutdown 동작
- [ ] `npm run build` 성공

## 참조

- CLARIFY: 섹션 6 (보안 규칙)
- 선행 태스크: TASK-04-02
- 후행 태스크: TASK-05-02
