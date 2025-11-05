# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Local SSH MCP Server** - A secure localhost-only proxy server that enables Claude Code to execute SSH commands on remote servers via JSON API, keeping SSH credentials local and never exposing them to Claude.

**Core Architecture**: Express.js REST API with layered middleware (auth → validation → SSH execution)

**Security Model** (v2.0.0 - JWT-based):
- Localhost-only binding (127.0.0.1)
- JWT authentication with 30-minute expiry
- Token issuance via passphrase
- Issuer verification and signature validation
- Command whitelist/blacklist filtering
- Ephemeral SSH connections (no persistent state)

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
# Health check (no auth required)
curl http://127.0.0.1:4000/mcp/health

# Step 1: Obtain JWT token (required first)
curl -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "your-passphrase-from-env"}'

# Step 2: Export JWT token (valid for 30 minutes)
export MCP_JWT_TOKEN="your-jwt-token-from-step-1"

# Step 3: Execute command with JWT
curl -X POST http://127.0.0.1:4000/mcp/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MCP_JWT_TOKEN" \
  -d '{"host": "server.com", "username": "user", "command": "ls"}'

# Helper script (recommended - uses MCP_JWT_TOKEN from environment)
./scripts/ssh-mcp-run.sh server.com user "kubectl get pods"
```

## Architecture Deep Dive

### Request Flow

**Authentication Flow (v2.0.0 - JWT):**
```
1. Client sends token_passphrase to POST /auth
    ↓
2. Server validates passphrase against TOKEN_PASSPHRASE
    ↓
3. Server generates JWT (30 min expiry, signed with JWT_SECRET_KEY)
    ↓
4. Server returns JWT with usage instructions
    ↓
5. Client stores JWT in environment (MCP_JWT_TOKEN)
```

**API Request Flow:**
```
Client Request
    ↓
Express Global Middleware
    ├─ Helmet (security headers)
    ├─ CORS (localhost only)
    ├─ Body Parser (10kb limit)
    └─ Request Logger
    ↓
Route: POST /mcp/run
    ↓
Route-Specific Middleware Chain
    ├─ authenticateToken (src/middleware/auth.ts)
    │   ├─ Extracts JWT from Authorization header
    │   ├─ Verifies signature with JWT_SECRET_KEY
    │   ├─ Checks issuer matches JWT_ISSUER
    │   ├─ Validates expiration time (30 min)
    │   └─ Returns 401 with specific error if validation fails:
    │       • "JWT token expired" → token expired
    │       • "JWT issuer mismatch" → wrong issuer
    │       • "Invalid JWT token" → signature invalid/tampered
    ├─ validateCommandMiddleware (src/middleware/validator.ts)
    │   ├─ Loads rules from rules.json (hot-reloadable)
    │   ├─ Checks blockedPatterns (substring match)
    │   └─ Checks allowedCommands (prefix match)
    ↓
Route Handler (src/routes/mcp.ts)
    ├─ Extract params: {host, username, command, port, password}
    ├─ Call SSHManager.runCommand()
    │   ├─ Create fresh SSH connection (10s timeout)
    │   ├─ Execute command in /tmp directory
    │   ├─ Capture stdout/stderr/exitCode
    │   └─ Disconnect immediately
    └─ Return MCPResponse JSON
