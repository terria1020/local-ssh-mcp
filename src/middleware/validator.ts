import { Request, Response, NextFunction } from 'express';
import { ValidationResult, MCPResponse } from '../types';
import logger from '../utils/logger';
import { getRulesManager } from '../services/rules-manager';

/**
 * 명령어 검증 함수 (서버별 규칙 적용)
 * @param host 대상 호스트
 * @param command 실행할 명령어
 * @returns 검증 결과
 */
export function validateCommand(host: string, command: string): ValidationResult {
  const rulesManager = getRulesManager();
  return rulesManager.validateCommand(host, command);
}

/**
 * Express 미들웨어: 명령어 검증 (서버별 규칙 적용)
 */
export function validateCommandMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { command, host } = req.body;

  if (!command) {
    const response: MCPResponse = {
      success: false,
      error: 'Command is required',
      timestamp: new Date().toISOString()
    };
    res.status(400).json(response);
    return;
  }

  if (!host) {
    const response: MCPResponse = {
      success: false,
      error: 'Host is required for command validation',
      timestamp: new Date().toISOString()
    };
    res.status(400).json(response);
    return;
  }

  const validation = validateCommand(host, command);

  if (!validation.valid) {
    const response: MCPResponse = {
      success: false,
      error: `Command validation failed: ${validation.reason}`,
      timestamp: new Date().toISOString()
    };
    logger.error(`Command validation failed for ${host}: ${command} - ${validation.reason}`);
    res.status(403).json(response);
    return;
  }

  logger.info(`Command validated successfully for ${host}: ${command}`);
  next();
}
