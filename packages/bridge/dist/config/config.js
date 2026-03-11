"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const logger_1 = require("../logger");
const CONFIG_DIR = path_1.default.join(os_1.default.homedir(), '.feishu-bridge');
const CONFIG_FILE = path_1.default.join(CONFIG_DIR, 'config.yaml');
const DEFAULT_CONFIG = {
    port: 8989,
    logLevel: 'info'
};
class ConfigManager {
    static getConfigDir() {
        return CONFIG_DIR;
    }
    static getConfigPath() {
        return CONFIG_FILE;
    }
    static ensureConfigDir() {
        if (!fs_1.default.existsSync(CONFIG_DIR)) {
            fs_1.default.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
        }
    }
    static configExists() {
        return fs_1.default.existsSync(CONFIG_FILE);
    }
    static loadConfig() {
        if (!this.configExists()) {
            throw new Error(`Config file not found at ${CONFIG_FILE}. Run 'feishu-bridge config' to create.`);
        }
        const content = fs_1.default.readFileSync(CONFIG_FILE, 'utf-8');
        const config = js_yaml_1.default.load(content);
        return {
            ...DEFAULT_CONFIG,
            ...config
        };
    }
    static saveConfig(config) {
        this.ensureConfigDir();
        const fullConfig = {
            ...DEFAULT_CONFIG,
            ...config
        };
        const content = js_yaml_1.default.dump(fullConfig, {
            indent: 2,
            lineWidth: -1
        });
        fs_1.default.writeFileSync(CONFIG_FILE, content, { mode: 0o600 });
        console.log(`Config saved to ${CONFIG_FILE}`);
    }
    static createDefaultConfig() {
        const defaultConfig = {
            appId: 'your-app-id',
            appSecret: 'your-app-secret',
            port: 8989,
            logLevel: 'info'
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
    static validateConfig(config) {
        const logger = logger_1.Logger.getInstance();
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
exports.ConfigManager = ConfigManager;
