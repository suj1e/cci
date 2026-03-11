export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export class Logger {
  private static instance: Logger;
  private level: LogLevel = 'info';

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(...args);
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(...args);
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(...args);
    }
  }

  error(...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(...args);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(this.level);
  }
}

export const logger = Logger.getInstance();
