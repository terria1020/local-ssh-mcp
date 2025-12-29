# TASK-04-02: 세션 시스템 MCP 통합

**Phase**: 4 (세션 관리)
**의존성**: TASK-04-01
**산출물**: `src/routes/mcp-tools.ts` 완성

## 목표

SessionManager를 MCP tools에 통합하여 `ssh_execute`의 persistent 모드와 `ssh_session_info` tool을 완성합니다.

## 상세 작업

### 2.1 mcp-tools.ts 완전 재작성

```typescript
/**
 * MCP Tools 정의 및 실행
 * SSH 명령 실행, 자격증명 조회, 세션 관리
 */

import {
  MCPTool,
  MCPToolCallResult,
  MCPSession,
  SSHExecuteArguments,
  SSHSessionInfoArguments,
  SSHCredentialInfo,
  SSHSessionInfo,
  SSHSessionMode,
} from '../types/mcp';
import { getCredentialManager } from '../services/credential-manager';
import { getSessionManager } from '../services/session-manager';
import { getSSHManager } from '../services/ssh-manager';
import { validateCommand, ValidationResult } from '../middleware/command-validator';
import logger from '../utils/logger';

// ============================================
// Tool 정의
// ============================================

const SSH_EXECUTE_TOOL: MCPTool = {
  name: 'ssh_execute',
  description: 'Execute SSH command on remote server. Use ephemeral mode for single commands, persistent mode for multiple related commands (maintains working directory).',
  inputSchema: {
    type: 'object',
    properties: {
      credentialId: {
        type: 'string',
        description: 'ID of SSH credential to use (see ssh_list_credentials)',
      },
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      sessionMode: {
        type: 'string',
        enum: ['ephemeral', 'persistent'],
        default: 'ephemeral',
        description: 'ephemeral: single command, new connection each time. persistent: maintains connection and working directory for up to 5 commands.',
      },
    },
    required: ['credentialId', 'command'],
  },
};

const SSH_LIST_CREDENTIALS_TOOL: MCPTool = {
  name: 'ssh_list_credentials',
  description: 'List available SSH credentials configured on the server',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const SSH_SESSION_INFO_TOOL: MCPTool = {
  name: 'ssh_session_info',
  description: 'Get information about active SSH sessions',
  inputSchema: {
    type: 'object',
    properties: {
      credentialId: {
        type: 'string',
        description: 'Optional: filter sessions by credential ID',
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
// Tool 실행 라우터
// ============================================

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  session: MCPSession
): Promise<MCPToolCallResult> {
  logger.info(`[Tool] Executing: ${name}`);

  switch (name) {
    case 'ssh_execute':
      return executeSSHCommand(args as unknown as SSHExecuteArguments, session);

    case 'ssh_list_credentials':
      return listCredentials();

    case 'ssh_session_info':
      return getSessionInfo(args as unknown as SSHSessionInfoArguments);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================
// ssh_execute 구현
// ============================================

async function executeSSHCommand(
  args: SSHExecuteArguments,
  _mcpSession: MCPSession
): Promise<MCPToolCallResult> {
  const {
    credentialId,
    command,
    sessionMode = 'ephemeral',
  } = args;

  // 1. 입력 검증
  if (!credentialId || typeof credentialId !== 'string') {
    return errorResult('credentialId is required');
  }

  if (!command || typeof command !== 'string') {
    return errorResult('command is required');
  }

  // 2. 자격증명 확인
  const credManager = getCredentialManager();
  const credential = credManager.getCredential(credentialId);

  if (!credential) {
    return errorResult(
      `Credential not found: ${credentialId}`,
      { availableCredentials: credManager.listCredentials().map(c => c.id) }
    );
  }

  // 3. 명령어 검증
  const validation: ValidationResult = validateCommand(command);
  if (!validation.valid) {
    return errorResult(
      `Command validation failed: ${validation.reason}`,
      { command }
    );
  }

  // 4. 실행 모드에 따라 처리
  try {
    if (sessionMode === 'persistent') {
      return await executePersistent(credentialId, command, credential.host);
    } else {
      return await executeEphemeral(credentialId, command, credential.host);
    }
  } catch (error) {
    logger.error(`[Tool] SSH execution failed: ${error}`);
    return errorResult(
      'SSH execution failed',
      {
        message: error instanceof Error ? error.message : String(error),
        credential: credentialId,
        host: credential.host,
      }
    );
  }
}

/**
 * Ephemeral 모드: 단일 명령, 새 연결
 */
async function executeEphemeral(
  credentialId: string,
  command: string,
  host: string
): Promise<MCPToolCallResult> {
  const credManager = getCredentialManager();
  const credential = credManager.getCredential(credentialId)!;
  const sshManager = getSSHManager();

  const password = credential.authType === 'password'
    ? credManager.getDecodedPassword(credentialId)
    : undefined;

  const result = await sshManager.runCommand(
    credential.host,
    credential.username,
    command,
    credential.port,
    password
  );

  return successResult({
    mode: 'ephemeral',
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    credential: credentialId,
    host,
  });
}

/**
 * Persistent 모드: 세션 유지, 다중 명령
 */
async function executePersistent(
  credentialId: string,
  command: string,
  host: string
): Promise<MCPToolCallResult> {
  const sessionManager = getSessionManager();

  // 기존 세션 가져오기 또는 새로 생성
  const session = await sessionManager.getOrCreateSession(credentialId);

  // 세션에서 명령 실행
  const result = await sessionManager.executeInSession(session.id, command);

  // 세션 정보 조회
  const sessionInfo = sessionManager.getSessionInfo(session.id);

  return successResult({
    mode: 'persistent',
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    credential: credentialId,
    host,
    session: sessionInfo ? {
      sessionId: sessionInfo.sessionId,
      commandCount: sessionInfo.commandCount,
      maxCommands: sessionInfo.maxCommands,
      cwd: sessionInfo.cwd,
    } : null,
  });
}

// ============================================
// ssh_list_credentials 구현
// ============================================

async function listCredentials(): Promise<MCPToolCallResult> {
  const credManager = getCredentialManager();
  const credentials = credManager.listCredentials();

  const credentialInfos: SSHCredentialInfo[] = credentials.map(c => ({
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    username: c.username,
    authType: c.authType,
  }));

  return successResult({
    count: credentialInfos.length,
    credentials: credentialInfos,
  });
}

// ============================================
// ssh_session_info 구현
// ============================================

async function getSessionInfo(
  args: SSHSessionInfoArguments
): Promise<MCPToolCallResult> {
  const sessionManager = getSessionManager();
  const sessions = sessionManager.getSessionsByCredential(args.credentialId);

  return successResult({
    filter: args.credentialId || 'all',
    count: sessions.length,
    sessions,
  });
}

// ============================================
// 헬퍼 함수
// ============================================

function successResult(data: Record<string, unknown>): MCPToolCallResult {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data, null, 2),
    }],
  };
}

function errorResult(
  message: string,
  data?: Record<string, unknown>
): MCPToolCallResult {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: message,
        ...data,
      }, null, 2),
    }],
    isError: true,
  };
}
```

