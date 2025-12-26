# TASK-03-03: 자격증명 시스템 통합

**Phase**: 3 (멀티 자격증명)
**의존성**: TASK-03-02
**산출물**: `src/routes/mcp-tools.ts` 수정

## 목표

CredentialManager를 MCP tools에 통합하여 `ssh_list_credentials` tool과 `ssh_execute` tool이 자격증명을 사용하도록 합니다.

## 상세 작업

### 3.1 mcp-tools.ts 업데이트: listCredentials

```typescript
import { getCredentialManager } from '../services/credential-manager';
import { SSHCredentialInfo } from '../types/mcp';

async function listCredentials(): Promise<MCPToolCallResult> {
  const manager = getCredentialManager();
  const credentials = manager.listCredentials();

  // SSHCredentialInfo 형식으로 변환
  const credentialInfos: SSHCredentialInfo[] = credentials.map(c => ({
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    username: c.username,
    authType: c.authType,
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        count: credentialInfos.length,
        credentials: credentialInfos,
      }, null, 2),
    }],
  };
}
```

### 3.2 mcp-tools.ts 업데이트: executeSSHCommand

```typescript
import { getCredentialManager } from '../services/credential-manager';
import { getSSHManager } from '../services/ssh-manager';
import { validateCommand } from '../middleware/command-validator';

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
          availableCredentials: credManager.listCredentials().map(c => c.id),
        }),
      }],
      isError: true,
    };
  }

  // 2. 명령어 검증
  const validationResult = validateCommand(command);
  if (!validationResult.valid) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Command validation failed',
          reason: validationResult.reason,
          command,
        }),
      }],
      isError: true,
    };
  }

  // 3. SSH 실행 (Ephemeral 모드)
  // TODO: Phase 4에서 persistent 모드 구현
  if (sessionMode === 'persistent') {
    logger.warn('[SSH] Persistent mode not yet implemented, using ephemeral');
  }

  try {
    const sshManager = getSSHManager();

    // 인증 정보 준비
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

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          credential: credentialId,
          host: credential.host,
        }, null, 2),
      }],
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'SSH execution failed',
          message: error instanceof Error ? error.message : String(error),
          credential: credentialId,
          host: credential.host,
        }),
      }],
      isError: true,
    };
  }
}
```

### 3.3 SSHManager 수정: 키 인증 지원

`src/services/ssh-manager.ts` 수정:

```typescript
import { getCredentialManager } from './credential-manager';

/**
 * 자격증명 기반 SSH 실행
 */
async runCommandWithCredential(
  credentialId: string,
  command: string
): Promise<SSHCommandResult> {
  const credManager = getCredentialManager();
  const credential = credManager.getCredential(credentialId);

  if (!credential) {
    throw new Error(`Credential not found: ${credentialId}`);
  }

  const config: SSHConfig = {
    host: credential.host,
    port: credential.port,
    username: credential.username,
  };

  if (credential.authType === 'password') {
    config.password = credManager.getDecodedPassword(credentialId);
  } else {
    config.privateKeyPath = credential.privateKeyPath;
    // passphrase가 있으면 설정
    const passphrase = credManager.getDecodedPassphrase(credentialId);
    if (passphrase) {
      // SSHManager에서 passphrase 처리 필요
    }
  }

  await this.connect(config);
  const result = await this.executeCommand(command);
  await this.disconnect();

  return result;
}
```

### 3.4 command-validator 수정

`src/middleware/validator.ts`를 `src/middleware/command-validator.ts`로 리네임하고 함수 형태로 export:

```typescript
// 기존 미들웨어 외에 함수 형태 추가
export function validateCommand(command: string): ValidationResult {
  // 기존 검증 로직을 함수로 추출
  const rules = loadRules();

  if (!command || command.trim().length === 0) {
    return { valid: false, reason: 'Empty command' };
  }

  // 블랙리스트 검사
  for (const pattern of rules.blockedPatterns) {
    if (command.toLowerCase().includes(pattern.toLowerCase())) {
      return { valid: false, reason: `Blocked pattern: ${pattern}` };
    }
  }

  // 화이트리스트 검사
  const isAllowed = rules.allowedCommands.some(allowed =>
    command.toLowerCase().startsWith(allowed.toLowerCase())
  );

  if (!isAllowed) {
    return { valid: false, reason: 'Command not in whitelist' };
  }

  return { valid: true };
}
```

## 입력

- TASK-03-02 CredentialManager
- 기존 SSHManager

## 출력

- `ssh_list_credentials` tool 동작
- `ssh_execute` tool이 자격증명 사용
- 명령어 검증 통합

## 검증 기준

- [ ] `ssh_list_credentials` 호출 시 자격증명 목록 반환
- [ ] `ssh_execute` 호출 시 자격증명으로 SSH 연결
- [ ] 존재하지 않는 credentialId 오류 처리
- [ ] 명령어 검증 실패 시 오류 반환
- [ ] 비밀번호 인증 동작
- [ ] 키 인증 동작
- [ ] `npm run build` 성공

## 참조

- CLARIFY: 섹션 5 (코드 규칙)
- 선행 태스크: TASK-03-02
- 후행 태스크: TASK-04-01
