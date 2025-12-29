/**
 * JSON-RPC 2.0 유틸리티
 * MCP 프로토콜 메시지 처리를 위한 헬퍼 함수
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcId,
  JsonRpcNotification,
  JSON_RPC_ERROR_CODES,
  JsonRpcErrorCode,
} from '../types/mcp';

// ============================================
// 요청 파싱 및 검증
// ============================================

/**
 * JSON 문자열을 JSON-RPC 요청으로 파싱
 * @throws Parse error (-32700)
 */
export function parseJsonRpcRequest(json: string): JsonRpcRequest {
  try {
    const parsed = JSON.parse(json);
    return validateJsonRpcRequest(parsed);
  } catch (error) {
    if (error instanceof JsonRpcParseError) {
      throw error;
    }
    throw new JsonRpcParseError('Invalid JSON');
  }
}

/**
 * 객체가 유효한 JSON-RPC 요청인지 검증
 * @throws Invalid Request (-32600)
 */
export function validateJsonRpcRequest(obj: unknown): JsonRpcRequest {
  if (!obj || typeof obj !== 'object') {
    throw new JsonRpcInvalidRequestError('Request must be an object');
  }

  const req = obj as Record<string, unknown>;

  if (req.jsonrpc !== '2.0') {
    throw new JsonRpcInvalidRequestError('jsonrpc must be "2.0"');
  }

  if (typeof req.method !== 'string' || req.method.length === 0) {
    throw new JsonRpcInvalidRequestError('method must be a non-empty string');
  }

  if (req.params !== undefined && typeof req.params !== 'object') {
    throw new JsonRpcInvalidRequestError('params must be an object if present');
  }

  // id는 선택적 (notification이면 없음)
  if (req.id !== undefined) {
    if (typeof req.id !== 'string' && typeof req.id !== 'number' && req.id !== null) {
      throw new JsonRpcInvalidRequestError('id must be string, number, or null');
    }
  }

  return {
    jsonrpc: '2.0',
    method: req.method,
    params: req.params as Record<string, unknown> | undefined,
    id: req.id as JsonRpcId | undefined,
  };
}

/**
 * 요청이 notification인지 확인 (id가 없으면 notification)
 */
export function isNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined;
}

// ============================================
// 응답 생성
// ============================================

/**
 * 성공 응답 생성
 */
export function createSuccessResponse(
  id: JsonRpcId,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    result,
    id,
  };
}

/**
 * 에러 응답 생성
 */
export function createErrorResponse(
  id: JsonRpcId,
  code: JsonRpcErrorCode,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    error: {
      code,
      message,
      data,
    },
    id,
  };
}

/**
 * 표준 에러 응답 생성 헬퍼
 */
export const Errors = {
  parseError(data?: unknown): JsonRpcResponse {
    return createErrorResponse(
      null,
      JSON_RPC_ERROR_CODES.PARSE_ERROR,
      'Parse error',
      data
    );
  },

  invalidRequest(id: JsonRpcId, data?: unknown): JsonRpcResponse {
    return createErrorResponse(
      id,
      JSON_RPC_ERROR_CODES.INVALID_REQUEST,
      'Invalid Request',
      data
    );
  },

  methodNotFound(id: JsonRpcId, method: string): JsonRpcResponse {
    return createErrorResponse(
      id,
      JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
      `Method not found: ${method}`,
      { method }
    );
  },

  invalidParams(id: JsonRpcId, message: string, data?: unknown): JsonRpcResponse {
    return createErrorResponse(
      id,
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      message,
      data
    );
  },

  internalError(id: JsonRpcId, message: string, data?: unknown): JsonRpcResponse {
    return createErrorResponse(
      id,
      JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
      message,
      data
    );
  },

  sshError(id: JsonRpcId, message: string, data?: unknown): JsonRpcResponse {
    return createErrorResponse(
      id,
      JSON_RPC_ERROR_CODES.SSH_ERROR,
      message,
      data
    );
  },

  credentialError(id: JsonRpcId, message: string, data?: unknown): JsonRpcResponse {
    return createErrorResponse(
      id,
      JSON_RPC_ERROR_CODES.CREDENTIAL_ERROR,
      message,
      data
    );
  },

  sessionError(id: JsonRpcId, message: string, data?: unknown): JsonRpcResponse {
    return createErrorResponse(
      id,
      JSON_RPC_ERROR_CODES.SESSION_ERROR,
      message,
      data
    );
  },

  validationError(id: JsonRpcId, message: string, data?: unknown): JsonRpcResponse {
    return createErrorResponse(
      id,
      JSON_RPC_ERROR_CODES.VALIDATION_ERROR,
      message,
      data
    );
  },
};

// ============================================
// Notification 생성
// ============================================

/**
 * Notification 메시지 생성 (서버 → 클라이언트)
 */
export function createNotification(
  method: string,
  params?: Record<string, unknown>
): JsonRpcNotification {
  return {
    jsonrpc: '2.0',
    method,
    params,
  };
}

// ============================================
// 커스텀 에러 클래스
// ============================================

export class JsonRpcParseError extends Error {
  code = JSON_RPC_ERROR_CODES.PARSE_ERROR;

  constructor(message: string) {
    super(message);
    this.name = 'JsonRpcParseError';
  }
}

export class JsonRpcInvalidRequestError extends Error {
  code = JSON_RPC_ERROR_CODES.INVALID_REQUEST;

  constructor(message: string) {
    super(message);
    this.name = 'JsonRpcInvalidRequestError';
  }
}

export class JsonRpcMethodNotFoundError extends Error {
  code = JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND;

  constructor(public method: string) {
    super(`Method not found: ${method}`);
    this.name = 'JsonRpcMethodNotFoundError';
  }
}

export class JsonRpcInvalidParamsError extends Error {
  code = JSON_RPC_ERROR_CODES.INVALID_PARAMS;

  constructor(message: string, public data?: unknown) {
    super(message);
    this.name = 'JsonRpcInvalidParamsError';
  }
}

// ============================================
// 타입 가드
// ============================================

/**
 * 응답이 에러인지 확인
 */
export function isErrorResponse(response: JsonRpcResponse): boolean {
  return response.error !== undefined;
}

/**
 * 응답이 성공인지 확인
 */
export function isSuccessResponse(response: JsonRpcResponse): boolean {
  return response.error === undefined && response.result !== undefined;
}
