import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import mcpRoutes from './routes/mcp';
import mcpJsonRpcRoutes from './routes/mcp-jsonrpc';
import authRoutes from './routes/auth';
import logger from './utils/logger';
import { MCPResponse } from './types';

// 환경변수 로드
dotenv.config();

// Express 앱 생성
const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '127.0.0.1'; // 로컬 호스트만 허용

// 환경변수 검증
function validateEnvironment(): void {
  // JWT 인증 관련 필수 환경변수
  const requiredEnvVars = ['TOKEN_PASSPHRASE', 'JWT_SECRET_KEY', 'JWT_ISSUER'];
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // SSH_KEY_PATH는 선택적 (비밀번호 인증을 사용할 수도 있음)
  if (!process.env.SSH_KEY_PATH) {
    logger.warn('SSH_KEY_PATH not set - password-based authentication will be required');
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
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
app.use('/auth', authRoutes);           // JWT 토큰 발급 및 인증 정보 관리 엔드포인트
app.use('/mcp', mcpRoutes);             // MCP REST API 엔드포인트 (기존)
app.use('/mcp', mcpJsonRpcRoutes);      // MCP JSON-RPC 2.0 엔드포인트 (신규)

// 루트 경로
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'Local SSH MCP Server',
    version: '3.0.0',
    status: 'running',
    authentication: 'JWT-based (30 minute expiry)',
    features: [
      'MCP JSON-RPC 2.0 Protocol Support',
      'Multi-server credential management',
      'Server-specific command rules',
      'Password/passphrase caching'
    ],
    endpoints: {
      auth: {
        issueToken: 'POST /auth (issue JWT token)',
        addServer: 'POST /auth/add-server (add server credentials)',
        listServers: 'GET /auth/list-servers (list cached servers)',
        removeServer: 'DELETE /auth/remove-server (remove server credentials)'
      },
      mcp: {
        health: 'GET /mcp/health',
        status: 'GET /mcp/status (requires JWT auth)',
        run: 'POST /mcp/run (requires JWT auth, legacy REST API)',
        jsonrpc: 'POST /mcp/jsonrpc (MCP JSON-RPC 2.0, requires JWT auth)'
      }
    },
    documentation: 'See README.md and CLAUDE.md for usage instructions'
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
    // 환경변수 검증
    validateEnvironment();

    // 서버 리스닝 시작
    app.listen(Number(PORT), HOST, () => {
      logger.info('='.repeat(60));
      logger.info('🚀 Local SSH MCP Server Started (v3.0.0)');
      logger.info('='.repeat(60));
      logger.info(`📍 Server listening on: http://${HOST}:${PORT}`);
      logger.info(`🔐 SSH Key Path: ${process.env.SSH_KEY_PATH || 'Not configured'}`);
      logger.info(`🛡️  Authentication: JWT-based (30 minute expiry)`);
      logger.info(`🔑 JWT Issuer: ${process.env.JWT_ISSUER}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📝 Log Level: ${process.env.LOG_LEVEL || 'info'}`);
      logger.info('='.repeat(60));
      logger.info('✨ New Features (v3.0.0):');
      logger.info('  • MCP JSON-RPC 2.0 Protocol Support');
      logger.info('  • Multi-server credential management');
      logger.info('  • Server-specific command rules');
      logger.info('  • Password/passphrase caching');
      logger.info('='.repeat(60));
      logger.info('Available endpoints:');
      logger.info(`  POST http://${HOST}:${PORT}/auth (obtain JWT token)`);
      logger.info(`  POST http://${HOST}:${PORT}/auth/add-server (add credentials)`);
      logger.info(`  GET  http://${HOST}:${PORT}/auth/list-servers (list servers)`);
      logger.info(`  GET  http://${HOST}:${PORT}/mcp/health`);
      logger.info(`  GET  http://${HOST}:${PORT}/mcp/status (requires JWT auth)`);
      logger.info(`  POST http://${HOST}:${PORT}/mcp/run (REST API, requires JWT auth)`);
      logger.info(`  POST http://${HOST}:${PORT}/mcp/jsonrpc (MCP JSON-RPC 2.0, requires JWT auth)`);
      logger.info('='.repeat(60));
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

// Graceful shutdown 처리
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// 처리되지 않은 프로미스 거부 처리
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 서버 시작
startServer();
