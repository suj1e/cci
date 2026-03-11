import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger';

const PID_DIR = path.join(os.homedir(), '.feishu-bridge');
const PID_PATH = path.join(PID_DIR, 'service.pid');
const LOG_PATH = path.join(PID_DIR, 'service.log');

function ensurePidDir(): void {
  if (!fs.existsSync(PID_DIR)) {
    fs.mkdirSync(PID_DIR, { recursive: true, mode: 0o700 });
  }
}

export function savePid(pid: number): void {
  ensurePidDir();
  fs.writeFileSync(PID_PATH, pid.toString(), { mode: 0o600 });
}

export function getPid(): number | null {
  try {
    if (fs.existsSync(PID_PATH)) {
      const pidStr = fs.readFileSync(PID_PATH, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);
      return isNaN(pid) ? null : pid;
    }
    return null;
  } catch (error) {
    logger.error('Failed to read PID file:', error);
    return null;
  }
}

export function removePid(): void {
  try {
    if (fs.existsSync(PID_PATH)) {
      fs.unlinkSync(PID_PATH);
    }
  } catch (error) {
    logger.error('Failed to remove PID file:', error);
  }
}

export function isRunning(): boolean {
  const pid = getPid();
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    if (error.code === 'ESRCH') {
      logger.warn(`PID ${pid} not found, cleaning up stale PID file`);
      removePid();
    }
    return false;
  }
}

export function readLog(lastLines: number = 20): string[] {
  try {
    if (!fs.existsSync(LOG_PATH)) {
      return [];
    }
    const content = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    return lines.slice(-lastLines);
  } catch (error) {
    logger.error('Failed to read log file:', error);
    return [];
  }
}

export function getLogPath(): string {
  return LOG_PATH;
}
