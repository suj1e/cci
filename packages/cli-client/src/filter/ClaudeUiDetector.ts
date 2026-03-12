/**
 * Claude CLI UI 元素检测器
 * 过滤 spinner、框架、提示符等 UI 元素
 */

export class ClaudeUiDetector {
  // Claude CLI spinner 字符集（常见动画帧）
  private static readonly SPINNER_CHARS = new Set([
    "✢",
    "✶",
    "✻",
    "✽",
    "✾",
    "✿",
    "❀",
    "❁",
    "❂",
    "❃",
    "❄",
    "❅",
    "❆",
    "❇",
    "❈",
    "❉",
    "❊",
    "❋",
    "⚫",
    "⚪",
    "●",
    "○",
    "◐",
    "◑",
    "◒",
    "◓",
    "◔",
    "◕",
    "◈",
    "◇",
    "◆",
    "◉",
    "◊",
    "★",
    "☆",
    "✦",
    "✧",
    "✩",
    "✪",
    "✫",
    "✬",
    "✭",
    "✮",
    "✯",
    "✰",
    "⠁",
    "⠂",
    "⠃",
    "⠄",
    "⠅",
    "⠆",
    "⠇",
    "⠈",
    "⠉",
    "⠊",
    "⠋",
    "⠌",
    "⠍",
    "⠎",
    "⠏",
    "⠐",
    "⠑",
    "⠒",
    "⠓",
    "⠔",
    "⠕",
    "⠖",
    "⠗",
    "⠘",
    "⠙",
    "⠚",
    "⠛",
    "⠜",
    "⠝",
    "⠞",
    "⠟",
    "⠠",
    "⠡",
    "⠢",
    "⠣",
    "⠤",
    "⠥",
    "⠦",
    "⠧",
    "⠨",
    "⠩",
    "⠪",
    "⠫",
    "⠬",
    "⠭",
    "⠮",
    "⠯",
    "⠰",
    "⠱",
    "⠲",
    "⠳",
    "⠴",
    "⠵",
    "⠶",
    "⠷",
    "⠸",
    "⠹",
    "⠺",
    "⠻",
    "⠼",
    "⠽",
    "⠾",
    "⠿",
    "⸢",
    "⸣",
    "⸤",
    "⸥",
    "⋅",
    "∙",
    "●",
    "○",
    "☉",
    "⊕",
    "⊗",
    "*",
    "·",
    "•",
    "‧",
    "‣",
    "⁃",
    "∙",
    "⋅",
  ]);

  // UI 框架制表符
  private static readonly BOX_CHARS = new Set([
    "╭",
    "╮",
    "╰",
    "╯",
    "─",
    "│",
    "┌",
    "┐",
    "└",
    "┘",
    "├",
    "┤",
    "┬",
    "┴",
    "┼",
    "═",
    "║",
    "╔",
    "╗",
    "╚",
    "╝",
    "╠",
    "╣",
    "╦",
    "╩",
    "╬",
    "╒",
    "╓",
    "╕",
    "╖",
    "╘",
    "╙",
    "╛",
    "╜",
    "╞",
    "╟",
    "╡",
    "╢",
    "╤",
    "╥",
    "╨",
    "╩",
    "╪",
    "╫",
    "┄",
    "┅",
    "┆",
    "┇",
    "┈",
    "┉",
    "┊",
    "┋",
  ]);

  // Unicode 块元素字符（用于绘制终端 UI）
  private static readonly BLOCK_CHARS = new Set([
    // 完整/部分方块
    "█",
    "▉",
    "▊",
    "▋",
    "▌",
    "▍",
    "▎",
    "▏",
    "▐",
    "░",
    "▒",
    "▓",
    "▔",
    "▕",
    // 上下半块
    "▀",
    "▁",
    "▂",
    "▃",
    "▄",
    "▅",
    "▆",
    "▇",
    // 象限块（用于绘制圆角边框）
    "▖",
    "▗",
    "▘",
    "▙",
    "▚",
    "▛",
    "▜",
    "▝",
    "▞",
    "▟",
  ]);

