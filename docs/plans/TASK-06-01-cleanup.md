# TASK-06-01: 정리 및 버전 릴리스

**Phase**: 6 (정리)
**의존성**: TASK-05-02
**산출물**: 최종 릴리스 v3.0.0

## 목표

불필요한 코드 제거, 문서 업데이트, 버전 태깅을 완료하여 v3.0.0을 릴리스합니다.

## 상세 작업

### 1.1 불필요 파일 삭제

```bash
# 삭제 대상
rm -f src/middleware/auth.ts      # JWT 미들웨어
rm -f src/utils/jwt.ts            # JWT 유틸
rm -f src/routes/auth.ts          # JWT 발급 라우트
rm -f src/routes/mcp.ts           # 기존 REST API (mcp-transport.ts로 대체)
rm -f scripts/ssh-mcp-run.sh      # 기존 헬퍼 스크립트 (또는 업데이트)
```

### 1.2 의존성 정리

```bash
# jsonwebtoken 제거
npm uninstall jsonwebtoken @types/jsonwebtoken

# 의존성 최신화
npm update

# lock 파일 정리
rm -f package-lock.json
npm install
```

### 1.3 환경변수 정리

`.env.example` 최종:

```env
# ============================================
# Local SSH MCP Server v3.0.0
# ============================================

# Server
PORT=4000
NODE_ENV=development
LOG_LEVEL=info

# Credentials File
CREDENTIALS_FILE=./credentials.json

# Session Settings
SESSION_TIMEOUT=300000          # 5 minutes
MAX_COMMANDS_PER_SESSION=5

# Optional: Default SSH Key (fallback if credentials.json not found)
# SSH_KEY_PATH=/path/to/.ssh/id_rsa
# SSH_PASSPHRASE=your-passphrase
```

### 1.4 README.md 업데이트

주요 변경사항 반영:

```markdown
# Local SSH MCP Server v3.0.0

Claude Code용 SSH 명령 실행 MCP 서버

## 주요 기능

- MCP (Model Context Protocol) 완전 지원
- Streamable HTTP + SSE transport
- 멀티 SSH 자격증명 (파일 기반, 핫 리로드)
- Persistent 세션 (다중 명령, 작업 디렉토리 유지)
- 명령어 화이트리스트/블랙리스트

## 빠른 시작

### 1. 설치

\`\`\`bash
npm install
\`\`\`

### 2. 자격증명 설정

\`\`\`bash
cp credentials.example.json credentials.json
# credentials.json 편집
\`\`\`

### 3. 서버 시작

\`\`\`bash
npm run dev
\`\`\`

### 4. Claude Code 연동

\`\`\`bash
claude mcp add --transport http local-ssh http://127.0.0.1:4000/mcp
\`\`\`

## MCP Tools

| Tool | 설명 |
|------|------|
| `ssh_execute` | SSH 명령 실행 |
| `ssh_list_credentials` | 자격증명 목록 조회 |
| `ssh_session_info` | 세션 정보 조회 |

## 버전 히스토리

- v3.0.0: MCP 프로토콜 전환, 멀티 자격증명, 세션 관리
- v2.0.0: JWT 인증 도입
- v1.0.0: 초기 버전
```

### 1.5 CLAUDE.md 업데이트

프로젝트 가이드 업데이트:

```markdown
# CLAUDE.md

## Project Overview

**Local SSH MCP Server** - Claude Code용 MCP 서버

**Version**: 3.0.0
**Protocol**: MCP (Model Context Protocol) 2025-11-25

## Quick Commands

\`\`\`bash
npm run dev      # 개발 모드
npm run build    # 빌드
npm start        # 프로덕션
\`\`\`

## Architecture

- MCP Streamable HTTP + SSE transport
- 멀티 SSH 자격증명 (credentials.json)
- 세션 풀링 (ephemeral/persistent)

## Key Files

| 파일 | 설명 |
|-----|------|
| credentials.json | SSH 자격증명 (gitignore) |
| rules.json | 명령어 화이트리스트/블랙리스트 |
| src/routes/mcp-transport.ts | MCP 엔드포인트 |
| src/services/session-manager.ts | SSH 세션 관리 |
| src/services/credential-manager.ts | 자격증명 관리 |
```

### 1.6 Git 태그 생성

```bash
# 변경사항 커밋
git add .
git commit -m "feat: v3.0.0 - MCP protocol, multi-credentials, session management"

# 태그 생성
git tag -a v3.0.0 -m "Release v3.0.0: MCP Protocol Implementation"

# 푸시
git push origin main
git push origin v3.0.0
```

### 1.7 최종 파일 구조 확인

```
local-ssh-mcp/
├── src/
│   ├── index.ts
│   ├── routes/
│   │   ├── mcp-transport.ts
│   │   ├── mcp-handlers.ts
│   │   └── mcp-tools.ts
│   ├── middleware/
│   │   ├── origin-validator.ts
│   │   └── command-validator.ts
│   ├── services/
│   │   ├── ssh-manager.ts
│   │   ├── session-manager.ts
│   │   └── credential-manager.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── json-rpc.ts
│   │   └── base64.ts
│   └── types/
│       ├── index.ts
│       ├── mcp.ts
│       └── credentials.ts
├── credentials.json          # gitignore
├── credentials.example.json
├── credentials.schema.json
├── rules.json
├── .env                      # gitignore
├── .env.example
├── .gitignore
├── .mcp.json.example
├── package.json
├── tsconfig.json
├── README.md
├── CLAUDE.md
└── docs/
    ├── plans/
    │   ├── 00-CLARIFY-common-rules.md
    │   ├── 20251226-v3-mcp-sse-refactoring-plan.md
    │   └── TASK-*.md
    └── 20251226-implementation-report.md
```

## 입력

- TASK-05-02 테스트 완료

## 출력

- 정리된 코드베이스
- 업데이트된 문서
- v3.0.0 Git 태그

## 검증 기준

- [ ] 불필요 파일 삭제됨
- [ ] jsonwebtoken 의존성 제거됨
- [ ] JWT 관련 환경변수 제거됨
- [ ] README.md 업데이트됨
- [ ] CLAUDE.md 업데이트됨
- [ ] .env.example 업데이트됨
- [ ] `npm run build` 성공
- [ ] `npm run dev` 정상 동작
- [ ] Git 태그 v3.0.0 생성됨

## 참조

- CLARIFY: 모든 섹션
- 선행 태스크: TASK-05-02
- 후행 태스크: 없음 (완료)