```

### Key Components

| File | Purpose | Key Details |
|------|---------|-------------|
| `src/index.ts` | Express server setup | Binds to 127.0.0.1 only, validates JWT env vars on startup |
| `src/routes/auth.ts` | JWT token issuance | `POST /auth` with token_passphrase, returns 30-min JWT |
| `src/routes/mcp.ts` | API endpoints | `/health`, `/status`, `/run` |
| `src/middleware/auth.ts` | JWT authentication | Verifies JWT signature, issuer, and expiration |
| `src/middleware/validator.ts` | Command filtering | Loads `rules.json`, watches for file changes with `fs.watch()` |
| `src/services/ssh-manager.ts` | SSH execution | Singleton pattern, ephemeral connections, dual auth (key/password) |
| `src/utils/jwt.ts` | JWT utilities | `generateToken()`, `verifyToken()`, `getTokenExpiration()` |
| `src/utils/logger.ts` | Winston logging | Console + file transports, 5MB rotation, 5 files retained |
| `rules.json` | Security rules | Whitelist/blacklist, hot-reloadable without server restart |

### SSH Connection Management

**Design: Ephemeral connections (no pooling)**
- Each API request creates a fresh SSH connection
- Connection lifecycle: connect → execute → disconnect
- No session state persists between requests
- Commands like `cd` don't affect subsequent requests

**Authentication Priority**:
1. Password from request body (if provided)
2. SSH key from `SSH_KEY_PATH` environment variable (fallback)

**Key Authentication** (recommended):
```env
SSH_KEY_PATH=/Users/you/.ssh/id_rsa
SSH_PASSPHRASE=your-passphrase  # optional, for encrypted keys
```

**Password Authentication**:
```json
{
  "host": "server.com",
  "username": "user",
  "password": "plaintext-password",  // only over localhost
  "command": "ls"
}
```

**Command Execution Details**:
- Working directory: `/tmp` (hardcoded for security)
- Environment: `LANG=en_US.UTF-8`, `LC_ALL=en_US.UTF-8`
- PTY: Disabled (`pty: false`) for clean output separation
- Exit codes: Preserved in response (non-zero exits return HTTP 200, not 500)

### Security Validation

**Five Layers of Security (v2.0.0)**:

1. **Network Isolation**
   - Server binds to `127.0.0.1:4000` only
   - CORS restricted to `http://localhost` and `http://127.0.0.1`

2. **Token Issuance Control**
   - JWT tokens issued only after passphrase validation
   - Passphrase stored in `TOKEN_PASSPHRASE` environment variable
   - Never stored in zshrc (only the issued JWT is stored)

3. **JWT Authentication** (src/middleware/auth.ts)
   - JWT signature verification using `JWT_SECRET_KEY`
   - Issuer validation against `JWT_ISSUER`
   - Expiration check (30-minute validity)
   - Returns 401 with specific error messages:
     - Token expired: "JWT token expired. Please obtain a new token..."
     - Issuer mismatch: "JWT issuer mismatch. Token may be from unauthorized source"
     - Invalid signature: "Invalid JWT token" (tampered or malformed)

4. **Command Validation** (src/middleware/validator.ts:75-110)
   ```typescript
   // Validation order:
   1. Empty command → REJECT
   2. Match blockedPatterns (substring, case-insensitive) → REJECT
   3. Match allowedCommands prefix → ACCEPT
   4. No whitelist match → REJECT
   ```

   **Rules are hot-reloadable**: Edit `rules.json` → saved → auto-reloaded (fs.watch)

5. **SSH Credential Protection**
   - SSH keys never transmitted over network
   - Key path stored in `.env` only
   - Passwords only sent over localhost
   - Working directory restricted to `/tmp`

### Rules Configuration

**File**: `rules.json` (project root)

**Structure**:
```json
{
  "allowedCommands": ["kubectl", "docker", "ls", "ps", ...],
  "blockedPatterns": ["rm -rf", "shutdown", "reboot", ...]
}
```

**How Validation Works**:
- `allowedCommands`: Prefix matching (e.g., `"kubectl"` allows `kubectl get pods`)
- `blockedPatterns`: Substring matching (e.g., `"rm -rf"` blocks `rm -rf /`)
- Blacklist takes priority over whitelist

**Hot-Reload**: File watcher (src/middleware/validator.ts:52-64) detects changes and reloads rules automatically. Check logs for confirmation:
```
Rules file changed, reloading...
Rules loaded successfully: 14 allowed commands, 23 blocked patterns
```

**Fallback Rules**: If `rules.json` fails to load, safe defaults are applied (src/middleware/validator.ts:41-45).

## Important Constraints and Gotchas

