import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import mcpRoutes from './routes/mcp';
import mcpTransportRouter from './routes/mcp-transport';
import { validateOrigin } from './middleware/origin-validator';
import { initializeCredentialManager, getCredentialManager } from './services/credential-manager';
import { disposeSessionManager } from './services/session-manager';
import { setValidationMode } from './middleware/validator';
import logger from './utils/logger';
import { MCPResponse } from './types';

// 환경변수 로드
dotenv.config();

// Express 앱 생성
const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '127.0.0.1'; // 로컬 호스트만 허용

/**
 * Command-line 인자 파싱
 * @returns 파싱된 옵션 객체
 */
function parseCommandLineArgs(): { noRules: boolean } {
  const args = process.argv.slice(2);
  return {
    noRules: args.includes('--dangerously-no-rules')
  };
}

// 환경변수 검증 (v3.0.0 - JWT 제거)
function validateEnvironment(): void {
  // v3.0.0: JWT 환경변수 더 이상 필요하지 않음
  // SSH_KEY_PATH는 선택적 (credentials.json 파일 사용 시 불필요)
  if (!process.env.SSH_KEY_PATH) {
    logger.info('SSH_KEY_PATH not set - will use credentials.json for SSH authentication');
  }

  logger.info('Environment variables validated successfully');
}

// 보안 미들웨어 설정
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));

// CORS 설정 (로컬 호스트만 허용)
app.use(cors({
  origin: ['http://127.0.0.1', 'http://localhost'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
  credentials: true
}));

// JSON 파서
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 요청 로깅 미들웨어
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path} from ${req.ip}`);
  next();
});

// 라우트 등록
// v3.0.0: MCP Transport 라우트 (메인 MCP 프로토콜 엔드포인트)
app.use('/mcp', validateOrigin, mcpTransportRouter);

// 기존 MCP 라우트 (health, status 등 호환용)
app.use('/mcp', mcpRoutes);

// 루트 경로
app.get('/', (_req: Request, res: Response) => {
  const credManager = getCredentialManager();

  res.json({
    service: 'Local SSH MCP Server',
    version: '3.0.0',
    status: 'running',
    protocol: 'MCP (Model Context Protocol)',
    transport: 'Streamable HTTP + SSE',
    credentials: {
      loaded: credManager.count,
    },
    endpoints: {
      mcp: 'POST/GET/DELETE /mcp (MCP protocol)',
      health: 'GET /mcp/health'
    },
    documentation: 'See README.md for usage instructions'
  });
});

// 404 핸들러
app.use((req: Request, res: Response) => {
  const response: MCPResponse = {
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  };
  logger.warn(`404 - ${req.method} ${req.path} from ${req.ip}`);
  res.status(404).json(response);
});

// 에러 핸들러
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`, err);

  const response: MCPResponse = {
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    timestamp: new Date().toISOString()
  };

  res.status(500).json(response);
});

// 서버 시작
async function startServer(): Promise<void> {
  try {
    // Command-line 인자 파싱
    const args = parseCommandLineArgs();

    // --dangerously-no-rules 플래그 처리
    if (args.noRules) {
      setValidationMode(true);
    }

    // 환경변수 검증
    validateEnvironment();

    // CredentialManager 초기화
    await initializeCredentialManager();
    const credManager = getCredentialManager();
    logger.info(`Credentials loaded: ${credManager.count} credentials available`);

    // 서버 리스닝 시작
    app.listen(Number(PORT), HOST, () => {
      logger.info('='.repeat(60));
      logger.info('Local SSH MCP Server Started (v3.0.0)');
      logger.info('='.repeat(60));

      // NO-RULES 모드 경고
      if (args.noRules) {
        logger.warn('='.repeat(60));
        logger.warn('⚠️  WARNING: COMMAND VALIDATION DISABLED');
        logger.warn('All SSH commands will be allowed without restrictions');
        logger.warn('This mode should ONLY be used in trusted environments');
        logger.warn('='.repeat(60));
      }

      logger.info(`Server listening on: http://${HOST}:${PORT}`);
      logger.info(`SSH Key Path: ${process.env.SSH_KEY_PATH || 'Not configured (use credentials.json)'}`);
      logger.info(`Credentials: ${credManager.count} loaded`);
      logger.info(`Protocol: MCP (Model Context Protocol)`);
      logger.info(`Transport: Streamable HTTP + SSE`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Log Level: ${process.env.LOG_LEVEL || 'info'}`);
      logger.info(`Validation: ${args.noRules ? 'DISABLED (--dangerously-no-rules)' : 'ENABLED'}`);
      logger.info('='.repeat(60));
      logger.info('Available endpoints:');
      logger.info(`  GET  http://${HOST}:${PORT}/mcp/health`);
      logger.info(`  POST http://${HOST}:${PORT}/mcp (MCP JSON-RPC)`);
      logger.info(`  GET  http://${HOST}:${PORT}/mcp (SSE stream)`);
      logger.info(`  DELETE http://${HOST}:${PORT}/mcp (close session)`);
      logger.info('='.repeat(60));
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

// Graceful shutdown 처리
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} signal received: closing HTTP server`);

  try {
    // CredentialManager 정리
    const credManager = getCredentialManager();
    credManager.dispose();

    // SessionManager 정리
    await disposeSessionManager();

    logger.info('Cleanup completed, exiting');
    process.exit(0);
  } catch (error) {
    logger.error(`Error during shutdown: ${error}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 처리되지 않은 프로미스 거부 처리
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 서버 시작
startServer();
