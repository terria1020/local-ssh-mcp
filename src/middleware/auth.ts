import { Request, Response, NextFunction } from 'express';
import { MCPResponse } from '../types';
import { verifyToken } from '../utils/jwt';
import logger from '../utils/logger';

/**
 * Express 미들웨어: JWT 토큰 인증
 * Authorization 헤더의 Bearer JWT 토큰을 검증합니다
 */
export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];

  // Authorization 헤더가 없는 경우
  if (!authHeader) {
    logger.warn(`Authentication failed: No authorization header provided from ${req.ip}`);
    const response: MCPResponse = {
      success: false,
      error: 'Authorization header required. Please obtain a JWT token from POST /auth endpoint',
      timestamp: new Date().toISOString()
    };
    res.status(401).json(response);
    return;
  }

  // Bearer 토큰 파싱
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  // JWT 토큰 검증
  const verification = verifyToken(token);

  if (!verification.valid) {
    // 만료된 토큰인 경우
    if (verification.errorType === 'expired') {
      logger.warn(`Authentication failed: JWT token expired from ${req.ip}`);
      const response: MCPResponse = {
        success: false,
        error: 'JWT token expired. Please obtain a new token from POST /auth endpoint with your token_passphrase',
        timestamp: new Date().toISOString()
      };
      res.status(401).json(response);
      return;
    }

    // Issuer 불일치
    if (verification.errorType === 'issuer_mismatch') {
      logger.warn(`Authentication failed: JWT issuer mismatch from ${req.ip}`);
      const response: MCPResponse = {
        success: false,
        error: 'JWT issuer mismatch. Token may be from unauthorized source',
        timestamp: new Date().toISOString()
      };
      res.status(401).json(response);
      return;
    }

    // 기타 검증 실패 (변조, 잘못된 서명 등)
    logger.warn(`Authentication failed: ${verification.error} from ${req.ip}`);
    const response: MCPResponse = {
      success: false,
      error: verification.error || 'Invalid JWT token',
      timestamp: new Date().toISOString()
    };
    res.status(401).json(response);
    return;
  }

  logger.debug(`JWT authentication successful for request from ${req.ip}`);
  next();
}
