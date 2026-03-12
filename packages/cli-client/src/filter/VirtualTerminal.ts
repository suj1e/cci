/**
 * 虚拟终端缓冲区
 * 模拟终端屏幕，处理光标移动、覆盖、清屏等操作
 */

import { Cell, CursorPosition, FilterConfig } from './types';

export class VirtualTerminal {
  private buffer: Cell[][];  // [row][col]
  private cursor: CursorPosition;
  private config: FilterConfig;
  private savedCursor: CursorPosition | null = null;

  constructor(config: FilterConfig) {
    this.config = config;
    this.cursor = { x: 0, y: 0 };
    this.buffer = this.createEmptyBuffer();
  }

  private createEmptyBuffer(): Cell[][] {
    const rows: Cell[][] = [];
    for (let i = 0; i < this.config.terminalHeight * 10; i++) {
      rows.push([]);
    }
    return rows;
  }

  /**
   * 写入文本到缓冲区
   */
  write(text: string): void {
    for (const char of text) {
      this.writeChar(char);
    }
  }

  private writeChar(char: string): void {
    if (char === '\n') {
      this.cursor.x = 0;
      this.cursor.y++;
    } else if (char === '\r') {
      this.cursor.x = 0;
    } else if (char === '\t') {
      // 制表符，移动到下一个 8 的倍数位置
      this.cursor.x = Math.min(
        (Math.floor(this.cursor.x / 8) + 1) * 8,
        this.config.terminalWidth - 1
      );
    } else if (char === '\x08') {
      // 退格
      if (this.cursor.x > 0) {
        this.cursor.x--;
      }
    } else if (char.charCodeAt(0) >= 32) {
      // 可打印字符
      this.ensureRowExists(this.cursor.y);

      if (this.cursor.x >= this.buffer[this.cursor.y].length) {
        // 扩展行
        while (this.buffer[this.cursor.y].length <= this.cursor.x) {
          this.buffer[this.cursor.y].push({ char: ' ' });
        }
      }

      this.buffer[this.cursor.y][this.cursor.x] = { char };
      this.cursor.x++;

      // 自动换行
      if (this.cursor.x >= this.config.terminalWidth) {
        this.cursor.x = 0;
        this.cursor.y++;
      }
    }
  }

  private ensureRowExists(row: number): void {
    while (this.buffer.length <= row) {
      this.buffer.push([]);
    }
  }

  /**
   * 执行 CSI 序列命令
   * @param params 参数数组
   * @param command 命令字符
   */
  executeCsi(params: number[], command: string): void {
    const p1 = params[0] || 1;
    const p2 = params[1] || 1;

    switch (command) {
      case 'A': // 光标上移
        this.cursor.y = Math.max(0, this.cursor.y - p1);
        break;

      case 'B': // 光标下移
        this.cursor.y += p1;
        break;

      case 'C': // 光标右移
        this.cursor.x = Math.min(this.config.terminalWidth - 1, this.cursor.x + p1);
        break;

      case 'D': // 光标左移
        this.cursor.x = Math.max(0, this.cursor.x - p1);
        break;

      case 'E': // 光标移到下 N 行行首
        this.cursor.x = 0;
        this.cursor.y += p1;
        break;

      case 'F': // 光标移到上 N 行行首
        this.cursor.x = 0;
        this.cursor.y = Math.max(0, this.cursor.y - p1);
        break;

      case 'G': // 光标移到指定列
        this.cursor.x = Math.max(0, Math.min(this.config.terminalWidth - 1, p1 - 1));
        break;

      case 'H': // 光标移到指定位置 (row;col)
      case 'f':
        this.cursor.y = Math.max(0, p1 - 1);
        this.cursor.x = Math.max(0, Math.min(this.config.terminalWidth - 1, p2 - 1));
        break;

      case 'J': // 清屏
        this.clearScreen(p1);
        break;

      case 'K': // 清行
        this.clearLine(p1);
        break;

      case 'L': // 插入空行
        this.insertLines(p1);
        break;

      case 'M': // 删除行
        this.deleteLines(p1);
        break;

      case 'P': // 删除字符
        this.deleteChars(p1);
        break;

      case '@': // 插入字符
        this.insertChars(p1);
        break;

      case 's': // 保存光标位置
        this.savedCursor = { ...this.cursor };
        break;

      case 'u': // 恢复光标位置
        if (this.savedCursor) {
          this.cursor = { ...this.savedCursor };
        }
        break;

      // 忽略其他命令（颜色、样式等）
    }
  }

