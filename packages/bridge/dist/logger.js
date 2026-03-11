"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = void 0;
const LEVELS = ['debug', 'info', 'warn', 'error'];
class Logger {
    static instance;
    level = 'info';
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    setLevel(level) {
        this.level = level;
    }
    debug(...args) {
        if (this.shouldLog('debug')) {
            console.debug(...args);
        }
    }
    info(...args) {
        if (this.shouldLog('info')) {
            console.log(...args);
        }
    }
    warn(...args) {
        if (this.shouldLog('warn')) {
            console.warn(...args);
        }
    }
    error(...args) {
        if (this.shouldLog('error')) {
            console.error(...args);
        }
    }
    shouldLog(level) {
        return LEVELS.indexOf(level) >= LEVELS.indexOf(this.level);
    }
}
exports.Logger = Logger;
exports.logger = Logger.getInstance();
