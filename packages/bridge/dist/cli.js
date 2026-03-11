#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const bridge_1 = require("./server/bridge");
const config_1 = require("./config/config");
const processManager_1 = require("./processManager");
const logger_1 = require("./logger");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const pkgPath = path_1.default.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf-8'));
const program = new commander_1.Command();
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
    logger_1.logger.info(`Feishu Bridge v${pkg.version}`);
    if (options.daemon) {
        startDaemon(options);
    }
    else {
        await startForeground(options);
    }
});
async function startForeground(options) {
    try {
        const config = config_1.ConfigManager.loadConfig();
        if (options.port) {
            config.port = parseInt(options.port, 10);
        }
        if (!config_1.ConfigManager.validateConfig(config)) {
            process.exit(1);
        }
        const bridge = new bridge_1.FeishuBridge({ config });
        await bridge.start();
        // 优雅关闭
        process.on('SIGINT', async () => {
            logger_1.logger.info('\nShutting down...');
            await bridge.stop();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            logger_1.logger.info('\nShutting down...');
            await bridge.stop();
            process.exit(0);
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to start bridge service:', error);
        process.exit(1);
    }
}
function startDaemon(options) {
    logger_1.logger.info('Starting Feishu Bridge in daemon mode');
    const logStream = fs_1.default.createWriteStream((0, processManager_1.getLogPath)(), { flags: 'a' });
    const child = (0, child_process_1.spawn)(process.execPath, [
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
        (0, processManager_1.savePid)(child.pid);
        logger_1.logger.info(`Feishu Bridge started as daemon with PID ${child.pid}`);
        logger_1.logger.info(`Logs available at ${(0, processManager_1.getLogPath)()}`);
    }
    else {
        logger_1.logger.error('Failed to start daemon: No PID available');
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
        if (config_1.ConfigManager.configExists()) {
            const config = config_1.ConfigManager.loadConfig();
            logger_1.logger.info('Current configuration:');
            logger_1.logger.info('====================');
            logger_1.logger.info(`App ID: ${config.appId}`);
            logger_1.logger.info(`App Secret: ${config.appSecret ? '***' : 'Not set'}`);
            logger_1.logger.info(`Port: ${config.port || 8989}`);
            logger_1.logger.info(`Log Level: ${config.logLevel || 'info'}`);
        }
        else {
            logger_1.logger.warn('Config file not found');
            logger_1.logger.warn('Run `feishu-bridge config` to create one');
        }
    }
    else if (Object.keys(options).length > 0) {
        const config = {};
        if (options.appId)
            config.appId = options.appId;
        if (options.appSecret)
            config.appSecret = options.appSecret;
        if (options.port)
            config.port = parseInt(options.port, 10);
        if (config_1.ConfigManager.configExists()) {
            const existingConfig = config_1.ConfigManager.loadConfig();
            config_1.ConfigManager.saveConfig({ ...existingConfig, ...config });
        }
        else {
            config_1.ConfigManager.saveConfig(config);
        }
    }
    else {
        config_1.ConfigManager.createDefaultConfig();
    }
});
program
    .command('status')
    .description('Check bridge service status')
    .option('--logs', 'Show last 20 lines of log')
    .action(() => {
    logger_1.logger.info('Checking bridge service status...');
    const configPath = config_1.ConfigManager.getConfigPath();
    const logPath = (0, processManager_1.getLogPath)();
    const pid = (0, processManager_1.getPid)();
    logger_1.logger.info(`Config path: ${configPath}`);
    logger_1.logger.info(`PID path: ${path_1.default.join(os_1.default.homedir(), '.feishu-bridge', 'service.pid')}`);
    logger_1.logger.info(`Log path: ${logPath}`);
    if (pid) {
        logger_1.logger.info(`Service PID: ${pid}`);
    }
    else {
        logger_1.logger.warn('Service is not running');
    }
    if (config_1.ConfigManager.configExists()) {
        try {
            const config = config_1.ConfigManager.loadConfig();
            logger_1.logger.info(`App ID: ${config.appId}`);
            logger_1.logger.info(`Port: ${config.port || 8989}`);
            logger_1.logger.info(`Config valid: ${config_1.ConfigManager.validateConfig(config)}`);
        }
        catch (error) {
            logger_1.logger.error('Failed to load config:', error);
        }
    }
    else {
        logger_1.logger.warn('Config file does not exist');
    }
});
program
    .command('stop')
    .description('Stop the bridge service')
    .action(() => {
    const pid = (0, processManager_1.getPid)();
    if (!pid) {
        logger_1.logger.warn('Service is not running');
        return;
    }
    try {
        process.kill(pid, 'SIGTERM');
        logger_1.logger.info(`Sending SIGTERM to PID ${pid}`);
        let attempts = 0;
        const maxAttempts = 10;
        while (attempts < maxAttempts) {
            try {
                process.kill(pid, 0);
                attempts++;
                if (attempts === maxAttempts) {
                    logger_1.logger.warn('Force killing process');
                    process.kill(pid, 'SIGKILL');
                }
                else {
                    logger_1.logger.debug('Process still alive, waiting...');
                    require('child_process').execSync('sleep 0.1');
                }
            }
            catch (error) {
                if (error.code === 'ESRCH') {
                    logger_1.logger.info('Process terminated');
                    (0, processManager_1.removePid)();
                    break;
                }
            }
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to stop process:', error);
    }
});
program.parse();
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
