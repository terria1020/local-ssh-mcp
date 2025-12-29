/**
 * MCP Tools 정의 및 실행
 */

import fs from 'fs';
import {
  MCPTool,
  MCPToolCallResult,
  MCPSession,
  SSHExecuteArguments,
  JSON_RPC_ERROR_CODES,
} from '../types/mcp';
import { SSHConfig } from '../types';
import { getCredentialManager } from '../services/credential-manager';
import { getSSHManager } from '../services/ssh-manager';
import { getSessionManager } from '../services/session-manager';
import { validateCommand } from '../middleware/validator';
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
// Tool 구현
// ============================================

/**
 * SSH 명령 실행
 */
async function executeSSHCommand(
  args: SSHExecuteArguments,
  _session: MCPSession
): Promise<MCPToolCallResult> {
  const { credentialId, command, sessionMode = 'ephemeral' } = args;

  // 1. 자격증명 조회
  const credManager = getCredentialManager();
  const credential = credManager.getCredential(credentialId);

  if (!credential) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `Credential not found: ${credentialId}`,
          code: JSON_RPC_ERROR_CODES.CREDENTIAL_ERROR,
        }),
      }],
      isError: true,
    };
  }

  // 2. 명령어 검증
  const validation = validateCommand(command);
  if (!validation.valid) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `Command validation failed: ${validation.reason}`,
          code: JSON_RPC_ERROR_CODES.VALIDATION_ERROR,
        }),
      }],
      isError: true,
    };
  }

  // 3. 모드에 따라 실행
  logger.info(`[SSH] Execute (${sessionMode}): ${command} on ${credentialId} (${credential.host})`);

  try {
    if (sessionMode === 'persistent') {
      // Persistent 모드: SessionManager 사용
      return await executePersistentCommand(credentialId, command, credential.host);
    } else {
      // Ephemeral 모드: 단일 연결
      return await executeEphemeralCommand(credentialId, command, credential.host, credManager);
    }
  } catch (error) {
    logger.error(`[SSH] Execution failed: ${error}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          code: JSON_RPC_ERROR_CODES.SSH_ERROR,
          credentialId,
          host: credential.host,
        }),
      }],
      isError: true,
    };
  }
}

/**
 * Ephemeral 모드: 단일 연결로 명령 실행 후 종료
 */
async function executeEphemeralCommand(
  credentialId: string,
  command: string,
  host: string,
  credManager: ReturnType<typeof getCredentialManager>
): Promise<MCPToolCallResult> {
  const credential = credManager.getCredential(credentialId)!;

  // SSH 연결 설정 구성
  const sshConfig: SSHConfig = {
    host: credential.host,
    port: credential.port,
    username: credential.username,
  };

  // 인증 방식에 따라 설정
  if (credential.authType === 'password') {
    const password = credManager.getDecodedPassword(credentialId);
    if (!password) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Password not configured for credential',
            code: JSON_RPC_ERROR_CODES.CREDENTIAL_ERROR,
          }),
        }],
        isError: true,
      };
    }
    sshConfig.password = password;
  } else if (credential.authType === 'key') {
    if (!credential.privateKeyPath) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Private key path not configured',
            code: JSON_RPC_ERROR_CODES.CREDENTIAL_ERROR,
          }),
        }],
        isError: true,
      };
    }

    // 키 파일 존재 확인
    if (!fs.existsSync(credential.privateKeyPath)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Private key file not found: ${credential.privateKeyPath}`,
            code: JSON_RPC_ERROR_CODES.CREDENTIAL_ERROR,
          }),
        }],
        isError: true,
      };
    }

    sshConfig.privateKeyPath = credential.privateKeyPath;

    // 패스프레이즈가 있으면 환경변수로 전달
    const passphrase = credManager.getDecodedPassphrase(credentialId);
    if (passphrase) {
      process.env.SSH_PASSPHRASE = passphrase;
    }
  }

  const sshManager = getSSHManager();

  await sshManager.connect(sshConfig);
  const result = await sshManager.executeCommand(command);
  await sshManager.disconnect();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        credentialId,
        host,
        sessionMode: 'ephemeral',
      }),
    }],
  };
}

/**
 * Persistent 모드: 세션 유지하면서 명령 실행
 */
async function executePersistentCommand(
  credentialId: string,
  command: string,
  host: string
): Promise<MCPToolCallResult> {
  const sessionManager = getSessionManager();

  // 기존 세션 찾거나 새로 생성
  const sshSession = await sessionManager.getOrCreateSession(credentialId);

  // 명령 실행
  const result = await sessionManager.executeCommand(sshSession.id, command);

  // 세션 정보 조회
  const sessionInfos = sessionManager.getSessionInfo(credentialId);
  const currentSessionInfo = sessionInfos.find(s => s.sessionId === sshSession.id);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        credentialId,
        host,
        sessionMode: 'persistent',
        sessionInfo: currentSessionInfo || {
          sessionId: sshSession.id,
          commandCount: 1,
          cwd: '/tmp',
        },
      }),
    }],
  };
}

/**
 * 자격증명 목록 조회
 */
async function listCredentials(): Promise<MCPToolCallResult> {
  const credManager = getCredentialManager();
  const credentials = credManager.listCredentials();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        credentials,
        count: credentials.length,
      }),
    }],
  };
}

/**
 * 세션 정보 조회
 */
async function getSessionInfo(
  credentialId?: string
): Promise<MCPToolCallResult> {
  const sessionManager = getSessionManager();
  const sessions = sessionManager.getSessionInfo(credentialId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        sessions,
        count: sessions.length,
        activeCount: sessionManager.activeSessionCount,
      }),
    }],
  };
}
