import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import { SSHConfig, SSHCommandResult } from '../types';
import logger from '../utils/logger';

/**
 * SSH 연결 및 명령 실행을 관리하는 클래스
 */
export class SSHManager {
  private ssh: NodeSSH;
  private sshKeyPath?: string;
  private sshPassphrase?: string;

  constructor() {
    this.ssh = new NodeSSH();
    this.sshKeyPath = process.env.SSH_KEY_PATH;
    this.sshPassphrase = process.env.SSH_PASSPHRASE;

    // SSH_KEY_PATH가 설정된 경우에만 키 파일 존재 확인
    if (this.sshKeyPath) {
      if (!fs.existsSync(this.sshKeyPath)) {
        throw new Error(`SSH key file not found at: ${this.sshKeyPath}`);
      }

      if (this.sshPassphrase && this.sshPassphrase.length > 0) {
        logger.info('SSHManager initialized (key-based auth with passphrase)');
      } else {
        logger.info('SSHManager initialized (key-based auth)');
      }
    } else {
      logger.info('SSHManager initialized (password-based auth mode)');
    }
  }

  /**
   * SSH 서버에 연결
   * @param config SSH 연결 설정
   */
  async connect(config: SSHConfig): Promise<void> {
    try {
      logger.info(`Attempting SSH connection to ${config.username}@${config.host}:${config.port}`);

      // SSH 연결 설정 구성
      const sshConfig: any = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000, // 10초 타임아웃
        tryKeyboard: false,
      };

      // 인증 방식 결정: password 우선, 그 다음 key
      if (config.password) {
        // 비밀번호 기반 인증
        sshConfig.password = config.password;
        logger.debug('Using password-based authentication');
      } else if (config.privateKeyPath) {
        // 키 기반 인증
        sshConfig.privateKeyPath = config.privateKeyPath;

        // passphrase가 설정되어 있으면 추가
        if (this.sshPassphrase && this.sshPassphrase.length > 0) {
          sshConfig.passphrase = this.sshPassphrase;
          logger.debug('Using SSH key with passphrase');
        } else {
          logger.debug('Using SSH key without passphrase');
        }
      } else {
        throw new Error('Either password or privateKeyPath must be provided for SSH authentication');
      }

      await this.ssh.connect(sshConfig);

      logger.info(`Successfully connected to ${config.username}@${config.host}`);
    } catch (error) {
      logger.error(`SSH connection failed: ${error}`);
      throw new Error(`SSH connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * SSH 명령 실행
   * @param command 실행할 명령어
   * @returns 실행 결과 (stdout, stderr, exitCode)
   */
  async executeCommand(command: string): Promise<SSHCommandResult> {
    try {
      logger.info(`Executing command: ${command}`);

      const result = await this.ssh.execCommand(command, {
        cwd: '/tmp', // 안전한 기본 작업 디렉토리
        execOptions: {
          pty: false,
          env: {
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8'
          }
        }
      });

      const commandResult: SSHCommandResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code || 0
      };

      if (commandResult.exitCode !== 0) {
        logger.warn(`Command exited with code ${commandResult.exitCode}: ${command}`);
        logger.warn(`stderr: ${commandResult.stderr}`);
      } else {
        logger.info(`Command executed successfully: ${command}`);
      }

      return commandResult;
    } catch (error) {
      logger.error(`Command execution failed: ${error}`);
      throw new Error(`Command execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * SSH 연결 종료
   */
  async disconnect(): Promise<void> {
    try {
      if (this.ssh.isConnected()) {
        this.ssh.dispose();
        logger.info('SSH connection closed');
      }
    } catch (error) {
      logger.error(`Error disconnecting SSH: ${error}`);
      throw error;
    }
  }

  /**
   * SSH 연결 상태 확인
   */
  isConnected(): boolean {
    return this.ssh.isConnected();
  }

  /**
   * 전체 실행 플로우: 연결 -> 명령 실행 -> 종료
   * @param host 대상 호스트
   * @param username SSH 사용자명
   * @param command 실행할 명령어
   * @param port SSH 포트 (기본값: 22)
   * @param password SSH 비밀번호 (선택적)
   */
  async runCommand(
    host: string,
    username: string,
    command: string,
    port: number = 22,
    password?: string
  ): Promise<SSHCommandResult> {
    try {
      const config: SSHConfig = {
        host,
        port,
        username,
        password: password, // 비밀번호가 제공되면 사용
        privateKeyPath: this.sshKeyPath // 비밀번호가 없으면 키 파일 사용
      };

      await this.connect(config);
      const result = await this.executeCommand(command);
      await this.disconnect();

      return result;
    } catch (error) {
      // 에러 발생 시에도 연결 종료 시도
      if (this.isConnected()) {
        await this.disconnect();
      }
      throw error;
    }
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
let sshManagerInstance: SSHManager | null = null;

export function getSSHManager(): SSHManager {
  if (!sshManagerInstance) {
    sshManagerInstance = new SSHManager();
  }
  return sshManagerInstance;
}
