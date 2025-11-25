import { Router, Request, Response } from 'express';
import {
  JSONRPCRequest,
  JSONRPCSuccessResponse,
  JSONRPCErrorResponse,
  MCPToolsListResult,
  MCPToolCallParams,
  MCPToolCallResult,
  MCPTool
} from '../types';
import { validateCommand } from '../middleware/validator';
import { getSSHManager } from '../services/ssh-manager';
import { getCredentialStore } from '../services/credential-store';
import logger from '../utils/logger';

const router = Router();

/**
 * JSON-RPC 에러 코드
 */
const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // 커스텀 에러 코드
  VALIDATION_ERROR: -32001,
  SSH_ERROR: -32002
};

/**
 * JSON-RPC 에러 응답 생성
 */
function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: any
): JSONRPCErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data
    }
  };
}

/**
 * JSON-RPC 성공 응답 생성
 */
function createSuccessResponse(
  id: string | number | null,
  result: any
): JSONRPCSuccessResponse {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * MCP Tool 정의
 */
const SSH_EXEC_TOOL: MCPTool = {
  name: 'ssh_exec',
  description: 'Execute SSH commands on remote servers with cached credentials',
  inputSchema: {
    type: 'object',
    properties: {
      host: {
        type: 'string',
        description: 'Target server hostname or IP address'
      },
      username: {
        type: 'string',
        description: 'SSH username'
      },
      command: {
        type: 'string',
        description: 'Command to execute on the remote server'
      },
      port: {
        type: 'number',
        description: 'SSH port (default: 22)',
        default: 22
      }
    },
    required: ['host', 'username', 'command']
  }
};

/**
 * tools/list 메서드 핸들러
 */
async function handleToolsList(
  id: string | number | null
): Promise<JSONRPCSuccessResponse> {
  const result: MCPToolsListResult = {
    tools: [SSH_EXEC_TOOL]
  };

  logger.info('MCP SSE tools/list request handled');
  return createSuccessResponse(id, result);
}

/**
 * tools/call 메서드 핸들러
 */
async function handleToolsCall(
  id: string | number | null,
  params: MCPToolCallParams
): Promise<JSONRPCSuccessResponse | JSONRPCErrorResponse> {
  try {
    if (!params || !params.name) {
      return createErrorResponse(
        id,
        ERROR_CODES.INVALID_PARAMS,
        'Tool name is required'
      );
    }

    if (params.name !== 'ssh_exec') {
      return createErrorResponse(
        id,
        ERROR_CODES.METHOD_NOT_FOUND,
        `Tool not found: ${params.name}`
      );
    }

    // ssh_exec 도구 실행
    const args = params.arguments || {};
    const { host, username, command, port = 22 } = args;

    // 필수 파라미터 검증
    if (!host || !username || !command) {
      return createErrorResponse(
        id,
        ERROR_CODES.INVALID_PARAMS,
        'Missing required parameters: host, username, and command are required'
      );
    }

    // 명령어 검증 (서버별 규칙 적용)
    const validation = validateCommand(host, command);
    if (!validation.valid) {
      logger.warn(`Command validation failed for ${host}: ${command}`);
      const result: MCPToolCallResult = {
        content: [
          {
            type: 'text',
            text: `Command validation failed: ${validation.reason}`
          }
        ],
        isError: true
      };
      return createSuccessResponse(id, result);
    }

    // 저장된 인증 정보 조회
    const credentialStore = getCredentialStore();
    const credential = credentialStore.getCredential(host, username);

    if (!credential) {
      logger.warn(`No cached credentials for ${username}@${host}`);
      const result: MCPToolCallResult = {
        content: [
          {
            type: 'text',
            text: `No cached credentials found for ${username}@${host}. ` +
                  `Please add credentials first.`
          }
        ],
        isError: true
      };
      return createSuccessResponse(id, result);
    }

    // SSH 명령 실행
    logger.info(`MCP SSE ssh_exec: ${username}@${host}:${port} - ${command}`);
    const sshManager = getSSHManager();
    const sshResult = await sshManager.runCommand(
      host,
      username,
      command,
      credential.port || port,
      credential.password,
      credential.passphrase
    );

    // 결과 포맷팅
    let output = '';
    if (sshResult.stdout) {
      output += sshResult.stdout;
    }
    if (sshResult.stderr) {
      output += `\nSTDERR:\n${sshResult.stderr}`;
    }
    output += `\n\nExit Code: ${sshResult.exitCode}`;

    const result: MCPToolCallResult = {
      content: [
        {
          type: 'text',
          text: output
        }
      ],
      isError: sshResult.exitCode !== 0
    };

    logger.info(`MCP SSE ssh_exec completed: ${username}@${host} (exit code: ${sshResult.exitCode})`);
    return createSuccessResponse(id, result);
  } catch (error) {
    logger.error(`MCP SSE tools/call error: ${error}`);
    return createErrorResponse(
      id,
      ERROR_CODES.SSH_ERROR,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * JSON-RPC 요청 처리
 */
async function handleJSONRPCRequest(
  request: JSONRPCRequest
): Promise<JSONRPCSuccessResponse | JSONRPCErrorResponse> {
  // JSON-RPC 2.0 검증
  if (request.jsonrpc !== '2.0') {
    return createErrorResponse(
      request.id || null,
      ERROR_CODES.INVALID_REQUEST,
      'Invalid JSON-RPC version, must be "2.0"'
    );
  }

  if (!request.method) {
    return createErrorResponse(
      request.id || null,
      ERROR_CODES.INVALID_REQUEST,
      'Method is required'
    );
  }

  logger.info(`MCP SSE request: ${request.method}`);

  // 메서드 라우팅
  switch (request.method) {
    case 'tools/list':
      return await handleToolsList(request.id || null);

    case 'tools/call':
      return await handleToolsCall(
        request.id || null,
        request.params as MCPToolCallParams
      );

    default:
      return createErrorResponse(
        request.id || null,
        ERROR_CODES.METHOD_NOT_FOUND,
        `Method not found: ${request.method}`
      );
  }
}

/**
 * GET /mcp/sse
 * MCP SSE Transport 엔드포인트 (인증 없음 - localhost only)
 */
router.get('/sse', async (req: Request, res: Response): Promise<void> => {
  logger.info(`MCP SSE connection established from ${req.ip}`);

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx buffering 비활성화

  // 초기 연결 확인 메시지
  res.write('event: connected\n');
  res.write('data: {"status": "connected", "protocol": "MCP SSE Transport"}\n\n');

  // 클라이언트 연결 종료 감지
  req.on('close', () => {
    logger.info('MCP SSE connection closed');
    res.end();
  });

  // JSON-RPC 메시지 수신 대기
  // SSE는 단방향이므로, 실제로는 WebSocket이나 별도 POST 엔드포인트 필요
  // 여기서는 간단히 POST로 메시지를 받는 구조로 설계

  // Keep-alive (30초마다)
  const keepAliveInterval = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
  });
});

/**
 * POST /mcp/sse/message
 * SSE를 통한 JSON-RPC 메시지 전송 (인증 없음 - localhost only)
 */
router.post('/sse/message', async (req: Request, res: Response): Promise<void> => {
  try {
    const request = req.body as JSONRPCRequest;
    const response = await handleJSONRPCRequest(request);

    res.status(200).json(response);
  } catch (error) {
    logger.error(`MCP SSE message error: ${error}`);

    const errorResponse = createErrorResponse(
      null,
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : String(error)
    );

    res.status(500).json(errorResponse);
  }
});

export default router;
