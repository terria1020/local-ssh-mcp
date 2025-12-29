/**
 * MCP 메소드 핸들러
 * initialize, tools/list, tools/call 등 MCP 메소드 처리
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  MCPSession,
  MCPInitializeParams,
  MCPInitializeResult,
  MCPToolsListResult,
  MCPToolCallParams,
  MCPToolCallResult,
  MCP_PROTOCOL_VERSION,
} from '../types/mcp';
import {
  createSuccessResponse,
  Errors,
  JsonRpcInvalidParamsError,
} from '../utils/json-rpc';
import logger from '../utils/logger';
import { getMCPTools, executeToolCall } from './mcp-tools';

// ============================================
// 메소드 라우팅
// ============================================

type MethodHandler = (
  params: Record<string, unknown> | undefined,
  session: MCPSession,
  id: number | string | null
) => Promise<JsonRpcResponse>;

const methodHandlers: Record<string, MethodHandler> = {
  'initialize': handleInitialize,
  'initialized': handleInitialized,
  'ping': handlePing,
  'tools/list': handleToolsList,
  'tools/call': handleToolsCall,
};

export async function handleMCPMethod(
  request: JsonRpcRequest,
  session: MCPSession
): Promise<JsonRpcResponse> {
  const { method, params, id } = request;
  const requestId = id ?? null;

  // 핸들러 찾기
  const handler = methodHandlers[method];
  if (!handler) {
    logger.warn(`[MCP] Unknown method: ${method}`);
    return Errors.methodNotFound(requestId, method);
  }

  // 초기화 전에는 initialize와 initialized만 허용
  if (!session.initialized && method !== 'initialize' && method !== 'initialized') {
    return Errors.invalidRequest(requestId, {
      message: 'Session not initialized. Call initialize first.',
    });
  }

  try {
    return await handler(params, session, requestId);
  } catch (error) {
    if (error instanceof JsonRpcInvalidParamsError) {
      return Errors.invalidParams(requestId, error.message, error.data);
    }
    throw error;
  }
}

// ============================================
// initialize 핸들러
// ============================================

async function handleInitialize(
  params: Record<string, unknown> | undefined,
  session: MCPSession,
  id: number | string | null
): Promise<JsonRpcResponse> {
  if (!params) {
    throw new JsonRpcInvalidParamsError('params is required for initialize');
  }

  const initParams = params as unknown as MCPInitializeParams;

  // protocolVersion 검증
  if (!initParams.protocolVersion) {
    throw new JsonRpcInvalidParamsError('protocolVersion is required');
  }

  // 클라이언트 정보 저장
  if (initParams.clientInfo) {
    session.clientInfo = initParams.clientInfo;
  }

  logger.info(`[MCP] Initialize request from ${initParams.clientInfo?.name || 'unknown'}`);

  const result: MCPInitializeResult = {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {},  // tools 지원
    },
    serverInfo: {
      name: 'local-ssh-mcp',
      version: '3.0.0',
    },
  };

  return createSuccessResponse(id, result);
}

// ============================================
// initialized 핸들러 (notification)
// ============================================

async function handleInitialized(
  _params: Record<string, unknown> | undefined,
  session: MCPSession,
  id: number | string | null
): Promise<JsonRpcResponse> {
  session.initialized = true;
  logger.info(`[MCP] Session initialized: ${session.id}`);

  // initialized는 notification이므로 응답 없음
  // 하지만 id가 있으면 응답
  if (id !== null) {
    return createSuccessResponse(id, {});
  }

  return createSuccessResponse(null, {});
}

// ============================================
// ping 핸들러
// ============================================

async function handlePing(
  _params: Record<string, unknown> | undefined,
  _session: MCPSession,
  id: number | string | null
): Promise<JsonRpcResponse> {
  return createSuccessResponse(id, {});
}

// ============================================
// tools/list 핸들러
// ============================================

async function handleToolsList(
  _params: Record<string, unknown> | undefined,
  _session: MCPSession,
  id: number | string | null
): Promise<JsonRpcResponse> {
  const tools = getMCPTools();

  const result: MCPToolsListResult = {
    tools,
  };

  return createSuccessResponse(id, result);
}

// ============================================
// tools/call 핸들러
// ============================================

async function handleToolsCall(
  params: Record<string, unknown> | undefined,
  session: MCPSession,
  id: number | string | null
): Promise<JsonRpcResponse> {
  if (!params) {
    throw new JsonRpcInvalidParamsError('params is required for tools/call');
  }

  const callParams = params as unknown as MCPToolCallParams;

  if (!callParams.name) {
    throw new JsonRpcInvalidParamsError('name is required');
  }

  if (!callParams.arguments) {
    throw new JsonRpcInvalidParamsError('arguments is required');
  }

  logger.info(`[MCP] Tool call: ${callParams.name}`);

  try {
    const result = await executeToolCall(
      callParams.name,
      callParams.arguments,
      session
    );
    return createSuccessResponse(id, result);
  } catch (error) {
    // Tool 실행 에러는 result.isError로 반환
    const errorResult: MCPToolCallResult = {
      content: [{
        type: 'text',
        text: error instanceof Error ? error.message : 'Unknown error',
      }],
      isError: true,
    };
    return createSuccessResponse(id, errorResult);
  }
}
