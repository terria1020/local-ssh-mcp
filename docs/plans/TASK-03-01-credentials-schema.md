# TASK-03-01: 자격증명 파일 스키마 및 예시 생성

**Phase**: 3 (멀티 자격증명)
**의존성**: TASK-02-03
**산출물**: `credentials.example.json`, `.gitignore` 수정

## 목표

멀티 SSH 자격증명을 저장할 파일 스키마를 정의하고 예시 파일을 생성합니다.

## 상세 작업

### 1.1 파일 생성: `credentials.example.json`

```json
{
  "$schema": "./credentials.schema.json",
  "version": "1.0",
  "description": "SSH credentials for local-ssh-mcp server",
  "credentials": [
    {
      "id": "example-server-key",
      "name": "Example Server (Key Auth)",
      "host": "example.com",
      "port": 22,
      "username": "ubuntu",
      "authType": "key",
      "privateKeyPath": "/path/to/.ssh/id_rsa",
      "passphrase": "YmFzZTY0X2VuY29kZWRfcGFzc3BocmFzZQ=="
    },
    {
      "id": "example-server-password",
      "name": "Example Server (Password Auth)",
      "host": "example.com",
      "port": 22,
      "username": "admin",
      "authType": "password",
      "password": "YmFzZTY0X2VuY29kZWRfcGFzc3dvcmQ="
    }
  ]
}
```

### 1.2 JSON 스키마 생성: `credentials.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SSH Credentials",
  "description": "SSH credentials configuration for local-ssh-mcp",
  "type": "object",
  "required": ["version", "credentials"],
  "properties": {
    "version": {
      "type": "string",
      "enum": ["1.0"],
      "description": "Schema version"
    },
    "description": {
      "type": "string",
      "description": "Optional description"
    },
    "credentials": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/credential"
      }
    }
  },
  "definitions": {
    "credential": {
      "type": "object",
      "required": ["id", "name", "host", "username", "authType"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z0-9-]+$",
          "description": "Unique identifier (lowercase, numbers, hyphens)"
        },
        "name": {
          "type": "string",
          "description": "Human-readable name"
        },
        "host": {
          "type": "string",
          "description": "SSH host address"
        },
        "port": {
          "type": "integer",
          "minimum": 1,
          "maximum": 65535,
          "default": 22,
          "description": "SSH port"
        },
        "username": {
          "type": "string",
          "description": "SSH username"
        },
        "authType": {
          "type": "string",
          "enum": ["key", "password"],
          "description": "Authentication type"
        },
        "privateKeyPath": {
          "type": "string",
          "description": "Path to private key file (required for key auth)"
        },
        "passphrase": {
          "type": "string",
          "description": "Base64 encoded passphrase for private key"
        },
        "password": {
          "type": "string",
          "description": "Base64 encoded password (required for password auth)"
        }
      },
      "allOf": [
        {
          "if": {
            "properties": { "authType": { "const": "key" } }
          },
          "then": {
            "required": ["privateKeyPath"]
          }
        },
        {
          "if": {
            "properties": { "authType": { "const": "password" } }
          },
          "then": {
            "required": ["password"]
          }
        }
      ]
    }
  }
}
```

### 1.3 TypeScript 타입 추가: `src/types/credentials.ts`

```typescript
/**
 * SSH Credentials 타입 정의
 */

export type AuthType = 'key' | 'password';

export interface SSHCredential {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  privateKeyPath?: string;  // key auth
  passphrase?: string;      // base64 encoded
  password?: string;        // base64 encoded
}

export interface CredentialsFile {
  version: string;
  description?: string;
  credentials: SSHCredential[];
}

/**
 * 민감 정보 없는 자격증명 정보 (API 응답용)
 */
export interface SafeCredentialInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
}

/**
 * 자격증명을 API 응답용 안전한 형태로 변환
 */
export function toSafeCredential(cred: SSHCredential): SafeCredentialInfo {
  return {
    id: cred.id,
    name: cred.name,
    host: cred.host,
    port: cred.port,
    username: cred.username,
    authType: cred.authType,
  };
}
```

### 1.4 .gitignore 수정

```gitignore
# SSH Credentials (sensitive)
credentials.json

# 환경변수
.env
```

### 1.5 base64 유틸리티: `src/utils/base64.ts`

```typescript
/**
 * Base64 인코딩/디코딩 유틸리티
 */

/**
 * 문자열을 Base64로 인코딩
 */
export function encodeBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

/**
 * Base64를 문자열로 디코딩
 */
export function decodeBase64(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

/**
 * Base64 문자열이 유효한지 확인
 */
export function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;

  try {
    return Buffer.from(str, 'base64').toString('base64') === str;
  } catch {
    return false;
  }
}
```

## 입력

- CLARIFY 섹션 4.2 (설정 파일 명명)
- 계획 문서 섹션 3.1 (자격증명 파일 형식)

## 출력

- `credentials.example.json` 예시 파일
- `credentials.schema.json` JSON 스키마
- `src/types/credentials.ts` 타입 정의
- `src/utils/base64.ts` 유틸리티
- `.gitignore` 업데이트

## 검증 기준

- [ ] `credentials.example.json` 파일 생성됨
- [ ] `credentials.schema.json` 파일 생성됨
- [ ] JSON 스키마가 예시 파일 검증 통과
- [ ] `src/types/credentials.ts` 파일 생성됨
- [ ] `src/utils/base64.ts` 파일 생성됨
- [ ] `.gitignore`에 `credentials.json` 추가됨
- [ ] base64 인코딩/디코딩 동작 확인
- [ ] `npm run build` 성공

## 참조

- CLARIFY: 섹션 4.2 (설정 파일)
- 선행 태스크: TASK-02-03
- 후행 태스크: TASK-03-02
