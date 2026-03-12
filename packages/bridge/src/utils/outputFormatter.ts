/**
 * 输出格式化工具
 * 负责清理和美化终端输出，适配飞书富文本格式
 * 参考 OpenClaw 的实现方式
 */

export class OutputFormatter {
  /**
   * 清理 ANSI 转义码
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
   * 清理终端控制字符
   */
  static stripControlChars(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\x00/g, '')
      .replace(/\x07/g, '');
  }

  /**
   * 格式化输出用于飞书文本消息
   */
  static formatForFeishu(text: string): string {
    let result = text;

    // 清理 ANSI 和控制字符
    result = this.stripAnsi(result);
    result = this.stripControlChars(result);

    // 清理多余的空行
    result = result.replace(/\n{3,}/g, '\n\n');

    // 清理行尾空格
    result = result.split('\n').map(line => line.trimEnd()).join('\n');

    // 移除开头的空行
    result = result.replace(/^\n+/, '');

    return result;
  }

  /**
   * 格式化 Claude 输出内容（美化标题、列表等）
   */
  static formatClaudeContent(text: string): string {
    let content = this.formatForFeishu(text);

    // 优化标题显示
    content = content
      .replace(/^# (.+)$/gm, '### 📌 $1')  // 一级标题
      .replace(/^## (.+)$/gm, '### ✨ $1') // 二级标题
      .replace(/^### (.+)$/gm, '### 💡 $1') // 三级标题
      .replace(/^(- .+)$/gm, '• $1'); // 无序列表优化

    return content;
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

    // 使用 OpenClaw 的方式：md 标签支持 Markdown 渲染
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
