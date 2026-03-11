#!/usr/bin/env node

import { Command } from 'commander';
import { FeishuBridge } from './server/bridge';
import { ConfigManager } from './config/config';
import { savePid, getPid, removePid, getLogPath, readLog } from './processManager';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const program = new Command();

program
  .name('feishu-bridge')
  .description('Feishu bridge for Claude CLI')
  .version(pkg.version);

program
  .command('start')
  .description('Start the Feishu bridge service')
  .option('-p, --port <port>', 'Port to listen on')
  .option('-c, --config <path>', 'Config file path')
  .option('-d, --daemon', 'Run in daemon mode')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    logger.info(`Feishu Bridge v${pkg.version}`);

    if (options.daemon) {
      startDaemon(options);
    } else {
      await startForeground(options);
    }
  });

async function startForeground(options: any): Promise<void> {
  try {
    const config = ConfigManager.loadConfig();

    if (options.port) {
      config.port = parseInt(options.port, 10);
    }

    if (!ConfigManager.validateConfig(config)) {
      process.exit(1);
    }

    const bridge = new FeishuBridge({ config });
    await bridge.start();

    // 优雅关闭
    process.on('SIGINT', async () => {
      logger.info('\nShutting down...');
      await bridge.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('\nShutting down...');
      await bridge.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start bridge service:', error);
    process.exit(1);
  }
}

function startDaemon(options: any): void {
  logger.info('Starting Feishu Bridge in daemon mode');

  const logStream = fs.createWriteStream(getLogPath(), { flags: 'a' });

  const child = spawn(process.execPath, [
    __filename,
    'start',
    ...(options.port ? [`--port=${options.port}`] : []),
    ...(options.config ? [`--config=${options.config}`] : [])
  ], {
    detached: true,
    stdio: ['ignore', logStream, logStream]
  });

  child.unref();

  if (child.pid) {
    savePid(child.pid);
    logger.info(`Feishu Bridge started as daemon with PID ${child.pid}`);
    logger.info(`Logs available at ${getLogPath()}`);
  } else {
    logger.error('Failed to start daemon: No PID available');
    process.exit(1);
  }
}

program
  .command('config')
  .description('Generate or edit configuration file')
  .option('--app-id <appId>', 'Feishu app ID')
  .option('--app-secret <appSecret>', 'Feishu app secret')
  .option('--port <port>', 'Port number')
  .option('--view', 'View current configuration')
  .action((options) => {
    if (options.view) {
      if (ConfigManager.configExists()) {
        const config = ConfigManager.loadConfig();
        logger.info('Current configuration:');
        logger.info('====================');
        logger.info(`App ID: ${config.appId}`);
        logger.info(`App Secret: ${config.appSecret ? '***' : 'Not set'}`);
        logger.info(`Port: ${config.port || 8989}`);
        logger.info(`Log Level: ${config.logLevel || 'info'}`);
      } else {
        logger.warn('Config file not found');
        logger.warn('Run `feishu-bridge config` to create one');
      }
    } else if (Object.keys(options).length > 0) {
      const config: any = {};
      if (options.appId) config.appId = options.appId;
      if (options.appSecret) config.appSecret = options.appSecret;
      if (options.port) config.port = parseInt(options.port, 10);

      if (ConfigManager.configExists()) {
        const existingConfig = ConfigManager.loadConfig();
        ConfigManager.saveConfig({ ...existingConfig, ...config });
      } else {
        ConfigManager.saveConfig(config);
      }
    } else {
      ConfigManager.createDefaultConfig();
    }
  });

program
  .command('status')
  .description('Check bridge service status')
  .option('--logs', 'Show last 20 lines of log')
  .action(() => {
    logger.info('Checking bridge service status...');

    const configPath = ConfigManager.getConfigPath();
    const logPath = getLogPath();
    const pid = getPid();

    logger.info(`Config path: ${configPath}`);
    logger.info(`PID path: ${path.join(os.homedir(), '.feishu-bridge', 'service.pid')}`);
    logger.info(`Log path: ${logPath}`);

    if (pid) {
      logger.info(`Service PID: ${pid}`);
    } else {
      logger.warn('Service is not running');
    }

    if (ConfigManager.configExists()) {
      try {
        const config = ConfigManager.loadConfig();
        logger.info(`App ID: ${config.appId}`);
        logger.info(`Port: ${config.port || 8989}`);
        logger.info(`Config valid: ${ConfigManager.validateConfig(config)}`);
      } catch (error) {
        logger.error('Failed to load config:', error);
      }
    } else {
      logger.warn('Config file does not exist');
    }
  });

program
  .command('stop')
  .description('Stop the bridge service')
  .action(() => {
    const pid = getPid();
    if (!pid) {
      logger.warn('Service is not running');
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
      logger.info(`Sending SIGTERM to PID ${pid}`);

      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        try {
          process.kill(pid, 0);
          attempts++;
          if (attempts === maxAttempts) {
            logger.warn('Force killing process');
            process.kill(pid, 'SIGKILL');
          } else {
            logger.debug('Process still alive, waiting...');
            require('child_process').execSync('sleep 0.1');
          }
        } catch (error: any) {
          if (error.code === 'ESRCH') {
            logger.info('Process terminated');
            removePid();
            break;
          }
        }
      }
    } catch (error: any) {
      logger.error('Failed to stop process:', error);
    }
  });

program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
