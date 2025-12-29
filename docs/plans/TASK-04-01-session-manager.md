# TASK-04-01: SessionManager 클래스 구현

**Phase**: 4 (세션 관리)
**의존성**: TASK-03-03
**산출물**: `src/services/session-manager.ts` (신규)

## 목표

SSH 연결 풀링과 세션 상태를 관리하는 SessionManager 클래스를 구현합니다. Persistent 모드에서 다중 명령어를 동일 연결로 실행할 수 있습니다.

## 상세 작업

### 1.1 파일 생성: `src/services/session-manager.ts`

```typescript
/**
 * SSH Session Manager
 * SSH 연결 풀링 및 세션 상태 관리
 */

import { NodeSSH, SSHExecCommandResponse } from 'node-ssh';
import { v4 as uuidv4 } from 'uuid';
import { SSHCommandResult } from '../types';
import { SSHSessionInfo } from '../types/mcp';
import { getCredentialManager } from './credential-manager';
import logger from '../utils/logger';

// ============================================
// 상수
// ============================================

const SESSION_TIMEOUT_MS = parseInt(
  process.env.SESSION_TIMEOUT || '300000',
  10
); // 5분

const MAX_COMMANDS_PER_SESSION = parseInt(
  process.env.MAX_COMMANDS_PER_SESSION || '5',
  10
);

const MAX_SESSIONS_PER_CREDENTIAL = 3;
const SSH_CONNECTION_TIMEOUT_MS = 10000; // 10초

// ============================================
// 타입
// ============================================

interface SSHSession {
  id: string;
  credentialId: string;
  connection: NodeSSH;
  createdAt: Date;
  lastUsedAt: Date;
  commandCount: number;
  maxCommands: number;
  cwd: string;
  isActive: boolean;
}

// 싱글톤 인스턴스
let instance: SessionManager | null = null;

// ============================================
// SessionManager 클래스
// ============================================

export class SessionManager {
  private sessions: Map<string, SSHSession> = new Map();
  private credentialSessions: Map<string, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * 주기적 세션 정리 시작
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // 1분마다
  }

  /**
   * 만료된 세션 정리
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      const elapsed = now - session.lastUsedAt.getTime();

      if (elapsed > SESSION_TIMEOUT_MS || !session.isActive) {
        this.closeSession(sessionId);
        logger.info(`[Session] Expired: ${sessionId}`);
      }
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

    // 자격증명당 세션 수 제한 확인
    const existingSessions = this.credentialSessions.get(credentialId);
    if (existingSessions && existingSessions.size >= MAX_SESSIONS_PER_CREDENTIAL) {
      // 가장 오래된 세션 종료
      const oldestSessionId = this.getOldestSession(credentialId);
      if (oldestSessionId) {
        this.closeSession(oldestSessionId);
      }
    }

    // SSH 연결 생성
    const ssh = new NodeSSH();

    const sshConfig: any = {
      host: credential.host,
      port: credential.port,
      username: credential.username,
      readyTimeout: SSH_CONNECTION_TIMEOUT_MS,
      tryKeyboard: false,
    };

    if (credential.authType === 'password') {
      sshConfig.password = credManager.getDecodedPassword(credentialId);
    } else {
      sshConfig.privateKeyPath = credential.privateKeyPath;
      const passphrase = credManager.getDecodedPassphrase(credentialId);
      if (passphrase) {
        sshConfig.passphrase = passphrase;
      }
    }

    logger.info(`[Session] Creating connection to ${credential.host}`);
    await ssh.connect(sshConfig);

    // 세션 생성
    const session: SSHSession = {
      id: uuidv4(),
      credentialId,
      connection: ssh,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      commandCount: 0,
      maxCommands: MAX_COMMANDS_PER_SESSION,
      cwd: '/tmp',
      isActive: true,
    };

    this.sessions.set(session.id, session);

    // 자격증명별 세션 추적
    if (!this.credentialSessions.has(credentialId)) {
      this.credentialSessions.set(credentialId, new Set());
    }
    this.credentialSessions.get(credentialId)!.add(session.id);

    logger.info(`[Session] Created: ${session.id} for ${credentialId}`);

    return session;
  }

  /**
   * 가장 오래된 세션 ID 반환
   */
  private getOldestSession(credentialId: string): string | null {
    const sessionIds = this.credentialSessions.get(credentialId);
    if (!sessionIds || sessionIds.size === 0) return null;

    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const id of sessionIds) {
      const session = this.sessions.get(id);
      if (session && session.lastUsedAt.getTime() < oldestTime) {
        oldestTime = session.lastUsedAt.getTime();
        oldestId = id;
      }
    }

    return oldestId;
  }

  /**
   * 기존 세션 가져오기 또는 새로 생성
   */
  async getOrCreateSession(credentialId: string): Promise<SSHSession> {
    // 사용 가능한 기존 세션 찾기
    const sessionIds = this.credentialSessions.get(credentialId);
    if (sessionIds) {
      for (const id of sessionIds) {
        const session = this.sessions.get(id);
        if (session &&
            session.isActive &&
            session.commandCount < session.maxCommands &&
            session.connection.isConnected()) {
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
  async executeInSession(
    sessionId: string,
    command: string
  ): Promise<SSHCommandResult> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.isActive || !session.connection.isConnected()) {
      throw new Error(`Session is not active: ${sessionId}`);
    }

    if (session.commandCount >= session.maxCommands) {
      throw new Error(`Session command limit reached: ${session.commandCount}/${session.maxCommands}`);
    }

    logger.info(`[Session] Execute in ${sessionId}: ${command}`);

    // 명령 실행
    const result: SSHExecCommandResponse = await session.connection.execCommand(
      command,
      {
        cwd: session.cwd,
        execOptions: {
          pty: false,
          env: {
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8',
          },
        },
      }
    );

    // 세션 상태 업데이트
    session.commandCount++;
    session.lastUsedAt = new Date();

    // cd 명령 감지 및 cwd 업데이트
    this.updateCwdIfNeeded(session, command);

    const commandResult: SSHCommandResult = {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code || 0,
    };

    // 최대 명령 수 도달 시 세션 종료
    if (session.commandCount >= session.maxCommands) {
      logger.info(`[Session] Command limit reached, closing: ${sessionId}`);
      this.closeSession(sessionId);
    }

    return commandResult;
  }

  /**
   * cd 명령에 따라 cwd 업데이트
   */
  private updateCwdIfNeeded(session: SSHSession, command: string): void {
    const trimmed = command.trim();

    // cd 명령 패턴 매칭
    const cdMatch = trimmed.match(/^cd\s+(.+)$/);
    if (!cdMatch) return;

    let newPath = cdMatch[1].trim();

    // 따옴표 제거
    newPath = newPath.replace(/^["']|["']$/g, '');

    // 상대 경로 처리
    if (newPath.startsWith('/')) {
      // 절대 경로
      session.cwd = newPath;
    } else if (newPath === '..') {
      // 상위 디렉토리
      const parts = session.cwd.split('/').filter(Boolean);
      parts.pop();
      session.cwd = '/' + parts.join('/') || '/';
    } else if (newPath === '~' || newPath.startsWith('~/')) {
      // 홈 디렉토리 (서버의 홈, 정확한 경로는 알 수 없음)
      session.cwd = '/home/' + newPath.replace('~', '');
    } else {
      // 상대 경로
      session.cwd = session.cwd.replace(/\/$/, '') + '/' + newPath;
    }

    logger.debug(`[Session] CWD updated: ${session.cwd}`);
  }

  /**
   * 세션 종료
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      if (session.connection.isConnected()) {
        session.connection.dispose();
      }
    } catch (error) {
      logger.warn(`[Session] Error closing connection: ${error}`);
    }

    session.isActive = false;

    // 맵에서 제거
    this.sessions.delete(sessionId);

    // 자격증명별 추적에서 제거
    const credSessions = this.credentialSessions.get(session.credentialId);
    if (credSessions) {
      credSessions.delete(sessionId);
    }

    logger.info(`[Session] Closed: ${sessionId}`);
  }

  /**
   * 세션 정보 조회
   */
  getSessionInfo(sessionId: string): SSHSessionInfo | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId: session.id,
      credentialId: session.credentialId,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      commandCount: session.commandCount,
      maxCommands: session.maxCommands,
      cwd: session.cwd,
      isActive: session.isActive && session.connection.isConnected(),
    };
  }

  /**
   * 특정 자격증명의 모든 세션 정보
   */
  getSessionsByCredential(credentialId?: string): SSHSessionInfo[] {
    const result: SSHSessionInfo[] = [];

    for (const session of this.sessions.values()) {
      if (!credentialId || session.credentialId === credentialId) {
        const info = this.getSessionInfo(session.id);
        if (info) {
          result.push(info);
        }
      }
    }

    return result;
  }

  /**
   * 정리 (모든 세션 종료)
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }

    logger.info('[Session] Manager disposed');
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
```

## 입력

- TASK-03-03 자격증명 통합
- CLARIFY 섹션 10.4 (설정값)

## 출력

- `src/services/session-manager.ts` 파일
- SSH 연결 풀링 및 세션 관리

## 검증 기준

- [ ] `src/services/session-manager.ts` 파일 생성됨
- [ ] 세션 생성 동작
- [ ] 세션에서 명령 실행 동작
- [ ] cd 명령 시 cwd 업데이트
- [ ] 최대 명령 수(5개) 도달 시 세션 자동 종료
- [ ] 세션 타임아웃(5분) 동작
- [ ] 자격증명당 최대 세션 수(3개) 제한
- [ ] 세션 정보 조회 동작
- [ ] `npm run build` 성공

## 참조

- CLARIFY: 섹션 10.4 (설정값 일관성)
- 선행 태스크: TASK-03-03
- 후행 태스크: TASK-04-02
