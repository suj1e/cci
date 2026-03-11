export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export declare class Logger {
    private static instance;
    private level;
    static getInstance(): Logger;
    setLevel(level: LogLevel): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    private shouldLog;
}
export declare const logger: Logger;
