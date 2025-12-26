# TASK-02-02: MCP 메소드 핸들러 구현

**Phase**: 2 (MCP Transport 구현)
**의존성**: TASK-02-01
**산출물**: `src/routes/mcp-handlers.ts` (완성)

## 목표

MCP 프로토콜의 핵심 메소드(initialize, initialized, tools/list, tools/call, ping)를 처리하는 핸들러를 구현합니다.

## 상세 작업

### 2.1 핸들러 구현: `src/routes/mcp-handlers.ts`

```typescript
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

  const initParams = params as MCPInitializeParams;

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

  const callParams = params as MCPToolCallParams;

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
```

### 2.2 Tool 정의 스텁: `src/routes/mcp-tools.ts`

```typescript
/**
 * MCP Tools 정의 및 실행
 */

import {
  MCPTool,
  MCPToolCallResult,
  MCPSession,
  SSHExecuteArguments,
} from '../types/mcp';
import { Errors } from '../utils/json-rpc';
import logger from '../utils/logger';

// ============================================
// Tool 정의
// ============================================

const SSH_EXECUTE_TOOL: MCPTool = {
  name: 'ssh_execute',
  description: 'Execute SSH command on remote server',
  inputSchema: {
    type: 'object',
    properties: {
      credentialId: {
        type: 'string',
        description: 'ID of SSH credential to use',
      },
      command: {
        type: 'string',
        description: 'Command to execute',
      },
      sessionMode: {
        type: 'string',
        enum: ['ephemeral', 'persistent'],
        default: 'ephemeral',
        description: 'Connection mode: ephemeral (single command) or persistent (maintain session)',
      },
    },
    required: ['credentialId', 'command'],
  },
};

const SSH_LIST_CREDENTIALS_TOOL: MCPTool = {
  name: 'ssh_list_credentials',
  description: 'List available SSH credentials',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const SSH_SESSION_INFO_TOOL: MCPTool = {
  name: 'ssh_session_info',
  description: 'Get current SSH session information',
  inputSchema: {
    type: 'object',
    properties: {
      credentialId: {
        type: 'string',
        description: 'Optional: filter by credential ID',
      },
    },
  },
};

const TOOLS: MCPTool[] = [
  SSH_EXECUTE_TOOL,
  SSH_LIST_CREDENTIALS_TOOL,
  SSH_SESSION_INFO_TOOL,
];

export function getMCPTools(): MCPTool[] {
  return TOOLS;
}

// ============================================
// Tool 실행
// ============================================

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  session: MCPSession
): Promise<MCPToolCallResult> {
  switch (name) {
    case 'ssh_execute':
      return executeSSHCommand(args as unknown as SSHExecuteArguments, session);

    case 'ssh_list_credentials':
      return listCredentials();

    case 'ssh_session_info':
      return getSessionInfo(args.credentialId as string | undefined);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================
// Tool 구현 (스텁 - Phase 3, 4에서 완성)
// ============================================

async function executeSSHCommand(
  args: SSHExecuteArguments,
  _session: MCPSession
): Promise<MCPToolCallResult> {
  // TODO: Phase 3, 4에서 구현
  logger.info(`[SSH] Execute: ${args.command} on ${args.credentialId}`);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        stdout: 'Not implemented yet',
        stderr: '',
        exitCode: 0,
      }),
    }],
  };
}

async function listCredentials(): Promise<MCPToolCallResult> {
  // TODO: Phase 3에서 구현
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        credentials: [],
      }),
    }],
  };
}

async function getSessionInfo(
  credentialId?: string
): Promise<MCPToolCallResult> {
  // TODO: Phase 4에서 구현
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        sessions: [],
      }),
    }],
  };
}
```

## 입력

- TASK-02-01 라우터
- CLARIFY 섹션 2 (프로토콜 규격)

## 출력

- `src/routes/mcp-handlers.ts` 완성
- `src/routes/mcp-tools.ts` 스텁 생성
- 모든 MCP 메소드 핸들러 동작

## 검증 기준

- [ ] `initialize` 메소드 동작
- [ ] `initialized` notification 처리
- [ ] `tools/list` 메소드 동작 (3개 tool 반환)
- [ ] `tools/call` 메소드 동작 (스텁)
- [ ] `ping` 메소드 동작
- [ ] 초기화 전 다른 메소드 호출 시 에러 반환
- [ ] 알 수 없는 메소드 호출 시 -32601 에러
- [ ] `npm run build` 성공

## 참조

- CLARIFY: 섹션 2 (프로토콜 규격)
- 선행 태스크: TASK-02-01
- 후행 태스크: TASK-02-03
