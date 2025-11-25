import { Router, Request, Response } from 'express';
import { AuthRequest, AuthResponse, MCPResponse } from '../types';
import { generateToken, getTokenExpiration } from '../utils/jwt';
import { authenticateToken } from '../middleware/auth';
import { getCredentialStore } from '../services/credential-store';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /auth
 * 토큰 패스프레이즈를 검증하고 JWT 토큰 발급
 */
router.post('/', (req: Request, res: Response) => {
  const { token_passphrase } = req.body as AuthRequest;

  // 요청 검증
  if (!token_passphrase) {
    const response: MCPResponse = {
      success: false,
      error: 'token_passphrase is required',
      timestamp: new Date().toISOString()
    };
    logger.warn(`Auth attempt failed: missing token_passphrase from ${req.ip}`);
    res.status(400).json(response);
    return;
  }

  // 환경변수 검증
  const expectedPassphrase = process.env.TOKEN_PASSPHRASE;
  const jwtIssuer = process.env.JWT_ISSUER;

  if (!expectedPassphrase || !jwtIssuer) {
    const response: MCPResponse = {
      success: false,
      error: 'Server configuration error: TOKEN_PASSPHRASE or JWT_ISSUER not set',
      timestamp: new Date().toISOString()
    };
    logger.error('TOKEN_PASSPHRASE or JWT_ISSUER not configured');
    res.status(500).json(response);
    return;
  }

  // 패스프레이즈 검증
  if (token_passphrase !== expectedPassphrase) {
    const response: MCPResponse = {
      success: false,
      error: 'Invalid token_passphrase',
      timestamp: new Date().toISOString()
    };
    logger.warn(`Auth attempt failed: invalid passphrase from ${req.ip}`);
    res.status(401).json(response);
    return;
  }

  // JWT 토큰 생성
  try {
    const jwt = generateToken(jwtIssuer);
    const expiresAt = getTokenExpiration(jwt);

    const response: AuthResponse = {
      jwt,
      message: [
        '✓ JWT 토큰이 성공적으로 발급되었습니다.',
        '',
        '이 토큰은 30분간 유효하며, 모든 API 요청 시 Authorization 헤더에 포함해야 합니다.',
        '',
        '사용법:',
        '  curl -H "Authorization: Bearer <jwt>" http://127.0.0.1:4000/mcp/run ...',
        '',
        '환경변수로 저장하여 사용하는 것을 권장합니다:',
        '  export MCP_JWT_TOKEN="<jwt>"',
        '',
        '또는 ~/.zshrc 또는 ~/.bashrc에 추가:',
        '  echo \'export MCP_JWT_TOKEN="<jwt>"\' >> ~/.zshrc',
        '  source ~/.zshrc',
        '',
        '헬퍼 스크립트 사용 시:',
        '  ./scripts/ssh-mcp-run.sh server.com user "command"',
        '',
        '토큰 만료 시 이 엔드포인트로 다시 요청하여 새 토큰을 발급받으세요.'
      ].join('\n'),
      expiresIn: '30 minutes',
      expiresAt: expiresAt || 'unknown'
    };

    logger.info(`JWT token issued successfully for ${req.ip}`);
    res.status(200).json(response);

  } catch (error) {
    const response: MCPResponse = {
      success: false,
      error: `Failed to generate JWT token: ${error}`,
      timestamp: new Date().toISOString()
    };
    logger.error(`JWT generation failed: ${error}`);
    res.status(500).json(response);
  }
});

/**
 * POST /auth/add-server
 * 서버 인증 정보 추가 (JWT 인증 필요)
 */
router.post('/add-server',
  authenticateToken,
  (req: Request, res: Response) => {
    const { host, username, port, password, privateKeyPath, passphrase } = req.body;

    // 필수 파라미터 검증
    if (!host || !username) {
      const response: MCPResponse = {
        success: false,
        error: 'Missing required parameters: host and username are required',
        timestamp: new Date().toISOString()
      };
      res.status(400).json(response);
      return;
    }

    // 인증 방법 검증 (password 또는 privateKeyPath 중 하나는 필수)
    if (!password && !privateKeyPath) {
      const response: MCPResponse = {
        success: false,
        error: 'Either password or privateKeyPath must be provided',
        timestamp: new Date().toISOString()
      };
      res.status(400).json(response);
      return;
    }

    try {
      const credentialStore = getCredentialStore();

      // 인증 정보 추가
      credentialStore.addCredential({
        host,
        username,
        port: port || 22,
        password,
        privateKeyPath,
        passphrase
      });

      const authMethod = password
        ? 'password'
        : (passphrase ? 'SSH key with passphrase' : 'SSH key');

      const response: MCPResponse = {
        success: true,
        result: {
          message: `Credentials added successfully for ${username}@${host}`,
          host,
          username,
          port: port || 22,
          authMethod,
          cachedUntil: 'Server restart or JWT expiration'
        },
        timestamp: new Date().toISOString()
      };

      logger.info(`Credentials added for ${username}@${host} (auth: ${authMethod})`);
      res.status(200).json(response);
    } catch (error) {
      const response: MCPResponse = {
        success: false,
        error: `Failed to add credentials: ${error}`,
        timestamp: new Date().toISOString()
      };
      logger.error(`Failed to add credentials: ${error}`);
      res.status(500).json(response);
    }
  }
);

/**
 * GET /auth/list-servers
 * 저장된 서버 인증 정보 목록 조회 (JWT 인증 필요)
 */
router.get('/list-servers',
  authenticateToken,
  (_req: Request, res: Response) => {
    try {
      const credentialStore = getCredentialStore();
      const credentials = credentialStore.listCredentials();

      const response: MCPResponse = {
        success: true,
        result: {
          count: credentials.length,
          servers: credentials
        },
        timestamp: new Date().toISOString()
      };

      logger.info(`Listed ${credentials.length} cached credentials`);
      res.status(200).json(response);
    } catch (error) {
      const response: MCPResponse = {
        success: false,
        error: `Failed to list credentials: ${error}`,
        timestamp: new Date().toISOString()
      };
      logger.error(`Failed to list credentials: ${error}`);
      res.status(500).json(response);
    }
  }
);

/**
 * DELETE /auth/remove-server
 * 서버 인증 정보 삭제 (JWT 인증 필요)
 */
router.delete('/remove-server',
  authenticateToken,
  (req: Request, res: Response) => {
    const { host, username } = req.body;

    if (!host || !username) {
      const response: MCPResponse = {
        success: false,
        error: 'Missing required parameters: host and username are required',
        timestamp: new Date().toISOString()
      };
      res.status(400).json(response);
      return;
    }

    try {
      const credentialStore = getCredentialStore();
      const removed = credentialStore.removeCredential(host, username);

      if (removed) {
        const response: MCPResponse = {
          success: true,
          result: {
            message: `Credentials removed for ${username}@${host}`
          },
          timestamp: new Date().toISOString()
        };
        res.status(200).json(response);
      } else {
        const response: MCPResponse = {
          success: false,
          error: `No credentials found for ${username}@${host}`,
          timestamp: new Date().toISOString()
        };
        res.status(404).json(response);
      }
    } catch (error) {
      const response: MCPResponse = {
        success: false,
        error: `Failed to remove credentials: ${error}`,
        timestamp: new Date().toISOString()
      };
      logger.error(`Failed to remove credentials: ${error}`);
      res.status(500).json(response);
    }
  }
);

export default router;
