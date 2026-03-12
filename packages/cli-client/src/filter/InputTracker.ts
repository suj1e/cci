/**
 * 输入追踪器
 * 记录用户输入，用于过滤 PTY 回显
 */

import { FilterConfig } from './types';

interface InputEntry {
  text: string;
  timestamp: number;
}

export class InputTracker {
  private entries: InputEntry[] = [];
  private config: FilterConfig;

  constructor(config: FilterConfig) {
    this.config = config;
  }

  /**
   * 记录用户输入
   */
  recordInput(data: string): void {
    const now = Date.now();

    // 清理过期的输入记录
    this.entries = this.entries.filter(
      e => now - e.timestamp < this.config.echoTimeout * 3
    );

    if (data.length === 0) return;

    // 处理特殊字符
    let text = '';

    for (const char of data) {
      if (char === '\x7f' || char === '\b') {
        // 退格：删除最后一个字符
        text = text.slice(0, -1);
      } else if (char === '\x03') {
        // Ctrl+C：清空当前输入
        text = '';
      } else if (char === '\r' || char === '\n') {
        // 回车：提交并重置
        if (text.length > 0) {
          this.entries.push({ text, timestamp: now });
        }
        text = '';
      } else if (char.charCodeAt(0) >= 32) {
        // 可打印字符
        text += char;
      }
    }

    // 未提交的输入（用户正在输入中）
    if (text.length > 0) {
      this.entries.push({ text, timestamp: now });
    }
  }

  /**
   * 检测输出是否为输入回显
   * @param output PTY 输出
   * @returns 如果是回显返回 true
   */
  isEcho(output: string): boolean {
    const now = Date.now();

    // 只检测最近的输入
    const recentEntries = this.entries.filter(
      e => now - e.timestamp < this.config.echoTimeout
    );

    if (recentEntries.length === 0) {
      return false;
    }

    // 快速剥离 ANSI 用于比较
    const cleanOutput = this.quickStripAnsi(output);

    for (const entry of recentEntries) {
      // 完全匹配
      if (cleanOutput === entry.text) {
        return true;
      }

      // 输出以输入开头（可能有换行）
      if (cleanOutput.startsWith(entry.text + '\n') ||
          cleanOutput.startsWith(entry.text + '\r\n')) {
        return true;
      }

      // 输出包含输入（回显通常在开头）
      if (cleanOutput.length > 0 &&
          entry.text.length > 2 &&
          cleanOutput.indexOf(entry.text) === 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * 快速剥离 ANSI 序列（用于回显检测）
   */
  private quickStripAnsi(text: string): string {
    return text
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/.\x08/g, '')
      .trim();
  }

  /**
   * 清理过期的输入记录
   */
  cleanup(): void {
    const now = Date.now();
    this.entries = this.entries.filter(
      e => now - e.timestamp < this.config.echoTimeout * 2
    );
  }

  /**
   * 重置追踪器
   */
  reset(): void {
    this.entries = [];
  }
}
