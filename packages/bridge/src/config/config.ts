import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { Logger } from '../logger';
import type { BridgeConfig } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.feishu-bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');

const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  port: 8989,
  logLevel: 'info',
  notifyOnStartup: true,
  notifyOnConnection: true,
  notifyOnDisconnection: true
};

export class ConfigManager {
  static getConfigDir(): string {
    return CONFIG_DIR;
  }

  static getConfigPath(): string {
    return CONFIG_FILE;
  }

  static ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
  }

  static configExists(): boolean {
    return fs.existsSync(CONFIG_FILE);
  }

  static loadConfig(): BridgeConfig {
    if (!this.configExists()) {
      throw new Error(`Config file not found at ${CONFIG_FILE}. Run 'feishu-bridge config' to create.`);
    }

    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = yaml.load(content) as BridgeConfig;

    return {
      ...DEFAULT_CONFIG,
      ...config
    } as BridgeConfig;
  }

  static saveConfig(config: Partial<BridgeConfig>): void {
    this.ensureConfigDir();

    const fullConfig = {
      ...DEFAULT_CONFIG,
      ...config
    };

    const content = yaml.dump(fullConfig, {
      indent: 2,
      lineWidth: -1
    });

    fs.writeFileSync(CONFIG_FILE, content, { mode: 0o600 });
    console.log(`Config saved to ${CONFIG_FILE}`);
  }

  static createDefaultConfig(): void {
    const defaultConfig: Partial<BridgeConfig> = {
      appId: 'your-app-id',
      appSecret: 'your-app-secret',
      port: 8989,
      logLevel: 'info',
      notifyUserIds: [], // 配置需要接收通知的用户openid，例如: ["ou_xxx123", "ou_xxx456"]
      notifyOnStartup: true, // 服务启动时发送通知
      notifyOnConnection: true, // CLI连接时发送通知
      notifyOnDisconnection: true // CLI断开时发送通知
    };

    if (this.configExists()) {
      console.log(`Config file already exists at ${CONFIG_FILE}`);
      return;
    }

    this.saveConfig(defaultConfig);
    console.log('');
    console.log('Please edit the config file to set your Feishu app credentials:');
    console.log(`  ${CONFIG_FILE}`);
  }

  static validateConfig(config: BridgeConfig): boolean {
    const logger = Logger.getInstance();
    
    if (!config.appId || config.appId === 'your-app-id') {
      logger.error('Invalid appId in config');
      return false;
    }
    if (!config.appSecret || config.appSecret === 'your-app-secret') {
      logger.error('Invalid appSecret in config');
      return false;
    }
    if (!config.port || config.port < 1 || config.port > 65535) {
      logger.error('Invalid port in config');
      return false;
    }
    return true;
  }
}
