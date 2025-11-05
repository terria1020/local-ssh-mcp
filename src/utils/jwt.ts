import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';
import logger from './logger';

/**
 * JWT 토큰 생성
 * @param issuer JWT 발급자 식별자
 * @returns 30분 유효한 JWT 토큰
 */
export function generateToken(issuer: string): string {
  const secretKey = process.env.JWT_SECRET_KEY;

  if (!secretKey) {
    throw new Error('JWT_SECRET_KEY is not configured');
  }

  const payload: JWTPayload = {
    issuer,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (30 * 60) // 30분
  };

  const token = jwt.sign(payload, secretKey, { algorithm: 'HS256' });
  logger.info(`JWT token generated for issuer: ${issuer}, expires in 30 minutes`);

  return token;
}

/**
 * JWT 토큰 검증 결과
 */
export interface TokenVerificationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
  errorType?: 'expired' | 'invalid' | 'issuer_mismatch';
}

/**
 * JWT 토큰 검증
 * @param token JWT 토큰
 * @returns 검증 결과
 */
export function verifyToken(token: string): TokenVerificationResult {
  const secretKey = process.env.JWT_SECRET_KEY;
  const expectedIssuer = process.env.JWT_ISSUER;

  if (!secretKey) {
    logger.error('JWT_SECRET_KEY is not configured');
    return {
      valid: false,
      error: 'Server configuration error',
      errorType: 'invalid'
    };
  }

  if (!expectedIssuer) {
    logger.error('JWT_ISSUER is not configured');
    return {
      valid: false,
      error: 'Server configuration error',
      errorType: 'invalid'
    };
  }

  try {
    // JWT 검증 (서명, 만료시간)
    const decoded = jwt.verify(token, secretKey, {
      algorithms: ['HS256']
    }) as JWTPayload;

    // Issuer 검증
    if (decoded.issuer !== expectedIssuer) {
      logger.warn(`JWT issuer mismatch: expected ${expectedIssuer}, got ${decoded.issuer}`);
      return {
        valid: false,
        error: 'JWT issuer mismatch',
        errorType: 'issuer_mismatch'
      };
    }

    logger.debug('JWT token verified successfully');
    return {
      valid: true,
      payload: decoded
    };

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('JWT token has expired');
      return {
        valid: false,
        error: 'JWT token expired. Please obtain a new token from /auth endpoint',
        errorType: 'expired'
      };
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn(`JWT verification failed: ${error.message}`);
      return {
        valid: false,
        error: 'Invalid JWT token',
        errorType: 'invalid'
      };
    }

    logger.error(`Unexpected error during JWT verification: ${error}`);
    return {
      valid: false,
      error: 'Token verification failed',
      errorType: 'invalid'
    };
  }
}

/**
 * JWT 토큰의 만료 시간 가져오기
 * @param token JWT 토큰
 * @returns 만료 시간 (ISO 8601 형식) 또는 null
 */
export function getTokenExpiration(token: string): string | null {
  try {
    const decoded = jwt.decode(token) as JWTPayload | null;
    if (decoded && decoded.exp) {
      return new Date(decoded.exp * 1000).toISOString();
    }
    return null;
  } catch (error) {
    logger.error(`Failed to decode JWT token: ${error}`);
    return null;
  }
}
