import { Router, Request, Response } from 'express';
import { MCPRunRequest, MCPResponse, SSHCommandResult } from '../types';
import { validateCommandMiddleware } from '../middleware/validator';
import { getSSHManager } from '../services/ssh-manager';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /mcp/run
 * SSH 명령 실행 엔드포인트
 * v3.0.0: JWT 인증 제거 - MCP 프로토콜 기반으로 전환 예정
 */
router.post('/run',
  validateCommandMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { host, username, command, port = 22, password } = req.body as MCPRunRequest;

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

    try {
      const authMethod = password ? 'password' : 'key';
      logger.info(`MCP run request: ${username}@${host}:${port} - ${command} (auth: ${authMethod})`);

      const sshManager = getSSHManager();
      const result: SSHCommandResult = await sshManager.runCommand(
        host,
        username,
        command,
        port,
        password // 비밀번호 전달 (선택적)
      );

      const response: MCPResponse<SSHCommandResult> = {
        success: true,
        result,
        timestamp: new Date().toISOString()
      };

      logger.info(`MCP run successful: ${username}@${host} - ${command} (exit code: ${result.exitCode})`);
      res.status(200).json(response);
    } catch (error) {
      logger.error(`MCP run failed: ${error}`);

      const response: MCPResponse = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };

      res.status(500).json(response);
    }
  }
);

/**
 * GET /mcp/health
 * 서버 상태 확인 엔드포인트
 */
router.get('/health', (_req: Request, res: Response): void => {
  const sshManager = getSSHManager();
  const sshKeyPath = process.env.SSH_KEY_PATH || 'NOT_SET';

  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sshKeyConfigured: sshKeyPath !== 'NOT_SET',
    sshConnected: sshManager.isConnected(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid
    }
  };

  logger.debug('Health check requested');
  res.status(200).json(healthStatus);
});

/**
 * GET /mcp/status
 * 상세 상태 확인 엔드포인트
 * v3.0.0: JWT 인증 제거
 */
router.get('/status',
  (_req: Request, res: Response): void => {
    const sshManager = getSSHManager();
    const memoryUsage = process.memoryUsage();

    const statusInfo = {
      status: 'operational',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ssh: {
        keyPath: process.env.SSH_KEY_PATH,
        connected: sshManager.isConnected()
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
      }
    };

    logger.debug('Status check requested');
    res.status(200).json(statusInfo);
  }
);

export default router;