### 1. TypeScript Compilation Required
- Source: `src/` directory
- Compiled: `dist/` directory
- `npm start` runs `dist/index.js`, NOT `src/index.ts`
- Use `npm run dev` for development (uses ts-node)

### 2. Rules File Path Resolution
- Path: `__dirname + '../../rules.json'`
- `__dirname` in compiled code is `dist/middleware/`, not `src/middleware/`
- Rules file must be at project root, not in `src/` or `dist/`

### 3. No Persistent SSH Sessions
- Each request creates a new SSH connection
- Session-based commands (`cd`, `export`) don't persist
- Use absolute paths or chain commands: `cd /app && ls` (single request)

### 4. Exit Codes vs HTTP Status
- Command failure (exit code != 0) → HTTP 200 with `exitCode` in JSON
- SSH connection failure → HTTP 500
- Auth failure → HTTP 401
- Validation failure → HTTP 403
- Always check `result.exitCode` for command success

### 5. Password Security
- Passwords transmitted as plaintext JSON over localhost
- Not exposed to network but visible in request bodies
- Logs intentionally avoid logging passwords (src/routes/mcp.ts:33)
- Production: Use SSH keys instead

### 6. Environment Variables (v2.0.0 - JWT)
- `.env` file must be at project root
- `dotenv.config()` called at startup (src/index.ts:10)
- **Required**: `TOKEN_PASSPHRASE`, `JWT_SECRET_KEY`, `JWT_ISSUER`
- **Optional**: `SSH_KEY_PATH`, `SSH_PASSPHRASE`, `PORT`, `LOG_LEVEL`
- **Important**: Never store `TOKEN_PASSPHRASE` in zshrc - only store issued JWT tokens

### 7. Logging Behavior
- Console + file transports (both active simultaneously)
- Files: `logs/combined.log`, `logs/error.log`
- Auto log level: `debug` in non-production, `info` in production
- 5MB rotation, 5 files retained

### 8. Command Whitelist is Prefix-Based
- `"kubectl"` in whitelist allows ALL kubectl commands
- To restrict, use more specific prefixes: `["kubectl get", "kubectl describe"]`
- Or rely on blocklist to prevent dangerous operations

### 9. File Watcher Quirks
- `fs.watch()` may fire multiple events for single file edit
- Rules reload is idempotent (safe to reload multiple times)
- Watcher can fail silently (error logged but server continues)
- Always check logs to confirm rules reloaded

### 10. Working Directory Restriction
- All commands execute in `/tmp` (src/services/ssh-manager.ts:91)
- Security choice: prevents accidental operations in sensitive directories
- Use absolute paths for files outside `/tmp`: `cat /var/log/nginx/access.log`

## Common Operations

### Adding an Allowed Command

Edit `rules.json` (no server restart needed):
```json
{
  "allowedCommands": [
    "kubectl",
    "docker",
    "systemctl status"  // Add new command
  ]
}
```

Watch logs for confirmation:
```
Rules file changed, reloading...
Rules loaded successfully: 15 allowed commands, 23 blocked patterns
```

### Blocking a Dangerous Pattern

Edit `rules.json`:
```json
{
  "blockedPatterns": [
    "rm -rf",
    "curl | bash",
    "your-new-pattern"  // Add emergency block
  ]
}
```

Changes apply immediately to new requests.

### Changing Authentication Method

**Switch to password auth**:
1. Remove or comment out `SSH_KEY_PATH` in `.env`
2. Include `password` field in API requests

**Switch to key auth**:
1. Set `SSH_KEY_PATH` in `.env`
2. Optional: Set `SSH_PASSPHRASE` if key is encrypted
3. Omit `password` field from API requests

### Obtaining and Using JWT Tokens (v2.0.0)

**Step 1: Issue JWT token**:
```bash
curl -X POST http://127.0.0.1:4000/auth \
  -H "Content-Type: application/json" \
  -d '{"token_passphrase": "your-passphrase-from-env"}'
```

