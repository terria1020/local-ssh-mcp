# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Local SSH MCP Server** - A secure localhost-only MCP (Model Context Protocol) server that enables Claude Code to execute SSH commands on remote servers, keeping SSH credentials local and never exposing them to Claude.

**Version**: 3.0.0 (MCP Protocol with Streamable HTTP/SSE)

**Core Architecture**: Express.js MCP server with JSON-RPC 2.0 transport over HTTP/SSE

**Security Model**:
- Localhost-only binding (127.0.0.1:4000)
- Origin header validation (DNS rebinding protection)
- File-based multi-credential management (`credentials.json`)
- Command whitelist/blacklist filtering (hot-reloadable via `rules.json`)
- Session-based SSH connections (ephemeral or persistent modes)

## Quick Start

### Development Commands

```bash
npm run dev          # Development mode with ts-node
npm run build        # Compile TypeScript to dist/
npm start            # Production mode (runs dist/index.js)
npm run watch        # TypeScript watch mode
npm run clean        # Remove dist/ directory
```

### Testing the Server

```bash
# Health check
curl http://127.0.0.1:4000/mcp/health

# MCP test script (initialize → tools/list → ping)
./scripts/test-mcp.sh

# Manual MCP initialize
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

### Setting Up Credentials

1. Copy example file:
   ```bash
   cp credentials.example.json credentials.json
   ```

2. Edit `credentials.json` with your SSH credentials:
   ```json
   {
     "version": "1.0",
     "credentials": [
       {
         "id": "my-server",
         "name": "My Server",
         "host": "server.example.com",
         "port": 22,
         "username": "admin",
         "authType": "key",
         "privateKeyPath": "/Users/you/.ssh/id_rsa"
       }
     ]
   }
   ```

3. For password auth, base64 encode the password:
   ```bash
   echo -n "your-password" | base64
   ```

## Architecture Deep Dive

### Request Flow (v3.0.0 - MCP Protocol)

```
Claude Code
    ↓
JSON-RPC 2.0 Request
    ↓
Express Global Middleware
    ├─ Helmet (security headers)
    ├─ CORS (localhost only)
    ├─ Body Parser (10kb limit)
    └─ Request Logger
    ↓
POST /mcp
    ↓
Origin Validation (src/middleware/origin-validator.ts)
    ├─ Checks Origin header
    └─ Allows localhost, 127.0.0.1, ::1, or no Origin (CLI)
    ↓
MCP Transport (src/routes/mcp-transport.ts)
    ├─ Session management (Mcp-Session-Id header)
    ├─ JSON-RPC parsing and validation
    └─ Method routing
    ↓
MCP Handlers (src/routes/mcp-handlers.ts)
    ├─ initialize → Session setup
    ├─ tools/list → Return tool definitions
    └─ tools/call → Execute SSH commands
    ↓
Tool Execution (src/routes/mcp-tools.ts)
    ├─ ssh_execute → Run SSH command
    ├─ ssh_list_credentials → List available servers
    └─ ssh_session_info → Get session status
