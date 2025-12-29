import { Request } from 'express';

// MCP API 요청 인터페이스
export interface MCPRunRequest {
  host: string;
  username: string;
  command: string;
  port?: number;
  password?: string; // SSH 비밀번호 (선택적, 키 파일 대신 사용)
}

// SSH 실행 결과 인터페이스
export interface SSHCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// MCP API 응답 인터페이스
export interface MCPResponse<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  timestamp?: string;
}

// 인증된 요청 타입
export interface AuthenticatedRequest extends Request {
  body: MCPRunRequest;
}

// SSH 연결 설정 인터페이스
export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string; // 키 기반 인증 시 사용
  password?: string; // 비밀번호 기반 인증 시 사용
}

// 명령 검증 결과
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// v3.0.0: JWT 관련 타입 제거됨
// JWTPayload, AuthRequest, AuthResponse는 더 이상 사용하지 않음

// MCP 프로토콜 타입 re-export
export * from './mcp';
