/**
 * SSH Credentials 타입 정의
 */

export type AuthType = 'key' | 'password';

export interface SSHCredential {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  privateKeyPath?: string;  // key auth
  passphrase?: string;      // base64 encoded
  password?: string;        // base64 encoded
}

export interface CredentialsFile {
  version: string;
  description?: string;
  credentials: SSHCredential[];
}

/**
 * 민감 정보 없는 자격증명 정보 (API 응답용)
 */
export interface SafeCredentialInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
}

/**
 * 자격증명을 API 응답용 안전한 형태로 변환
 */
export function toSafeCredential(cred: SSHCredential): SafeCredentialInfo {
  return {
    id: cred.id,
    name: cred.name,
    host: cred.host,
    port: cred.port,
    username: cred.username,
    authType: cred.authType,
  };
}