  // Claude 提示符模式
  private static readonly PROMPT_PATTERNS = [
    /^Claude>\s*/gm,
    /^>?\s*Claude\b.*$/gm,
    /^(Thinking|Generating|Analyzing|Processing|Streaming|Loading|Working)\.{2,}\s*$/gm,
    /^(Thinking|Generating|Analyzing|Processing|Streaming|Loading|Working)\s*$/gm,
    /^\s*\[\s*Ctrl\+[A-Za-z]\s*\]\s*$/gm, // 快捷键提示行
    /^\s*\[.*?\]\s*$/gm, // 单独行方括号内容（可能是快捷键）
  ];

  // 行内快捷键提示
  private static readonly KEYBINDING_INLINE =
    /\s*\[(Ctrl|Alt|Shift|Cmd|⌘|⌥|⌃)\+?[A-Za-z0-9]+\]/g;

  // 框架行模式（整行只有框架字符和空格）
  private static readonly FRAME_LINE_PATTERN =
    /^[╭╮╰╯─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬\s]+$/;

  // 块元素行模式（延迟初始化）
  private static _blockLinePattern: RegExp | null = null;

  private static get BLOCK_LINE_PATTERN(): RegExp {
    if (!ClaudeUiDetector._blockLinePattern) {
      const blockChars = Array.from(ClaudeUiDetector.BLOCK_CHARS).join("");
      ClaudeUiDetector._blockLinePattern = new RegExp(
        `^[${blockChars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s]*$`,
      );
    }
    return ClaudeUiDetector._blockLinePattern;
  }

  // Spinner 行模式（延迟初始化）
  private static _spinnerLinePattern: RegExp | null = null;

  private static get SPINNER_LINE_PATTERN(): RegExp {
    if (!ClaudeUiDetector._spinnerLinePattern) {
      const spinnerChars = Array.from(ClaudeUiDetector.SPINNER_CHARS).join("");
      ClaudeUiDetector._spinnerLinePattern = new RegExp(
        `^[${spinnerChars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s]*$`,
      );
    }
    return ClaudeUiDetector._spinnerLinePattern;
  }

  /**
   * 过滤 Claude UI 元素
   */
  filter(text: string): string {
    let lines = text.split("\n");

    // 1. 过滤 spinner 行和框架行
    lines = lines.filter((line) => !this.isUiOnlyLine(line));

    // 2. 处理剩余内容
    let result = lines.join("\n");

    // 3. 移除提示符
    for (const pattern of ClaudeUiDetector.PROMPT_PATTERNS) {
      result = result.replace(pattern, "");
    }

    // 4. 移除行内快捷键提示
    result = result.replace(ClaudeUiDetector.KEYBINDING_INLINE, "");

    // 5. 移除行内残留的 spinner 字符
    result = this.removeInlineSpinners(result);

    // 6. 清理框架字符残留
    result = this.removeFrameArtifacts(result);

    return result;
  }

  /**
   * 检测是否为纯 UI 行（应该整行删除）
   */
  private isUiOnlyLine(line: string): boolean {
    // 空行保留
    if (line.trim().length === 0) {
      return false;
    }

    // Spinner 行
    if (ClaudeUiDetector.SPINNER_LINE_PATTERN.test(line)) {
      return true;
    }

    // 框架行
    if (ClaudeUiDetector.FRAME_LINE_PATTERN.test(line)) {
      return true;
    }

    // 块元素行
    if (ClaudeUiDetector.BLOCK_LINE_PATTERN.test(line)) {
      return true;
    }

    // 分隔线（连续的横线或等号）
    if (/^[─═\-_=~\s]+$/.test(line)) {
      return true;
    }

    return false;
  }

  /**
   * 移除行内 spinner 字符和块元素字符
   */
  private removeInlineSpinners(text: string): string {
    let result = "";

    for (const char of text) {
      if (
        !ClaudeUiDetector.SPINNER_CHARS.has(char) &&
        !ClaudeUiDetector.BLOCK_CHARS.has(char)
      ) {
        result += char;
      }
    }

    return result;
  }

  /**
   * 移除框架残留
   */
  private removeFrameArtifacts(text: string): string {
    return (
      text
        // 移除孤立的框架字符
        .replace(/[╭╮╰╯│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]/g, "")
        // 清理连续空格
        .replace(/  +/g, " ")
    );
  }

  /**
   * 检测文本是否包含 spinner 字符
   */
  hasSpinner(text: string): boolean {
    for (const char of text) {
      if (ClaudeUiDetector.SPINNER_CHARS.has(char)) {
        return true;
      }
    }
    return false;
  }
}
