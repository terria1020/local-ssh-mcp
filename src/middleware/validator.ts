import { Request, Response, NextFunction } from 'express';
import { ValidationResult, MCPResponse } from '../types';
import logger from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// 규칙 파일 경로 (프로젝트 최상위)
const RULES_FILE_PATH = path.join(__dirname, '../../rules.json');

// 규칙 인터페이스
interface Rules {
  allowedCommands: string[];
  blockedPatterns: string[];
}

// 현재 로드된 규칙 (메모리 캐시)
let currentRules: Rules = {
  allowedCommands: [],
  blockedPatterns: []
};

/**
 * rules.json 파일에서 규칙 로드
 */
function loadRules(): void {
  try {
    const fileContent = fs.readFileSync(RULES_FILE_PATH, 'utf-8');
    const rules = JSON.parse(fileContent) as Rules;

    // 유효성 검증
    if (!Array.isArray(rules.allowedCommands) || !Array.isArray(rules.blockedPatterns)) {
      throw new Error('Invalid rules format: allowedCommands and blockedPatterns must be arrays');
    }

    currentRules = rules;
    logger.info(`Rules loaded successfully: ${rules.allowedCommands.length} allowed commands, ${rules.blockedPatterns.length} blocked patterns`);
  } catch (error) {
    logger.error(`Failed to load rules from ${RULES_FILE_PATH}: ${error}`);

    // 실패 시 기본 규칙 사용
    currentRules = {
      allowedCommands: ['kubectl', 'docker', 'ls', 'ps', 'top'],
      blockedPatterns: ['rm -rf', 'shutdown', 'reboot']
    };
    logger.warn('Using fallback rules due to load failure');
  }
}

/**
 * 파일 감시 설정 - 규칙 파일 변경 시 자동 리로드
 */
function watchRulesFile(): void {
  try {
    fs.watch(RULES_FILE_PATH, (eventType) => {
      if (eventType === 'change') {
        logger.info('Rules file changed, reloading...');
        loadRules();
      }
    });
    logger.info(`Watching rules file for changes: ${RULES_FILE_PATH}`);
  } catch (error) {
    logger.error(`Failed to watch rules file: ${error}`);
  }
}

// 초기 로드 및 파일 감시 시작
loadRules();
watchRulesFile();

/**
 * 명령어 검증 함수
 * @param command 실행할 명령어
 * @returns 검증 결과
 */
export function validateCommand(command: string): ValidationResult {
  if (!command || command.trim().length === 0) {
    return {
      valid: false,
      reason: 'Command cannot be empty'
    };
  }

  const trimmedCommand = command.trim().toLowerCase();

  // 블랙리스트 검사 (높은 우선순위)
  for (const pattern of currentRules.blockedPatterns) {
    if (trimmedCommand.includes(pattern.toLowerCase())) {
      logger.warn(`Blocked command attempted: ${command} (matched pattern: ${pattern})`);
      return {
        valid: false,
        reason: `Command contains blocked pattern: ${pattern}`
      };
    }
  }

  // 화이트리스트 검사
  const isAllowed = currentRules.allowedCommands.some(prefix =>
    trimmedCommand.startsWith(prefix.toLowerCase())
  );

  if (!isAllowed) {
    logger.warn(`Unauthorized command attempted: ${command}`);
    return {
      valid: false,
      reason: 'Command does not match any allowed pattern'
    };
  }

  return { valid: true };
}

/**
 * Express 미들웨어: 명령어 검증
 */
export function validateCommandMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { command } = req.body;

  if (!command) {
    const response: MCPResponse = {
      success: false,
      error: 'Command is required',
      timestamp: new Date().toISOString()
    };
    res.status(400).json(response);
    return;
  }

  const validation = validateCommand(command);

  if (!validation.valid) {
    const response: MCPResponse = {
      success: false,
      error: `Command validation failed: ${validation.reason}`,
      timestamp: new Date().toISOString()
    };
    logger.error(`Command validation failed for: ${command} - ${validation.reason}`);
    res.status(403).json(response);
    return;
  }

  logger.info(`Command validated successfully: ${command}`);
  next();
}
