/**
 * MCP Streamable HTTP Transport
 * Claude Code MCP 프로토콜 구현
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import {
  JsonRpcRequest,
  MCP_HEADERS,
  MCP_PROTOCOL_VERSION,
  MCPSession,
} from '../types/mcp';
import {
  parseJsonRpcRequest,
  Errors,
  isNotification,
} from '../utils/json-rpc';
import { handleMCPMethod } from './mcp-handlers';

const router = Router();

// ============================================
// 세션 저장소 (인메모리)
// ============================================

const sessions = new Map<string, MCPSession>();

// 세션 타임아웃 (5분)
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT || '300000', 10);

// 주기적 세션 정리 (1분마다)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivityAt.getTime() > SESSION_TIMEOUT_MS) {
      sessions.delete(id);
      logger.info(`[MCP] Session expired: ${id}`);
    }
  }
}, 60000);

// ============================================
// 헬퍼 함수
// ============================================

function getOrCreateSession(req: Request): MCPSession {
  // Express normalizes headers to lowercase
  const headerKey = MCP_HEADERS.SESSION_ID.toLowerCase();
  const sessionId = req.headers[headerKey] as string;

  logger.debug(`[MCP] Looking for session: ${sessionId}, available: ${Array.from(sessions.keys()).join(', ')}`);

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActivityAt = new Date();
    logger.debug(`[MCP] Found existing session: ${sessionId}, initialized: ${session.initialized}`);
    return session;
  }

  // 새 세션 생성
  const newSession: MCPSession = {
    id: uuidv4(),
    createdAt: new Date(),
    lastActivityAt: new Date(),
    initialized: false,
  };
  sessions.set(newSession.id, newSession);
  logger.info(`[MCP] New session created: ${newSession.id}`);

  return newSession;
}

function validateProtocolVersion(req: Request): boolean {
  const version = req.headers[MCP_HEADERS.PROTOCOL_VERSION.toLowerCase()];
  // 버전 헤더가 없으면 허용 (초기 연결 시)
  if (!version) return true;
  return version === MCP_PROTOCOL_VERSION;
}

// ============================================
// POST /mcp - JSON-RPC 요청 처리
// ============================================

router.post('/', async (req: Request, res: Response) => {
  // 프로토콜 버전 검증
  if (!validateProtocolVersion(req)) {
    const response = Errors.invalidRequest(null, {
      message: `Unsupported protocol version. Expected: ${MCP_PROTOCOL_VERSION}`,
    });
    res.status(400).json(response);
    return;
  }

  // 세션 가져오기 또는 생성
  const session = getOrCreateSession(req);

  // JSON-RPC 요청 파싱
  let request: JsonRpcRequest;
  try {
    // body가 이미 파싱되어 있으면 직접 사용
    if (typeof req.body === 'object' && req.body !== null) {
      request = req.body as JsonRpcRequest;
      // 기본 검증
      if (request.jsonrpc !== '2.0' || !request.method) {
        throw new Error('Invalid JSON-RPC request');
      }
    } else {
      request = parseJsonRpcRequest(JSON.stringify(req.body));
    }
  } catch (error) {
    const response = Errors.parseError();
    res.status(400).json(response);
    return;
  }

  logger.info(`[MCP] ${request.method} from session ${session.id}`);

  // 메소드 핸들러 호출
  try {
    const response = await handleMCPMethod(request, session);

    // Notification은 응답 없음
    if (isNotification(request)) {
      res.status(204).send();
      return;
    }

    // 세션 ID 헤더 추가
    res.setHeader(MCP_HEADERS.SESSION_ID, session.id);
    res.setHeader(MCP_HEADERS.PROTOCOL_VERSION, MCP_PROTOCOL_VERSION);
    res.json(response);

  } catch (error) {
    logger.error(`[MCP] Error handling ${request.method}: ${error}`);
    const response = Errors.internalError(
      request.id ?? null,
      error instanceof Error ? error.message : 'Unknown error'
    );
    res.status(500).json(response);
  }
});

// ============================================
// GET /mcp - SSE 스트림
// ============================================

router.get('/', (req: Request, res: Response) => {
  // 프로토콜 버전 검증
  if (!validateProtocolVersion(req)) {
    res.status(400).json({
      error: `Unsupported protocol version. Expected: ${MCP_PROTOCOL_VERSION}`,
    });
    return;
  }

  // 세션 확인
  const sessionId = req.headers[MCP_HEADERS.SESSION_ID.toLowerCase()] as string;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const session = sessions.get(sessionId)!;
  session.lastActivityAt = new Date();

  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    [MCP_HEADERS.SESSION_ID]: session.id,
    [MCP_HEADERS.PROTOCOL_VERSION]: MCP_PROTOCOL_VERSION,
  });

  // 연결 유지를 위한 주기적 ping
  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  // Last-Event-ID 처리 (재연결 시)
  const lastEventId = req.headers[MCP_HEADERS.LAST_EVENT_ID.toLowerCase()];
  if (lastEventId) {
    logger.info(`[MCP] SSE reconnection from event ${lastEventId}`);
    // TODO: 이벤트 재전송 로직 (필요시 구현)
  }

  logger.info(`[MCP] SSE stream opened for session ${session.id}`);

  // 연결 종료 처리
  req.on('close', () => {
    clearInterval(pingInterval);
    logger.info(`[MCP] SSE stream closed for session ${session.id}`);
  });

  // 초기 연결 확인 이벤트
  const eventId = uuidv4();
  res.write(`id: ${eventId}\n`);
  res.write(`event: connected\n`);
  res.write(`data: {"sessionId":"${session.id}"}\n\n`);
});

// ============================================
// DELETE /mcp - 세션 종료
// ============================================

router.delete('/', (req: Request, res: Response) => {
  const sessionId = req.headers[MCP_HEADERS.SESSION_ID.toLowerCase()] as string;

  if (!sessionId) {
    res.status(400).json({ error: 'MCP-Session-Id header required' });
    return;
  }

  if (!sessions.has(sessionId)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  sessions.delete(sessionId);
  logger.info(`[MCP] Session terminated: ${sessionId}`);

  res.status(204).send();
});

// ============================================
// 세션 조회 (내부용)
// ============================================

export function getSession(sessionId: string): MCPSession | undefined {
  return sessions.get(sessionId);
}

export function getAllSessions(): MCPSession[] {
  return Array.from(sessions.values());
}

export default router;
