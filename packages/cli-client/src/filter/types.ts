/**
 * PTY 输出过滤器类型定义
 */

export interface FilterResult {
  text: string;
  hasContent: boolean;
}

export interface FilterConfig {
  /** 终端宽度（用于光标移动计算） */
  terminalWidth: number;
  /** 终端高度 */
  terminalHeight: number;
  /** 回显检测超时（毫秒） */
  echoTimeout: number;
  /** 是否启用回显过滤 */
  enableEchoFilter: boolean;
  /** 是否启用 UI 元素过滤 */
  enableUiFilter: boolean;
}

export const DEFAULT_CONFIG: FilterConfig = {
  terminalWidth: 80,
  terminalHeight: 24,
  echoTimeout: 50,
  enableEchoFilter: true,
  enableUiFilter: true,
};

/**
 * 终端缓冲区单元格
 */
export interface Cell {
  char: string;
}

/**
 * 光标位置
 */
export interface CursorPosition {
  x: number;
  y: number;
}
