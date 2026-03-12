/**
 * PTY 输出过滤器
 * 将 PTY 原始字节流转换为干净的语义文本
 */

import { FilterConfig, FilterResult, DEFAULT_CONFIG } from './types';
import { VirtualTerminal } from './VirtualTerminal';
import { InputTracker } from './InputTracker';
import { AnsiParser } from './AnsiParser';
import { ClaudeUiDetector } from './ClaudeUiDetector';

export class PtyOutputFilter {
  private config: FilterConfig;
  private terminal: VirtualTerminal;
  private inputTracker: InputTracker;
  private ansiParser: AnsiParser;
  private claudeUiDetector: ClaudeUiDetector;

  // 累积缓冲区（用于处理分段的 ANSI 序列）
  private buffer: string = '';

  // 已发送内容的行数追踪（用于增量发送）
  private lastSentLineCount: number = 0;

  constructor(config: Partial<FilterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.terminal = new VirtualTerminal(this.config);
    this.inputTracker = new InputTracker(this.config);
    this.ansiParser = new AnsiParser(this.terminal);
    this.claudeUiDetector = new ClaudeUiDetector();
  }

  /**
   * 记录用户输入（用于回显过滤）
   */
  recordInput(data: string): void {
    if (this.config.enableEchoFilter) {
      this.inputTracker.recordInput(data);
    }
  }

  /**
   * 过滤 PTY 输出
   * @param data PTY 原始输出
   * @returns 过滤结果
   */
  filter(data: string): FilterResult {
    // 累积数据（处理可能的分段 ANSI 序列）
    this.buffer += data;

    // 检测回显
    if (this.config.enableEchoFilter && this.inputTracker.isEcho(this.buffer)) {
      // 是输入回显，清空缓冲区，不输出
      this.buffer = '';
      return { text: '', hasContent: false };
    }

    // 解析 ANSI 并更新虚拟终端（用于正确处理光标移动）
    const cleanText = this.ansiParser.parse(this.buffer);

    // 写入虚拟终端（处理光标移动、覆盖等）
    this.terminal.write(cleanText);

    // 获取终端内容
    const terminalContent = this.terminal.getContent();

    // 增量发送：只发送新增的行
    const lines = terminalContent.split('\n');
    const newLines = lines.slice(this.lastSentLineCount);
    this.lastSentLineCount = lines.length;

    // 如果没有新内容，直接返回
    if (newLines.length === 0) {
      this.buffer = '';
      return { text: '', hasContent: false };
    }

    // 过滤 Claude UI 元素
    let result = newLines.join('\n');
    if (this.config.enableUiFilter) {
      result = this.claudeUiDetector.filter(result);
    }

    // 最终清理
    result = this.cleanup(result);

    // 清空缓冲区
    this.buffer = '';

    const hasContent = result.trim().length > 0;

    return {
      text: result,
      hasContent,
    };
  }

  /**
   * 最终清理
   */
  private cleanup(text: string): string {
    return text
      // 统一换行符
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // 移除 NULL 和 BEL
      .replace(/\x00/g, '')
      .replace(/\x07/g, '')
      // 移除其他控制字符（保留换行和制表符）
      .replace(/[\x01-\x06\x08-\x1F\x7F]/g, '')
      // 合并多余空行（最多保留 2 个）
      .replace(/\n{3,}/g, '\n\n')
      // 清理行尾空格
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      // 移除开头空行
      .replace(/^\n+/, '')
      // 移除结尾空行
      .replace(/\n+$/, '');
  }

  /**
   * 重置过滤器状态
   */
  reset(): void {
    this.buffer = '';
    this.lastSentLineCount = 0;
    this.terminal.reset();
    this.inputTracker.reset();
  }

  /**
   * 获取当前终端内容（调试用）
   */
  getTerminalContent(): string {
    return this.terminal.getContent();
  }

  /**
   * 更新终端尺寸
   */
  resize(width: number, height: number): void {
    this.config.terminalWidth = width;
    this.config.terminalHeight = height;
    // 注意：VirtualTerminal 重建会丢失内容，这里简单处理
  }
}