```

### Key Components

| File | Purpose | Key Details |
|------|---------|-------------|
| `src/index.ts` | Express server setup | Binds to 127.0.0.1, initializes CredentialManager, graceful shutdown |
| `src/routes/mcp-transport.ts` | MCP HTTP transport | POST/GET/DELETE /mcp endpoints, session management, JSON-RPC handling |
| `src/routes/mcp-handlers.ts` | MCP method handlers | initialize, initialized, ping, tools/list, tools/call |
| `src/routes/mcp-tools.ts` | Tool implementations | ssh_execute, ssh_list_credentials, ssh_session_info |
| `src/middleware/origin-validator.ts` | DNS rebinding protection | Origin header validation |
| `src/middleware/validator.ts` | Command filtering | Loads `rules.json`, hot-reloadable |
| `src/services/credential-manager.ts` | Credential storage | File-based, hot-reload, base64 password/passphrase |
| `src/services/session-manager.ts` | SSH session pooling | Persistent connections, cwd tracking, 5-min timeout |
| `src/services/ssh-manager.ts` | SSH execution | Ephemeral connections, dual auth support |
| `src/types/mcp.ts` | MCP type definitions | JSON-RPC, MCP protocol, SSH types |
| `src/types/credentials.ts` | Credential types | SSHCredential, SafeCredentialInfo |
| `src/utils/json-rpc.ts` | JSON-RPC utilities | Parsing, validation, response builders |
| `src/utils/base64.ts` | Encoding utilities | Base64 encode/decode |
| `rules.json` | Security rules | Whitelist/blacklist, hot-reloadable |
| `credentials.json` | SSH credentials | Multi-credential storage (gitignored) |

### SSH Connection Modes

**Ephemeral Mode** (default):
- Each command creates a fresh SSH connection
- Connection lifecycle: connect → execute → disconnect
- No state persists between commands
- Best for: one-off commands, different servers

**Persistent Mode**:
- SSH connection maintained across commands
- Current working directory (cwd) tracked
- 5-minute timeout, max 5 commands per session
- Best for: cd-based workflows, interactive sessions

### MCP Protocol

**Endpoints**:
| Method | Path | Purpose |
|--------|------|---------|
| POST | /mcp | JSON-RPC requests |
| GET | /mcp | SSE stream (notifications) |
| DELETE | /mcp | Close session |

**MCP Methods**:
- `initialize` - Client handshake, returns capabilities
- `initialized` - Client confirms initialization (notification)
- `ping` - Connection check
- `tools/list` - Get available tools
- `tools/call` - Execute a tool

**Available Tools**:
1. `ssh_execute` - Execute SSH command
   - `credentialId` (required): ID from credentials.json
   - `command` (required): Command to run
   - `sessionMode` (optional): "ephemeral" or "persistent"

2. `ssh_list_credentials` - List available credentials
   - Returns safe info (no passwords/keys)

3. `ssh_session_info` - Get SSH session status
   - `credentialId` (optional): Filter by credential

### Security Validation

**Four Layers of Security (v3.0.0)**:

1. **Network Isolation**
   - Server binds to `127.0.0.1:4000` only
   - CORS restricted to localhost origins

2. **Origin Validation** (src/middleware/origin-validator.ts)
   - DNS rebinding attack protection
   - Allowed: `http://localhost`, `http://127.0.0.1`, `::1`, no Origin

3. **Command Validation** (src/middleware/validator.ts)
   ```typescript
   // Validation order:
   1. Empty command → REJECT
   2. Match blockedPatterns (substring, case-insensitive) → REJECT
   3. Match allowedCommands prefix → ACCEPT
   4. No whitelist match → REJECT
   ```

4. **Credential Protection**
   - Credentials stored locally in `credentials.json`
   - Passwords/passphrases base64 encoded
   - Never transmitted to Claude
   - `credentials.json` in `.gitignore`

## Configuration

### Credentials File

**File**: `credentials.json` (project root, gitignored)

**Schema**: `credentials.schema.json`

**Example**:
```json
{
  "version": "1.0",
  "credentials": [
    {
      "id": "prod-server",
      "name": "Production Server",
      "host": "prod.example.com",
      "port": 22,
      "username": "admin",
      "authType": "key",
      "privateKeyPath": "/Users/you/.ssh/id_rsa",
      "passphrase": "base64-encoded-passphrase"
    },
    {
      "id": "dev-server",
      "name": "Dev Server",
      "host": "dev.example.com",
      "port": 22,
      "username": "developer",
      "authType": "password",
      "password": "base64-encoded-password"
    }
  ]
}
```

**Hot-Reload**: Credentials file is watched for changes and auto-reloaded.

### Rules Configuration

**File**: `rules.json` (project root)

**Structure**:
```json
{
  "allowedCommands": ["kubectl", "docker", "ls", "ps", ...],
  "blockedPatterns": ["rm -rf", "shutdown", "reboot", ...]
}
```

**Hot-Reload**: Edit and save → auto-reloaded without restart.

### Environment Variables