  private clearScreen(mode: number): void {
    switch (mode) {
      case 0: // 清除光标到屏幕末尾
        this.clearLineToEnd();
        for (let i = this.cursor.y + 1; i < this.buffer.length; i++) {
          this.buffer[i] = [];
        }
        break;

      case 1: // 清除屏幕开头到光标
        this.clearLineToStart();
        for (let i = 0; i < this.cursor.y; i++) {
          this.buffer[i] = [];
        }
        break;

      case 2: // 清除整个屏幕
      case 3: // 清除整个屏幕及滚动缓冲区
        this.buffer = this.createEmptyBuffer();
        break;
    }
  }

  private clearLine(mode: number): void {
    switch (mode) {
      case 0: // 清除光标到行尾
        this.clearLineToEnd();
        break;

      case 1: // 清除行首到光标
        this.clearLineToStart();
        break;

      case 2: // 清除整行
        if (this.cursor.y < this.buffer.length) {
          this.buffer[this.cursor.y] = [];
        }
        break;
    }
  }

  private clearLineToEnd(): void {
    if (this.cursor.y < this.buffer.length) {
      this.buffer[this.cursor.y] = this.buffer[this.cursor.y].slice(0, this.cursor.x);
    }
  }

  private clearLineToStart(): void {
    if (this.cursor.y < this.buffer.length) {
      const row = this.buffer[this.cursor.y];
      this.buffer[this.cursor.y] = new Array(this.cursor.x).fill({ char: ' ' });
      this.buffer[this.cursor.y].push(...row.slice(this.cursor.x));
    }
  }

  private insertLines(count: number): void {
    this.ensureRowExists(this.cursor.y);
    const emptyLines: Cell[][] = [];
    for (let i = 0; i < count; i++) {
      emptyLines.push([]);
    }
    this.buffer.splice(this.cursor.y, 0, ...emptyLines);
  }

  private deleteLines(count: number): void {
    if (this.cursor.y < this.buffer.length) {
      this.buffer.splice(this.cursor.y, count);
    }
  }

  private deleteChars(count: number): void {
    if (this.cursor.y < this.buffer.length) {
      this.buffer[this.cursor.y].splice(this.cursor.x, count);
    }
  }

  private insertChars(count: number): void {
    if (this.cursor.y < this.buffer.length) {
      const spaces: Cell[] = new Array(count).fill({ char: ' ' });
      this.buffer[this.cursor.y].splice(this.cursor.x, 0, ...spaces);
    }
  }

  /**
   * 获取缓冲区内容（干净的文本）
   */
  getContent(): string {
    const lines: string[] = [];

    for (const row of this.buffer) {
      if (row.length > 0) {
        const line = row.map(cell => cell.char).join('').trimEnd();
        lines.push(line);
      }
    }

    // 移除末尾空行
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    return lines.join('\n');
  }

  /**
   * 获取当前光标位置
   */
  getCursor(): CursorPosition {
    return { ...this.cursor };
  }

  /**
   * 设置光标位置
   */
  setCursor(x: number, y: number): void {
    this.cursor.x = Math.max(0, x);
    this.cursor.y = Math.max(0, y);
  }

  /**
   * 重置缓冲区
   */
  reset(): void {
    this.buffer = this.createEmptyBuffer();
    this.cursor = { x: 0, y: 0 };
    this.savedCursor = null;
  }
}