### 2.2 index.ts 초기화 순서 업데이트

```typescript
import { initializeCredentialManager } from './services/credential-manager';
import { getSessionManager } from './services/session-manager';

async function startServer(): Promise<void> {
  try {
    validateEnvironment();

    // 자격증명 관리자 초기화
    await initializeCredentialManager();

    // 세션 관리자 초기화 (자동으로 싱글톤 생성)
    getSessionManager();

    app.listen(/* ... */);
  } catch (error) {
    // ...
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  getSessionManager().dispose();
  // ...
});
```

### 2.3 E2E 테스트 시나리오

**Ephemeral 모드**:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "ssh_execute",
    "arguments": {
      "credentialId": "my-server",
      "command": "ls -la",
      "sessionMode": "ephemeral"
    }
  },
  "id": 1
}
```

**Persistent 모드 (다중 명령)**:

```json
// 1. cd 명령
{
  "method": "tools/call",
  "params": {
    "name": "ssh_execute",
    "arguments": {
      "credentialId": "my-server",
      "command": "cd /var/log",
      "sessionMode": "persistent"
    }
  }
}

// 2. ls 명령 (같은 세션, cwd 유지)
{
  "method": "tools/call",
  "params": {
    "name": "ssh_execute",
    "arguments": {
      "credentialId": "my-server",
      "command": "ls -la",
      "sessionMode": "persistent"
    }
  }
}
// 결과: /var/log 디렉토리 내용
```

## 입력

- TASK-04-01 SessionManager

## 출력

- `ssh_execute` persistent 모드 동작
- `ssh_session_info` 동작
- 완전한 MCP tools 시스템

## 검증 기준

- [ ] Ephemeral 모드: 단일 명령 후 연결 종료
- [ ] Persistent 모드: 세션 유지, cwd 유지
- [ ] Persistent 모드: 5개 명령 후 세션 자동 종료
- [ ] `ssh_session_info`: 활성 세션 목록 반환
- [ ] `ssh_session_info`: credentialId 필터 동작
- [ ] 에러 시 `isError: true` 반환
- [ ] Graceful shutdown 시 세션 정리
- [ ] `npm run build` 성공

## 참조

- CLARIFY: 섹션 2 (프로토콜 규격)
- 선행 태스크: TASK-04-01
- 후행 태스크: TASK-05-01
