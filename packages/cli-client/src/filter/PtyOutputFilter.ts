/**
 * PTY 输出过滤器
 * 将 PTY 原始字节流转换为干净的语义文本
 */

import { FilterConfig, FilterResult, DEFAULT_CONFIG } from "./types";
import { InputTracker } from "./InputTracker";
import { AnsiParser } from "./AnsiParser";
import { ClaudeUiDetector } from "./ClaudeUiDetector";

export class PtyOutputFilter {
  private config: FilterConfig;
  private inputTracker: InputTracker;
  private claudeUiDetector: ClaudeUiDetector;

  constructor(config: Partial<FilterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.inputTracker = new InputTracker(this.config);
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
    // 检测回显
    if (this.config.enableEchoFilter && this.inputTracker.isEcho(data)) {
      return { text: "", hasContent: false };
    }

    // 清理 ANSI 和控制字符
    let result = AnsiParser.strip(data);

    // 过滤 Claude UI 元素
    if (this.config.enableUiFilter) {
      result = this.claudeUiDetector.filter(result);
    }

    // 最终清理
    result = this.cleanup(result);

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
    return (
      text
        // 统一换行符
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // 移除 NULL 和 BEL
        .replace(/\x00/g, "")
        .replace(/\x07/g, "")
        // 移除其他控制字符（保留换行和制表符）
        .replace(/[\x01-\x06\x08-\x1F\x7F]/g, "")
        // 合并多余空行（最多保留 2 个）
        .replace(/\n{3,}/g, "\n\n")
        // 清理行尾空格
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        // 移除开头空行
        .replace(/^\n+/, "")
        // 移除结尾空行
        .replace(/\n+$/, "")
    );
  }

  /**
   * 重置过滤器状态
   */
  reset(): void {
    this.inputTracker.reset();
  }

  /**
   * 更新终端尺寸
   */
  resize(width: number, height: number): void {
    this.config.terminalWidth = width;
    this.config.terminalHeight = height;
  }
}
