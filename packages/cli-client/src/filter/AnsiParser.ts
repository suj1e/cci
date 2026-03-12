/**
 * ANSI 序列解析器
 * 解析 ANSI 转义序列并执行相应操作
 */

import { VirtualTerminal } from './VirtualTerminal';

export class AnsiParser {
  private terminal: VirtualTerminal;

  // ANSI 序列正则
  private static readonly CSI_PATTERN = /\x1b\[([0-9;?]*)([A-Za-z])/g;
  private static readonly OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
  private static readonly OTHER_ESC_PATTERN = /\x1b[PX^_][^\x1b]*\x1b\\/g;
  private static readonly CHARSET_PATTERN = /\x1b[()][AB012]/g;
  private static readonly SINGLE_ESC_PATTERN = /\x1b[780DM]/g;

  constructor(terminal: VirtualTerminal) {
    this.terminal = terminal;
  }

  /**
   * 解析并处理文本中的 ANSI 序列
   * 返回剥离 ANSI 后的干净文本
   */
  parse(text: string): string {
    let result = '';
    let lastIndex = 0;

    // 重置正则状态
    AnsiParser.CSI_PATTERN.lastIndex = 0;
    AnsiParser.OSC_PATTERN.lastIndex = 0;
    AnsiParser.OTHER_ESC_PATTERN.lastIndex = 0;
    AnsiParser.CHARSET_PATTERN.lastIndex = 0;
    AnsiParser.SINGLE_ESC_PATTERN.lastIndex = 0;

    // 先处理 CSI 序列
    let match: RegExpExecArray | null;

    // 收集所有需要处理的序列及其位置
    const sequences: Array<{ start: number; end: number; handler: () => void }> = [];

    // CSI 序列
    while ((match = AnsiParser.CSI_PATTERN.exec(text)) !== null) {
      const paramsStr = match[1];
      const command = match[2];
      const params = this.parseParams(paramsStr);

      sequences.push({
        start: match.index,
        end: match.index + match[0].length,
        handler: () => this.executeCsi(params, command),
      });
    }

    // 按位置排序
    sequences.sort((a, b) => a.start - b.start);

    // 构建结果文本（排除 ANSI 序列，但执行其命令）
    for (let i = 0; i < text.length; i++) {
      const seq = sequences.find(s => s.start <= i && i < s.end);
      if (seq) {
        if (i === seq.start) {
          seq.handler();
        }
        continue;
      }

      // 检查其他转义序列（不执行，直接跳过）
      if (text[i] === '\x1b') {
        // 尝试匹配各种转义模式
        const remaining = text.slice(i);

        // OSC 序列
        if (remaining.match(/^\x1b\]/)) {
          const oscMatch = remaining.match(/^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/);
          if (oscMatch) {
            i += oscMatch[0].length - 1;
            continue;
          }
        }

        // 其他序列
        const otherMatch = remaining.match(/^\x1b[PX^_][^\x1b]*\x1b\\/);
        if (otherMatch) {
          i += otherMatch[0].length - 1;
          continue;
        }

        // 字符集
        const charsetMatch = remaining.match(/^\x1b[()][AB012]/);
        if (charsetMatch) {
          i += charsetMatch[0].length - 1;
          continue;
        }

        // 单字符转义
        const singleMatch = remaining.match(/^\x1b[780DM]/);
        if (singleMatch) {
          i += singleMatch[0].length - 1;
          continue;
        }

        // 未知的 ESC，跳过
        continue;
      }

      result += text[i];
    }

    return result;
  }

  /**
   * 解析 CSI 参数
   */
  private parseParams(paramsStr: string): number[] {
    if (!paramsStr || paramsStr === '?') {
      return [];
    }

    // 移除 ? 前缀（私有模式）
    const cleanStr = paramsStr.replace(/^\?/, '');

    return cleanStr
      .split(';')
      .map(p => parseInt(p, 10) || 0)
      .filter(p => !isNaN(p));
  }

  /**
   * 执行 CSI 命令
   */
  private executeCsi(params: number[], command: string): void {
    // 只有移动/清除类命令需要执行
    const movementCommands = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'f', 'J', 'K', 'L', 'M', 'P', '@', 's', 'u'];

    if (movementCommands.includes(command)) {
      this.terminal.executeCsi(params, command);
    }

    // 其他命令（颜色、样式等）忽略
  }

  /**
   * 快速剥离 ANSI（不执行命令，仅移除序列）
   */
  static strip(text: string): string {
    return text
      // CSI 序列
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      // OSC 序列
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
      // DCS/PM/APC 序列
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
      // 字符集选择
      .replace(/\x1b[()][AB012]/g, '')
      // 单字符转义
      .replace(/\x1b[780DM]/g, '')
      // 残留 ESC
      .replace(/\x1b/g, '');
  }
}
