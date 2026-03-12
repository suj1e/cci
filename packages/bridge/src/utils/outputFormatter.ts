/**
 * 输出格式化工具
 * 负责清理和美化终端输出，适配飞书富文本格式
 * 参考 OpenClaw 的实现方式
 */

export class OutputFormatter {
  // 飞书卡片单条内容长度限制
  private static readonly MAX_CARD_LENGTH = 1800;

  /**
   * 清理 ANSI 转义码和终端控制序列
   */
  static stripAnsi(text: string): string {
    return text
      // 标准 CSI 序列: ESC [ ... letter
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      // OSC 序列: ESC ] ... BEL/ST
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
      // DCS/PM/APC 序列
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
      // 单字符转义序列
      .replace(/\x1b[()][AB012]/g, '')
      .replace(/\x1b[780DM]/g, '')
      // 其他控制序列
      .replace(/\x1b\[\?[0-9;]*[hl]/g, '')
      .replace(/\x1b\[\![0-9;]*[a-zA-Z]/g, '')
      // 清理残留的 ESC 字符
      .replace(/\x1b/g, '');
  }

  /**
   * 清理终端控制字符和残留标记
   */
  static stripControlChars(text: string): string {
    return text
      // 统一换行符
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // 处理残留的 [0m [0G 等标记
      .replace(/\[\d*[mGKF]/g, '')
      .replace(/\[0m/g, '')
      .replace(/\[0G/g, '')
      // 处理不可见控制字符（保留换行和制表符）
      .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\t' ? c : '')
      // 处理退格符 ^H
      .replace(/.\x08/g, '')
      // 移除 NULL 和 BEL
      .replace(/\x00/g, '')
      .replace(/\x07/g, '');
  }

  /**
   * 移除 Claude CLI 的前缀提示
   */
  static stripClaudePrompts(text: string): string {
    return text
      .replace(/^Claude>\s*/gm, '')
      .replace(/^(Thinking|Generating|Analyzing|Processing)\.*\s*/gm, '')
      // 清理行首残留的方括号标记
      .replace(/^\[.*?\]\s*/gm, '');
  }

  /**
   * 清理 Claude CLI 输出的所有乱码
   */
  static cleanOutput(raw: string): string {
    let result = raw;

    // 清理 ANSI 和控制字符
    result = this.stripAnsi(result);
    result = this.stripControlChars(result);

    // 移除 Claude CLI 前缀
    result = this.stripClaudePrompts(result);

    // 修复被截断的 Markdown 链接
    result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)[\s)]/g, '[$1]($2)');

    // 合并多余空行（最多保留2个）
    result = result.replace(/\n{3,}/g, '\n\n');

    // 清理行首行尾空格（代码块除外）
    result = this.trimLinesPreserveCodeBlocks(result);

    // 移除开头的空行
    result = result.replace(/^\n+/, '');

    return result;
  }

  /**
   * 清理行首行尾空格，但保留代码块内的空格
   */
  private static trimLinesPreserveCodeBlocks(text: string): string {
    const lines = text.split('\n');
    let inCodeBlock = false;
    const result: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        result.push(line);
        continue;
      }

      if (inCodeBlock) {
        // 代码块内保持原样
        result.push(line);
      } else {
        // 代码块外清理行尾空格
        result.push(line.trimEnd());
      }
    }

    return result.join('\n');
  }

  /**
   * 格式化输出用于飞书文本消息
   */
  static formatForFeishu(text: string): string {
    return this.cleanOutput(text);
  }

