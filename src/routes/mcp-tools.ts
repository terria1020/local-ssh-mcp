/**
 * MCP Tools 정의 및 실행
 */

import {
  MCPTool,
  MCPToolCallResult,
  MCPSession,
  SSHExecuteArguments,
} from '../types/mcp';
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
  _credentialId?: string
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
