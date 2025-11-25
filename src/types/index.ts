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

// JWT 페이로드 인터페이스
export interface JWTPayload {
  issuer: string;
  iat: number;  // issued at
  exp: number;  // expiration
}

// /auth 엔드포인트 요청
export interface AuthRequest {
  token_passphrase: string;
}

// /auth 엔드포인트 응답
export interface AuthResponse {
  jwt: string;
  message: string;
  expiresIn: string;
  expiresAt: string;
}

// ====================================
// MCP JSON-RPC 2.0 타입 정의
// ====================================

/**
 * JSON-RPC 2.0 기본 요청
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

/**
 * JSON-RPC 2.0 성공 응답
 */
export interface JSONRPCSuccessResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result: any;
}

/**
 * JSON-RPC 2.0 에러 응답
 */
export interface JSONRPCErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * JSON-RPC 2.0 응답 (성공 또는 에러)
 */
export type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse;

/**
 * MCP Tool 정의
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP tools/list 응답
 */
export interface MCPToolsListResult {
  tools: MCPTool[];
}

/**
 * MCP tools/call 파라미터
 */
export interface MCPToolCallParams {
  name: string;
  arguments: Record<string, any>;
}

/**
 * MCP tools/call 응답
 */
export interface MCPToolCallResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
