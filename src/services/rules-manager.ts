import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { ValidationResult } from '../types';

/**
 * 규칙 인터페이스
 */
export interface Rules {
  allowedCommands: string[];
  blockedPatterns: string[];
}

/**
 * 서버별 규칙을 관리하는 클래스
 * rules/ 디렉토리에서 서버별 규칙 파일을 로드
 * rules/{host}.json 파일이 없으면 rules/default.json 사용
 */
export class RulesManager {
  private rulesDir: string;
  private defaultRulesPath: string;
  private rulesCache: Map<string, Rules>;
  private fileWatchers: Map<string, fs.FSWatcher>;

  constructor() {
    this.rulesDir = path.join(__dirname, '../../rules');
    this.defaultRulesPath = path.join(this.rulesDir, 'default.json');
    this.rulesCache = new Map();
    this.fileWatchers = new Map();

    this.ensureRulesDirectory();
    this.loadDefaultRules();
    logger.info('RulesManager initialized');
  }

  /**
   * rules/ 디렉토리 존재 확인 및 생성
   */
  private ensureRulesDirectory(): void {
    if (!fs.existsSync(this.rulesDir)) {
      fs.mkdirSync(this.rulesDir, { recursive: true });
      logger.info(`Created rules directory: ${this.rulesDir}`);
    }
  }

  /**
   * 기본 규칙 로드
   */
  private loadDefaultRules(): void {
    try {
      if (!fs.existsSync(this.defaultRulesPath)) {
        // default.json이 없으면 fallback 규칙 사용
        const fallbackRules: Rules = {
          allowedCommands: ['kubectl', 'docker', 'ls', 'ps', 'top'],
          blockedPatterns: ['rm -rf', 'shutdown', 'reboot']
        };

        fs.writeFileSync(
          this.defaultRulesPath,
          JSON.stringify(fallbackRules, null, 2),
          'utf-8'
        );

        logger.info('Created default rules file with fallback rules');
      }

      const content = fs.readFileSync(this.defaultRulesPath, 'utf-8');
      const rules = JSON.parse(content) as Rules;

      this.validateRulesFormat(rules);
      this.rulesCache.set('default', rules);

      logger.info(
        `Default rules loaded: ${rules.allowedCommands.length} allowed commands, ` +
        `${rules.blockedPatterns.length} blocked patterns`
      );

      // default.json 파일 감시
      this.watchRulesFile('default', this.defaultRulesPath);
    } catch (error) {
      logger.error(`Failed to load default rules: ${error}`);
      throw new Error(`Failed to load default rules: ${error}`);
    }
  }

  /**
   * 규칙 형식 검증
   */
  private validateRulesFormat(rules: any): void {
    if (!rules || typeof rules !== 'object') {
      throw new Error('Rules must be an object');
    }

    if (!Array.isArray(rules.allowedCommands)) {
      throw new Error('allowedCommands must be an array');
    }

    if (!Array.isArray(rules.blockedPatterns)) {
      throw new Error('blockedPatterns must be an array');
    }
  }

