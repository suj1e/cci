"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePid = savePid;
exports.getPid = getPid;
exports.removePid = removePid;
exports.isRunning = isRunning;
exports.readLog = readLog;
exports.getLogPath = getLogPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const logger_1 = require("./logger");
const PID_DIR = path_1.default.join(os_1.default.homedir(), '.feishu-bridge');
const PID_PATH = path_1.default.join(PID_DIR, 'service.pid');
const LOG_PATH = path_1.default.join(PID_DIR, 'service.log');
function ensurePidDir() {
    if (!fs_1.default.existsSync(PID_DIR)) {
        fs_1.default.mkdirSync(PID_DIR, { recursive: true, mode: 0o700 });
    }
}
function savePid(pid) {
    ensurePidDir();
    fs_1.default.writeFileSync(PID_PATH, pid.toString(), { mode: 0o600 });
}
function getPid() {
    try {
        if (fs_1.default.existsSync(PID_PATH)) {
            const pidStr = fs_1.default.readFileSync(PID_PATH, 'utf-8').trim();
            const pid = parseInt(pidStr, 10);
            return isNaN(pid) ? null : pid;
        }
        return null;
    }
    catch (error) {
        logger_1.logger.error('Failed to read PID file:', error);
        return null;
    }
}
function removePid() {
    try {
        if (fs_1.default.existsSync(PID_PATH)) {
            fs_1.default.unlinkSync(PID_PATH);
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to remove PID file:', error);
    }
}
function isRunning() {
    const pid = getPid();
    if (!pid) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        if (error.code === 'ESRCH') {
            logger_1.logger.warn(`PID ${pid} not found, cleaning up stale PID file`);
            removePid();
        }
        return false;
    }
}
function readLog(lastLines = 20) {
    try {
        if (!fs_1.default.existsSync(LOG_PATH)) {
            return [];
        }
        const content = fs_1.default.readFileSync(LOG_PATH, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        return lines.slice(-lastLines);
    }
    catch (error) {
        logger_1.logger.error('Failed to read log file:', error);
        return [];
    }
}
function getLogPath() {
    return LOG_PATH;
}
