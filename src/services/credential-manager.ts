/**
 * SSH Credentials Manager
 * 파일 기반 멀티 자격증명 관리 및 핫 리로드
 */

import fs from 'fs';
import path from 'path';
import {
  SSHCredential,
  CredentialsFile,
  SafeCredentialInfo,
  toSafeCredential,
} from '../types/credentials';
import { decodeBase64 } from '../utils/base64';
import logger from '../utils/logger';

// 기본 자격증명 파일 경로
const DEFAULT_CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// 싱글톤 인스턴스
let instance: CredentialManager | null = null;

export class CredentialManager {
  private credentialsPath: string;
  private credentials: Map<string, SSHCredential> = new Map();
  private watcher: fs.FSWatcher | null = null;
  private isReloading: boolean = false;

  constructor(credentialsPath?: string) {
    this.credentialsPath = credentialsPath ||
      process.env.CREDENTIALS_FILE ||
      DEFAULT_CREDENTIALS_PATH;
  }

  /**
   * 초기화: 파일 로드 및 watcher 설정
   */
  async initialize(): Promise<void> {
    await this.loadCredentials();
    this.setupFileWatcher();
  }

  /**
   * 자격증명 파일 로드
   */
  private async loadCredentials(): Promise<void> {
    try {
      if (!fs.existsSync(this.credentialsPath)) {
        logger.warn(`[Credentials] File not found: ${this.credentialsPath}`);
        logger.warn('[Credentials] Using empty credentials. Create credentials.json from credentials.example.json');
        this.credentials.clear();
        return;
      }

      const content = fs.readFileSync(this.credentialsPath, 'utf-8');
      const data: CredentialsFile = JSON.parse(content);

      // 버전 확인
      if (data.version !== '1.0') {
        logger.warn(`[Credentials] Unsupported version: ${data.version}`);
      }

      // 자격증명 로드
      this.credentials.clear();
      for (const cred of data.credentials) {
        this.validateCredential(cred);
        this.credentials.set(cred.id, {
          ...cred,
          port: cred.port || 22,
        });
      }

      logger.info(`[Credentials] Loaded ${this.credentials.size} credentials`);

    } catch (error) {
      logger.error(`[Credentials] Failed to load: ${error}`);
      throw error;
    }
  }

  /**
   * 자격증명 유효성 검사
   */
  private validateCredential(cred: SSHCredential): void {
    if (!cred.id || !/^[a-z0-9-]+$/.test(cred.id)) {
      throw new Error(`Invalid credential id: ${cred.id}. Must be lowercase alphanumeric with hyphens.`);
    }

    if (!cred.host || !cred.username) {
      throw new Error(`Credential ${cred.id}: host and username are required`);
    }

    if (cred.authType === 'key') {
      if (!cred.privateKeyPath) {
        throw new Error(`Credential ${cred.id}: privateKeyPath required for key auth`);
      }
      if (!fs.existsSync(cred.privateKeyPath)) {
        logger.warn(`[Credentials] ${cred.id}: Key file not found: ${cred.privateKeyPath}`);
      }
    } else if (cred.authType === 'password') {
      if (!cred.password) {
        throw new Error(`Credential ${cred.id}: password required for password auth`);
      }
    } else {
      throw new Error(`Credential ${cred.id}: invalid authType: ${cred.authType}`);
    }
  }

  /**
   * 파일 변경 감지 및 자동 리로드
   */
  private setupFileWatcher(): void {
    if (!fs.existsSync(this.credentialsPath)) {
      return;
    }

    try {
      this.watcher = fs.watch(this.credentialsPath, async (eventType) => {
        if (eventType === 'change' && !this.isReloading) {
          this.isReloading = true;

          // debounce: 연속 이벤트 방지
          setTimeout(async () => {
            try {
              logger.info('[Credentials] File changed, reloading...');
              await this.loadCredentials();
            } catch (error) {
              logger.error(`[Credentials] Reload failed: ${error}`);
            } finally {
              this.isReloading = false;
            }
          }, 100);
        }
      });

      logger.info('[Credentials] File watcher active');

    } catch (error) {
      logger.error(`[Credentials] Failed to setup watcher: ${error}`);
    }
  }

  /**
   * ID로 자격증명 조회
   */
  getCredential(id: string): SSHCredential | undefined {
    return this.credentials.get(id);
  }

  /**
   * 디코딩된 비밀번호 반환
   */
  getDecodedPassword(id: string): string | undefined {
    const cred = this.credentials.get(id);
    if (!cred || !cred.password) return undefined;
    return decodeBase64(cred.password);
  }

  /**
   * 디코딩된 패스프레이즈 반환
   */
  getDecodedPassphrase(id: string): string | undefined {
    const cred = this.credentials.get(id);
    if (!cred || !cred.passphrase) return undefined;
    return decodeBase64(cred.passphrase);
  }

  /**
   * 모든 자격증명 목록 (민감 정보 제외)
   */
  listCredentials(): SafeCredentialInfo[] {
    return Array.from(this.credentials.values()).map(toSafeCredential);
  }

  /**
   * 자격증명 존재 여부 확인
   */
  hasCredential(id: string): boolean {
    return this.credentials.has(id);
  }

  /**
   * 자격증명 개수
   */
  get count(): number {
    return this.credentials.size;
  }

  /**
   * 수동 리로드
   */
  async reload(): Promise<void> {
    await this.loadCredentials();
  }

  /**
   * 정리 (watcher 해제)
   */
  dispose(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info('[Credentials] File watcher stopped');
    }
  }
}

// ============================================
// 싱글톤 접근자
// ============================================

export function getCredentialManager(): CredentialManager {
  if (!instance) {
    instance = new CredentialManager();
  }
  return instance;
}

export async function initializeCredentialManager(): Promise<CredentialManager> {
  const manager = getCredentialManager();
  await manager.initialize();
  return manager;
}