  /**
   * 규칙 파일 감시 설정
   */
  private watchRulesFile(key: string, filePath: string): void {
    try {
      // 기존 watcher가 있으면 정리
      if (this.fileWatchers.has(key)) {
        this.fileWatchers.get(key)?.close();
      }

      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          logger.info(`Rules file changed: ${filePath}, reloading...`);
          this.reloadRulesFile(key, filePath);
        }
      });

      this.fileWatchers.set(key, watcher);
      logger.debug(`Watching rules file: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to watch rules file ${filePath}: ${error}`);
    }
  }

  /**
   * 규칙 파일 재로드
   */
  private reloadRulesFile(key: string, filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const rules = JSON.parse(content) as Rules;

      this.validateRulesFormat(rules);
      this.rulesCache.set(key, rules);

      logger.info(
        `Rules reloaded for ${key}: ${rules.allowedCommands.length} allowed commands, ` +
        `${rules.blockedPatterns.length} blocked patterns`
      );
    } catch (error) {
      logger.error(`Failed to reload rules file ${filePath}: ${error}`);
    }
  }

  /**
   * 서버별 규칙 파일 경로 생성
   */
  private getServerRulesPath(host: string): string {
    // 호스트명에서 파일명으로 사용할 수 없는 문자 제거
    const safeHost = host.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.rulesDir, `${safeHost}.json`);
  }

  /**
   * 특정 서버의 규칙 조회
   * 서버별 규칙이 없으면 default 규칙 반환
   */
  getRules(host: string): Rules {
    // 캐시에서 서버별 규칙 확인
    if (this.rulesCache.has(host)) {
      logger.debug(`Using cached rules for host: ${host}`);
      return this.rulesCache.get(host)!;
    }

    // 서버별 규칙 파일 확인
    const serverRulesPath = this.getServerRulesPath(host);
    if (fs.existsSync(serverRulesPath)) {
      try {
        const content = fs.readFileSync(serverRulesPath, 'utf-8');
        const rules = JSON.parse(content) as Rules;

        this.validateRulesFormat(rules);
        this.rulesCache.set(host, rules);

        logger.info(
          `Loaded rules for host ${host}: ${rules.allowedCommands.length} allowed commands, ` +
          `${rules.blockedPatterns.length} blocked patterns`
        );

        // 파일 감시 시작
        this.watchRulesFile(host, serverRulesPath);

        return rules;
      } catch (error) {
        logger.error(`Failed to load rules for host ${host}: ${error}`);
        logger.warn(`Falling back to default rules for host: ${host}`);
      }
    }

    // 기본 규칙 반환
    logger.debug(`Using default rules for host: ${host}`);
    return this.rulesCache.get('default')!;
  }

  /**
   * 명령어 검증
   */
  validateCommand(host: string, command: string): ValidationResult {
    if (!command || command.trim().length === 0) {
      return {
        valid: false,
        reason: 'Command cannot be empty'
      };
    }

    const rules = this.getRules(host);
    const trimmedCommand = command.trim().toLowerCase();

    // 블랙리스트 검사 (높은 우선순위)
    for (const pattern of rules.blockedPatterns) {
      if (trimmedCommand.includes(pattern.toLowerCase())) {
        logger.warn(
          `Blocked command for ${host}: ${command} (matched pattern: ${pattern})`
        );
        return {
          valid: false,
          reason: `Command contains blocked pattern: ${pattern}`
        };
      }
    }

    // 화이트리스트 검사
    const isAllowed = rules.allowedCommands.some(prefix =>
      trimmedCommand.startsWith(prefix.toLowerCase())
    );

    if (!isAllowed) {
      logger.warn(`Unauthorized command for ${host}: ${command}`);
      return {
        valid: false,
        reason: 'Command does not match any allowed pattern'
      };
    }

    return { valid: true };
  }

  /**
   * 서버별 규칙 설정 (파일 생성)
   */
  setServerRules(host: string, rules: Rules): void {
    try {
      this.validateRulesFormat(rules);

      const serverRulesPath = this.getServerRulesPath(host);
      fs.writeFileSync(
        serverRulesPath,
        JSON.stringify(rules, null, 2),
        'utf-8'
      );

      this.rulesCache.set(host, rules);
      logger.info(`Server rules created for ${host}: ${serverRulesPath}`);

      // 파일 감시 시작
      this.watchRulesFile(host, serverRulesPath);
    } catch (error) {
      logger.error(`Failed to set server rules for ${host}: ${error}`);
      throw error;
    }
  }

  /**
   * 서버별 규칙 삭제
   */
  deleteServerRules(host: string): boolean {
    try {
      const serverRulesPath = this.getServerRulesPath(host);

      if (fs.existsSync(serverRulesPath)) {
        fs.unlinkSync(serverRulesPath);
        this.rulesCache.delete(host);

        // 파일 watcher 정리
        if (this.fileWatchers.has(host)) {
          this.fileWatchers.get(host)?.close();
          this.fileWatchers.delete(host);
        }

        logger.info(`Server rules deleted for ${host}`);
        return true;
      }

      logger.warn(`No server rules file to delete for ${host}`);
      return false;
    } catch (error) {
      logger.error(`Failed to delete server rules for ${host}: ${error}`);
      throw error;
    }
  }

  /**
   * 모든 서버별 규칙 목록 조회
   */
  listServerRules(): string[] {
    try {
      const files = fs.readdirSync(this.rulesDir);
      const servers = files
        .filter(file => file.endsWith('.json') && file !== 'default.json')
        .map(file => file.replace('.json', ''));

      logger.debug(`Listed ${servers.length} server rules`);
      return servers;
    } catch (error) {
      logger.error(`Failed to list server rules: ${error}`);
      return [];
    }
  }

  /**
   * 정리 (watchers 닫기)
   */
  cleanup(): void {
    for (const [key, watcher] of this.fileWatchers.entries()) {
      watcher.close();
      logger.debug(`Closed file watcher for: ${key}`);
    }
    this.fileWatchers.clear();
    logger.info('RulesManager cleaned up');
  }
}

// 싱글톤 인스턴스
let rulesManagerInstance: RulesManager | null = null;

export function getRulesManager(): RulesManager {
  if (!rulesManagerInstance) {
    rulesManagerInstance = new RulesManager();
  }
  return rulesManagerInstance;
}
