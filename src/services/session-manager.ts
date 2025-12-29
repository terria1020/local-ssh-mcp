/**
 * SSH Session Manager
 * SSH 연결 풀링 및 세션 관리
 */

import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import { SSHCommandResult } from '../types';
import { SSHSessionInfo } from '../types/mcp';
import { SSHCredential } from '../types/credentials';
import { getCredentialManager } from './credential-manager';
import logger from '../utils/logger';

// 세션 설정
const SESSION_CONFIG = {
  TIMEOUT_MS: 5 * 60 * 1000, // 5분
  MAX_COMMANDS_PER_SESSION: 5,
  CLEANUP_INTERVAL_MS: 60 * 1000, // 1분
};

// 세션 상태
interface SSHSession {
  id: string;
  credentialId: string;
  ssh: NodeSSH;
  cwd: string;
  commandCount: number;
  createdAt: Date;
  lastUsedAt: Date;
  isConnected: boolean;
}

// 싱글톤 인스턴스
let instance: SessionManager | null = null;

export class SessionManager {
  private sessions: Map<string, SSHSession> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * 정리 타이머 시작
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, SESSION_CONFIG.CLEANUP_INTERVAL_MS);

    logger.info('[SessionManager] Cleanup timer started');
  }

  /**
   * 만료된 세션 정리
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [id, session] of this.sessions) {
      const elapsed = now - session.lastUsedAt.getTime();

      if (elapsed > SESSION_CONFIG.TIMEOUT_MS) {
        expiredSessions.push(id);
      }
    }

    for (const id of expiredSessions) {
      this.closeSession(id).catch((error) => {
        logger.error(`[SessionManager] Failed to close expired session ${id}: ${error}`);
      });
    }

    if (expiredSessions.length > 0) {
      logger.info(`[SessionManager] Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * 새 세션 생성
   */
  async createSession(credentialId: string): Promise<SSHSession> {
    const credManager = getCredentialManager();
    const credential = credManager.getCredential(credentialId);

    if (!credential) {
      throw new Error(`Credential not found: ${credentialId}`);
    }

    const sessionId = `${credentialId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ssh = new NodeSSH();

    // SSH 연결 설정 구성
    const sshConfig = await this.buildSSHConfig(credential, credManager);

    try {
      await ssh.connect(sshConfig);

      const session: SSHSession = {
        id: sessionId,
        credentialId,
        ssh,
        cwd: '/tmp', // 기본 작업 디렉토리
        commandCount: 0,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isConnected: true,
      };

      this.sessions.set(sessionId, session);
      logger.info(`[SessionManager] Session created: ${sessionId} -> ${credential.host}`);

      return session;
    } catch (error) {
      logger.error(`[SessionManager] Failed to create session: ${error}`);
      throw error;
    }
  }

  /**
   * SSH 연결 설정 빌드
   */
  private async buildSSHConfig(
    credential: SSHCredential,
    credManager: ReturnType<typeof getCredentialManager>
  ): Promise<any> {
    const config: any = {
      host: credential.host,
      port: credential.port,
      username: credential.username,
      readyTimeout: 10000,
      tryKeyboard: false,
    };

    if (credential.authType === 'password') {
      const password = credManager.getDecodedPassword(credential.id);
      if (!password) {
        throw new Error('Password not configured for credential');
      }
      config.password = password;
    } else if (credential.authType === 'key') {
      if (!credential.privateKeyPath) {
        throw new Error('Private key path not configured');
      }
      if (!fs.existsSync(credential.privateKeyPath)) {
        throw new Error(`Private key file not found: ${credential.privateKeyPath}`);
      }

      config.privateKeyPath = credential.privateKeyPath;

      const passphrase = credManager.getDecodedPassphrase(credential.id);
      if (passphrase) {
        config.passphrase = passphrase;
      }
    }

    return config;
  }

  /**
   * 기존 세션 또는 새 세션 가져오기
   */
  async getOrCreateSession(credentialId: string): Promise<SSHSession> {
    // 동일 credentialId의 활성 세션 검색
    for (const session of this.sessions.values()) {
      if (
        session.credentialId === credentialId &&
        session.isConnected &&
        session.commandCount < SESSION_CONFIG.MAX_COMMANDS_PER_SESSION
      ) {
        // 타임아웃 체크
        const elapsed = Date.now() - session.lastUsedAt.getTime();
        if (elapsed < SESSION_CONFIG.TIMEOUT_MS) {
          logger.debug(`[SessionManager] Reusing existing session: ${session.id}`);
          return session;
        }
      }
    }

    // 새 세션 생성
    return this.createSession(credentialId);
  }

  /**
   * 세션에서 명령 실행
   */
  async executeCommand(sessionId: string, command: string): Promise<SSHCommandResult> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.isConnected) {
      throw new Error(`Session not connected: ${sessionId}`);
    }

    try {
      logger.info(`[SessionManager] Executing command in session ${sessionId}: ${command}`);

      // cwd를 유지하면서 명령 실행 (쉘 이스케이프로 명령 주입 방지)
      const escapedCwd = session.cwd.replace(/'/g, "'\\''");
      const fullCommand = `cd '${escapedCwd}' && ${command}`;

      const result = await session.ssh.execCommand(fullCommand, {
        execOptions: {
          pty: false,
          env: {
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8',
          },
        },
      });

      // cd 명령인 경우 cwd 업데이트
      if (command.startsWith('cd ')) {
        const newDir = command.substring(3).trim();
        if (result.code === 0) {
          // 절대 경로인 경우
          if (newDir.startsWith('/')) {
            session.cwd = newDir;
          } else {
            // 상대 경로인 경우 pwd로 확인
            const pwdResult = await session.ssh.execCommand(`cd ${session.cwd} && cd ${newDir} && pwd`);
            if (pwdResult.code === 0) {
              session.cwd = pwdResult.stdout.trim();
            }
          }
          logger.debug(`[SessionManager] Session ${sessionId} cwd updated to: ${session.cwd}`);
        }
      }

      // 세션 상태 업데이트
      session.commandCount++;
      session.lastUsedAt = new Date();

      const commandResult: SSHCommandResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code || 0,
      };

      // 최대 명령어 수 도달 시 세션 종료
      if (session.commandCount >= SESSION_CONFIG.MAX_COMMANDS_PER_SESSION) {
        logger.info(`[SessionManager] Session ${sessionId} reached max commands, closing`);
        await this.closeSession(sessionId);
      }

      return commandResult;
    } catch (error) {
      logger.error(`[SessionManager] Command execution failed: ${error}`);
      session.isConnected = false;
      throw error;
    }
  }

  /**
   * 세션 종료
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    try {
      if (session.ssh.isConnected()) {
        session.ssh.dispose();
      }
    } catch (error) {
      logger.error(`[SessionManager] Error disposing SSH connection: ${error}`);
    }

    this.sessions.delete(sessionId);
    logger.info(`[SessionManager] Session closed: ${sessionId}`);
  }

  /**
   * 세션 정보 조회
   */
  getSessionInfo(credentialId?: string): SSHSessionInfo[] {
    const infos: SSHSessionInfo[] = [];

    for (const session of this.sessions.values()) {
      if (credentialId && session.credentialId !== credentialId) {
        continue;
      }

      infos.push({
        sessionId: session.id,
        credentialId: session.credentialId,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        commandCount: session.commandCount,
        maxCommands: SESSION_CONFIG.MAX_COMMANDS_PER_SESSION,
        cwd: session.cwd,
        isActive: session.isConnected,
      });
    }

    return infos;
  }

  /**
   * 세션 존재 여부 확인
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * 활성 세션 수
   */
  get activeSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 정리
   */
  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 모든 세션 종료
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }

    logger.info('[SessionManager] Disposed');
  }
}

// ============================================
// 싱글톤 접근자
// ============================================

export function getSessionManager(): SessionManager {
  if (!instance) {
    instance = new SessionManager();
  }
  return instance;
}

export function disposeSessionManager(): Promise<void> {
  if (instance) {
    const manager = instance;
    instance = null;
    return manager.dispose();
  }
  return Promise.resolve();
}