  /**
   * 格式化 Claude 输出内容（美化标题、列表等）
   */
  static formatClaudeContent(text: string): string {
    let content = this.cleanOutput(text);

    // 优化标题显示（只处理 # 和 ##，### 保持不变）
    content = content
      .replace(/^# (.+)$/gm, '### 📌 $1')  // 一级标题
      .replace(/^## (.+)$/gm, '### ✨ $1') // 二级标题
      .replace(/^(- .+)$/gm, '• $1');       // 无序列表优化

    return content;
  }

  /**
   * 智能拆分长内容（保持段落完整）
   */
  static splitContent(content: string, maxLength: number = this.MAX_CARD_LENGTH): string[] {
    const paragraphs = content.split('\n\n');
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if (current.length + para.length + 2 <= maxLength) {
        current += (current ? '\n\n' : '') + para;
      } else {
        if (current) chunks.push(current);

        // 单个段落过长则按句子拆分
        if (para.length > maxLength) {
          const sentences = para.split(/(?<=[。！？.!?])\s+/);
          let sentCurrent = '';

          for (const sent of sentences) {
            if (sentCurrent.length + sent.length + 1 <= maxLength) {
              sentCurrent += (sentCurrent ? ' ' : '') + sent;
            } else {
              if (sentCurrent) chunks.push(sentCurrent);
              sentCurrent = sent;
            }
          }

          current = sentCurrent;
        } else {
          current = para;
        }
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * 检测是否为有意义的输出
   */
  static hasContent(text: string): boolean {
    const cleaned = this.stripAnsi(text).trim();
    return cleaned.length > 0;
  }

  /**
   * 生成飞书 Post 消息格式（使用 Markdown 标签）
   * 参考 OpenClaw 实现：使用 { tag: "md", text: "..." } 支持 Markdown 渲染
   */
  static toFeishuPost(text: string): FeishuPostContent {
    const cleanText = this.formatClaudeContent(text);

    return {
      zh_cn: {
        title: '',
        content: [
          [
            { tag: 'md', text: cleanText }
          ]
        ]
      }
    };
  }

  /**
   * 生成飞书交互式卡片格式
   * 使用 lark_md 标签完美支持 Markdown 渲染
   */
  static toFeishuCard(text: string): FeishuCardContent {
    const formattedContent = this.formatClaudeContent(text);

    return {
      config: {
        wide_screen_mode: true,
        enable_forward: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: '🤖 Claude'
        },
        template: 'blue'
      },
      elements: [
        // 分割线
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '────────────────'
          }
        },
        // 内容区域
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: formattedContent
          }
        }
      ]
    };
  }

  /**
   * 生成多个飞书卡片（用于长内容拆分）
   */
  static toFeishuCards(text: string): FeishuCardContent[] {
    const formattedContent = this.formatClaudeContent(text);

    // 内容较短直接返回单个卡片
    if (formattedContent.length <= this.MAX_CARD_LENGTH) {
      return [this.toFeishuCard(text)];
    }

    // 内容过长自动分块
    const chunks = this.splitContent(formattedContent);
    const total = chunks.length;

    return chunks.map((chunk, index) => ({
      config: {
        wide_screen_mode: true,
        enable_forward: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: total > 1 ? `🤖 Claude (${index + 1}/${total})` : '🤖 Claude'
        },
        template: 'blue'
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '────────────────'
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: chunk
          }
        }
      ]
    }));
  }

  /**
   * 判断内容是否适合使用卡片格式
   * 代码块、表格、长文本等适合卡片
   */
  static shouldUseCard(text: string): boolean {
    const cleanText = this.formatForFeishu(text);
    // 包含代码块或表格时使用卡片
    if (cleanText.includes('```') || cleanText.includes('|')) {
      return true;
    }
    // 较长的内容也使用卡片
    return cleanText.length > 500;
  }
}

/**
 * 飞书 Post 消息结构
 */
interface FeishuPostContent {
  zh_cn: {
    title: string;
    content: Array<Array<{ tag: string; text: string }>>;
  };
}

/**
 * 飞书交互式卡片结构
 */
interface FeishuCardContent {
  config: {
    wide_screen_mode: boolean;
    enable_forward: boolean;
  };
  header: {
    title: {
      tag: 'plain_text';
      content: string;
    };
    template: string;
  };
  elements: Array<{
    tag: 'div' | 'markdown' | 'hr' | 'action' | 'note';
    text?: {
      tag: 'lark_md' | 'plain_text';
      content: string;
    };
    content?: string;
    actions?: any[];
  }>;
}
