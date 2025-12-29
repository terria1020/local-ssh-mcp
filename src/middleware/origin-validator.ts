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