**Step 2: Store JWT in environment (30-minute validity)**:
```bash
export MCP_JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Step 3: Add to zshrc for convenience** (token expires in 30 min, re-issue as needed):
```bash
echo 'export MCP_JWT_TOKEN="your-jwt-token"' >> ~/.zshrc
source ~/.zshrc
```

**Important**: Only store the JWT token in zshrc, NEVER store `TOKEN_PASSPHRASE` there.

### Debugging Connection Issues

**Check JWT authentication**:
```bash
curl -H "Authorization: Bearer $MCP_JWT_TOKEN" \
     http://127.0.0.1:4000/mcp/status
```

If JWT expired, you'll see: `"JWT token expired. Please obtain a new token..."`

**Check SSH key configuration**:
Look for `sshKeyConfigured: true` in status response.

**Enable debug logging**:
```env
LOG_LEVEL=debug
```

Restart server and check `logs/combined.log` for detailed SSH handshake logs.

**Test SSH connection manually**:
```bash
ssh -i $SSH_KEY_PATH username@host
```

If manual SSH works but MCP server fails, check:
- Key file permissions: `chmod 600 ~/.ssh/id_rsa`
- Passphrase in `.env` matches key
- Host/username spelling in API request

## Architecture Decisions (Why Things Are This Way)

### Why Ephemeral Connections?
- Simplicity: No connection pool management
- Statelessness: No stale connections
- Security: Short-lived credentials exposure
- Trade-off: Higher latency for frequent requests

### Why Hot-Reloadable Rules?
- Zero-downtime security updates
- Add emergency blocks without restart
- Useful for dev/ops workflows
- Trade-off: File watcher complexity

### Why Localhost-Only?
- SSH credentials never leave local machine
- Claude Code sends JSON requests, not SSH commands
- Defense-in-depth (even if firewall fails)

### Why /tmp Working Directory?
- Prevents accidental operations in home/root directories
- Forces explicit absolute paths for sensitive files
- Security over convenience

### Why Dual Auth (Key + Password)?
- Flexibility: Different servers, different auth methods
- Per-request passwords for temporary access
- Global SSH key for standard workflow

### Why 10kb Body Limit?
- Commands are typically < 1kb
- Prevents large payload DoS attacks
- Small enough to be restrictive, large enough to be practical

## Helper Script Usage

**Location**: `scripts/ssh-mcp-run.sh`

**Basic usage**:
```bash
./scripts/ssh-mcp-run.sh HOST USERNAME COMMAND [PORT]
```

**Examples**:
```bash
# Key-based auth (default)
./scripts/ssh-mcp-run.sh k8s.example.com ubuntu "kubectl get pods"

# Password auth
./scripts/ssh-mcp-run.sh -p mypassword server.com admin "docker ps"

# Custom port
./scripts/ssh-mcp-run.sh server.com user "ls" 2222
```

**Features (v2.0.0)**:
- Auto-loads `MCP_JWT_TOKEN` from environment
- Pretty JSON output (if `jq` installed)
- Colored output for readability
- Error handling with exit codes
- Displays helpful JWT issuance instructions if token missing

**When to use**:
- Testing the server during development
- Claude Code can invoke it for SSH operations
- Simpler than raw `curl` commands
- Automatically handles JWT token from environment

## README Highlights

**From README.md**:

- Project purpose: Secure SSH proxy for Claude Code
- Security features: Command filtering, localhost-only, JWT auth (v2.0.0)
- Two authentication modes: SSH key (recommended) vs password
- API endpoints: `/auth`, `/mcp/health`, `/mcp/status`, `/mcp/run`
- Claude Code integration: Use helper script or direct curl
- Log locations: `logs/combined.log`, `logs/error.log`

**Security recommendations (v2.0.0)**:
- SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
- Use passphrase-protected SSH keys in production
- Strong JWT secret: `openssl rand -hex 64`
- Strong token passphrase: `openssl rand -hex 32`
- Production mode: `NODE_ENV=production`, log level `warn` or `error`
- Never store `TOKEN_PASSPHRASE` in zshrc - only store issued JWT tokens
- Re-issue JWT tokens every 30 minutes (or as needed)