- `PORT`: Server port (default: 4000)
- `LOG_LEVEL`: Logging level (default: info)
- `SSH_KEY_PATH`: Legacy - use credentials.json instead
- `SSH_PASSPHRASE`: Legacy - use credentials.json instead
- `SESSION_TIMEOUT`: MCP session timeout in ms (default: 300000)

## Claude Code Integration

### Method 1: Direct HTTP Requests

Claude Code can call the MCP server directly:

```bash
# Initialize session
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}'

# List credentials
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ssh_list_credentials","arguments":{}}}'

# Execute SSH command
curl -X POST http://127.0.0.1:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ssh_execute","arguments":{"credentialId":"my-server","command":"ls -la"}}}'
```

### Method 2: MCP Client Configuration

Add to `.mcp.json`:
```json
{
  "mcpServers": {
    "local-ssh": {
      "command": "node",
      "args": ["/path/to/local-ssh-mcp/dist/index.js"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Important Constraints

### 1. TypeScript Compilation Required
- Source: `src/` directory
- Compiled: `dist/` directory
- `npm start` runs `dist/index.js`
- Use `npm run dev` for development

### 2. Credential ID Format
- Must be lowercase alphanumeric with hyphens
- Pattern: `^[a-z0-9-]+$`
- Examples: `my-server`, `prod-k8s`, `dev-1`

### 3. Base64 Encoding for Secrets
- Passwords and passphrases must be base64 encoded
- Encode: `echo -n "secret" | base64`
- Decode: `echo "c2VjcmV0" | base64 -d`

### 4. Session State
- Ephemeral mode: No state persists
- Persistent mode: cwd tracked, 5-min timeout
- Session ends after 5 commands in persistent mode

### 5. Working Directory
- Default: `/tmp` for all commands
- Use `cd /path && command` for other directories
- Persistent mode tracks cwd across commands

## File Structure (v3.0.0)

```
src/
├── index.ts                    # Server entry point
├── routes/
│   ├── mcp-transport.ts        # MCP HTTP transport
│   ├── mcp-handlers.ts         # MCP method handlers
│   ├── mcp-tools.ts            # Tool implementations
│   └── mcp.ts                  # Legacy health/status endpoints
├── middleware/
│   ├── origin-validator.ts     # DNS rebinding protection
│   └── validator.ts            # Command validation
├── services/
│   ├── ssh-manager.ts          # SSH execution
│   ├── session-manager.ts      # Session pooling
│   └── credential-manager.ts   # Credential storage
├── utils/
│   ├── logger.ts               # Winston logging
│   ├── json-rpc.ts             # JSON-RPC utilities
│   └── base64.ts               # Encoding utilities
└── types/
    ├── index.ts                # Legacy types
    ├── mcp.ts                  # MCP protocol types
    └── credentials.ts          # Credential types

credentials.json                # SSH credentials (gitignored)
credentials.example.json        # Example credentials
credentials.schema.json         # JSON Schema
rules.json                      # Command validation rules
```

## Debugging

### Enable Debug Logging
```bash
LOG_LEVEL=debug npm run dev
```

### Check Server Health
```bash
curl http://127.0.0.1:4000/mcp/health
```

### Test MCP Flow
```bash
./scripts/test-mcp.sh
```

### Common Issues

1. **"Credential not found"**: Check credential ID in credentials.json
2. **"Session not initialized"**: Send initialize request first
3. **"Command validation failed"**: Command not in allowedCommands or matches blockedPatterns
4. **"Origin not allowed"**: Request must come from localhost

## TypeScript Types Reference

```typescript
// MCP Session
interface MCPSession {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  initialized: boolean;
  clientInfo?: { name: string; version: string };
}

// SSH Credential
interface SSHCredential {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'key' | 'password';
  privateKeyPath?: string;
  passphrase?: string;  // base64
  password?: string;    // base64
}

// Tool Arguments
interface SSHExecuteArguments {
  credentialId: string;
  command: string;
  sessionMode?: 'ephemeral' | 'persistent';
}

// SSH Result
interface SSHCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```
