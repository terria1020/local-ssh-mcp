/**
 * MCP Protocol Types (v2025-11-25)
 * JSON-RPC 2.0 기반 Model Context Protocol 타입 정의
 */

// ============================================
// JSON-RPC 2.0 기본 타입
// ============================================

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: JsonRpcId;  // notification이면 없음
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: JsonRpcError;
  id: JsonRpcId;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  // id 없음
}

// ============================================
// JSON-RPC 에러 코드 상수
// ============================================

export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // 커스텀 에러 코드 (서버 에러 범위: -32000 ~ -32099)
  SSH_ERROR: -32000,
  CREDENTIAL_ERROR: -32001,
  SESSION_ERROR: -32002,
  VALIDATION_ERROR: -32003,
} as const;

export type JsonRpcErrorCode = typeof JSON_RPC_ERROR_CODES[keyof typeof JSON_RPC_ERROR_CODES];

// ============================================
// MCP 초기화 타입
// ============================================

export interface MCPClientInfo {
  name: string;
  version: string;
}

export interface MCPServerInfo {
  name: string;
  version: string;
}

export interface MCPCapabilities {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
}

export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  clientInfo: MCPClientInfo;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: MCPServerInfo;
}

// ============================================
// MCP Tool 타입
// ============================================

export interface MCPToolInputSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    default?: unknown;
  }>;
  required?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
}

export interface MCPToolsListResult {
  tools: MCPTool[];
}

export interface MCPToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: MCPToolContent[];
  isError?: boolean;
}

export interface MCPToolContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;       // base64 for image
  mimeType?: string;
  resource?: unknown;
}

// ============================================
// SSH Tool 특화 타입
// ============================================

export type SSHSessionMode = "ephemeral" | "persistent";

export interface SSHExecuteArguments {
  credentialId: string;
  command: string;
  sessionMode?: SSHSessionMode;
}

export interface SSHListCredentialsArguments {
  // 파라미터 없음
}

export interface SSHSessionInfoArguments {
  credentialId?: string;
}

export interface SSHExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  sessionId?: string;  // persistent 모드일 때
  cwd?: string;        // persistent 모드일 때 현재 작업 디렉토리
}

export interface SSHCredentialInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "key" | "password";
  // 민감 정보(password, passphrase)는 포함하지 않음
}

export interface SSHSessionInfo {
  sessionId: string;
  credentialId: string;
  createdAt: string;
  lastUsedAt: string;
  commandCount: number;
  maxCommands: number;
  cwd: string;
  isActive: boolean;
}

// ============================================
// MCP 세션 타입
// ============================================

export interface MCPSession {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  clientInfo?: MCPClientInfo;
  initialized: boolean;
}

// ============================================
// HTTP 헤더 상수
// ============================================

export const MCP_HEADERS = {
  PROTOCOL_VERSION: "MCP-Protocol-Version",
  SESSION_ID: "MCP-Session-Id",
  LAST_EVENT_ID: "Last-Event-ID",
} as const;

export const MCP_PROTOCOL_VERSION = "2025-11-25";

// ============================================
// SSE 이벤트 타입
// ============================================

export interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}
