import logger from '../utils/logger';

/**
 * 서버별 인증 정보 인터페이스
 */
export interface ServerCredential {
  host: string;
  username: string;
  port?: number;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  addedAt: Date;
}

/**
 * 멀티 서버 인증 정보를 관리하는 클래스
 * JWT 만료 시간 동안 메모리에 저장되며, 서버 재시작 시 초기화됨
 */
export class CredentialStore {
  private credentials: Map<string, ServerCredential>;

  constructor() {
    this.credentials = new Map();
    logger.info('CredentialStore initialized');
  }

  /**
   * 서버 키 생성 (host@username 형식)
   */
  private getServerKey(host: string, username: string): string {
    return `${host}@${username}`;
  }

  /**
   * 인증 정보 추가 또는 업데이트
   */
  addCredential(credential: Omit<ServerCredential, 'addedAt'>): void {
    const key = this.getServerKey(credential.host, credential.username);

    const fullCredential: ServerCredential = {
      ...credential,
      addedAt: new Date()
    };

    this.credentials.set(key, fullCredential);

    const authMethod = credential.password
      ? 'password'
      : credential.privateKeyPath
        ? (credential.passphrase ? 'key with passphrase' : 'key')
        : 'unknown';

    logger.info(`Credential added/updated for ${key} (auth: ${authMethod})`);
  }

  /**
   * 인증 정보 조회
   */
  getCredential(host: string, username: string): ServerCredential | undefined {
    const key = this.getServerKey(host, username);
    const credential = this.credentials.get(key);

    if (credential) {
      logger.debug(`Credential found for ${key}`);
    } else {
      logger.debug(`No credential found for ${key}`);
    }

    return credential;
  }

  /**
   * 인증 정보 삭제
   */
  removeCredential(host: string, username: string): boolean {
    const key = this.getServerKey(host, username);
    const deleted = this.credentials.delete(key);

    if (deleted) {
      logger.info(`Credential removed for ${key}`);
    } else {
      logger.warn(`Attempted to remove non-existent credential: ${key}`);
    }

    return deleted;
  }

  /**
   * 모든 인증 정보 조회 (비밀번호/passphrase 제외)
   */
  listCredentials(): Array<Omit<ServerCredential, 'password' | 'passphrase'>> {
    const list = Array.from(this.credentials.values()).map(cred => ({
      host: cred.host,
      username: cred.username,
      port: cred.port,
      privateKeyPath: cred.privateKeyPath,
      addedAt: cred.addedAt
    }));

    logger.debug(`Listed ${list.length} credentials`);
    return list;
  }

  /**
   * 모든 인증 정보 삭제
   */
  clearAll(): void {
    const count = this.credentials.size;
    this.credentials.clear();
    logger.info(`Cleared all ${count} credentials`);
  }

  /**
   * 저장된 인증 정보 개수
   */
  size(): number {
    return this.credentials.size;
  }

  /**
   * 특정 서버의 인증 정보 존재 여부
   */
  hasCredential(host: string, username: string): boolean {
    const key = this.getServerKey(host, username);
    return this.credentials.has(key);
  }
}

// 싱글톤 인스턴스
let credentialStoreInstance: CredentialStore | null = null;

export function getCredentialStore(): CredentialStore {
  if (!credentialStoreInstance) {
    credentialStoreInstance = new CredentialStore();
  }
  return credentialStoreInstance;
}
