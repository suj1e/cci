/**
 * 输出格式化工具
 * 飞书 Schema 2.0 卡片 + 完整卡片模板库
 */

export interface FeishuCardV2 {
  schema: '2.0';
  header: {
    title: { tag: 'plain_text'; content: string };
    template: 'blue' | 'green' | 'red' | 'yellow' | 'orange' | 'grey';
  };
  body: {
    elements: Array<
      | { tag: 'markdown'; content: string }
      | { tag: 'hr' }
      | { tag: 'collapsible_panel'; header: { title: { tag: 'plain_text'; content: string } }; elements: Array<{ tag: 'markdown'; content: string }> }
      | { tag: 'action'; actions: ActionButton[] }
    >;
  };
}

interface ActionButton {
  tag: 'button';
  text: { tag: 'plain_text'; content: string };
  type: 'primary' | 'danger' | 'default';
  value: Record<string, string>;
  behaviors?: Array<{ type: 'callback'; value: Record<string, string> }>;
}

export interface FeishuPostContent {
  zh_cn: {
    title: string;
    content: Array<Array<{ tag: string; text?: string; href?: string; language?: string; code?: string }>>;
  };
}

export class OutputFormatter {
  private static readonly MAX_CARD_LENGTH = 3000;
  private static readonly MAX_RESULT_PREVIEW = 300;

  // ── 文本清理 ──────────────────────────────────────────────────────────────

  static stripAnsi(text: string): string {
    return text
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
      .replace(/\x1b[()][AB012]/g, '')
      .replace(/\x1b[780DM]/g, '')
      .replace(/\x1b\[\?[0-9;]*[hl]/g, '')
      .replace(/\x1b/g, '');
  }

  static formatForFeishu(text: string): string {
    return text
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      .replace(/\x1b/g, '')
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')
      .replace(/.\\x08/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n').map(l => l.trimEnd()).join('\n')
      .replace(/^\n+/, '').replace(/\n+$/, '');
  }

  static hasContent(text: string): boolean {
    return this.stripAnsi(text).trim().length > 0;
  }

  static shouldUseCard(text: string): boolean {
    const clean = this.formatForFeishu(text);
    return clean.includes('```') || clean.includes('|') || clean.length > 500;
  }

  // ── Post 消息（短文本用）──────────────────────────────────────────────────

  static toFeishuPost(text: string): FeishuPostContent {
    const clean = this.formatForFeishu(text);
    const rows: Array<Array<{ tag: string; text?: string; href?: string; language?: string; code?: string }>> = [];
    let inCode = false;
    let codeLang = '';
    let codeLines: string[] = [];

    for (const line of clean.split('\n')) {
      if (line.startsWith('```')) {
        if (!inCode) {
          inCode = true;
          codeLang = line.slice(3).trim() || 'plain';
          codeLines = [];
        } else {
          rows.push([{ tag: 'code_block', language: codeLang, code: codeLines.join('\n') }]);
          inCode = false;
          codeLines = [];
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      // 链接
      const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
      if (linkRe.test(line)) {
        const parts: Array<{ tag: string; text?: string; href?: string }> = [];
        let last = 0;
        linkRe.lastIndex = 0;
        let m;
        while ((m = linkRe.exec(line)) !== null) {
          if (m.index > last) parts.push({ tag: 'text', text: line.slice(last, m.index) });
          parts.push({ tag: 'a', text: m[1], href: m[2] });
          last = m.index + m[0].length;
        }
        if (last < line.length) parts.push({ tag: 'text', text: line.slice(last) });
        rows.push(parts);
      } else {
        rows.push([{ tag: 'text', text: line }]);
      }
    }

    return { zh_cn: { title: '', content: rows } };
  }

  // ── Schema 2.0 卡片（标准内容） ───────────────────────────────────────────

  static toFeishuCards(text: string): FeishuCardV2[] {
    const clean = this.formatForFeishu(text);
    if (clean.length <= this.MAX_CARD_LENGTH) {
      return [this.buildContentCard(clean)];
    }
    const chunks = this.splitContent(clean);
    return chunks.map((chunk, i) => this.buildContentCard(chunk, chunks.length > 1 ? `${i + 1}/${chunks.length}` : undefined));
  }

  private static buildContentCard(content: string, part?: string): FeishuCardV2 {
    return {
      schema: '2.0',
      header: {
        title: { tag: 'plain_text', content: part ? `🤖 Claude (${part})` : '🤖 Claude' },
        template: 'blue',
      },
      body: { elements: [{ tag: 'markdown', content }] },
    };
  }

  static splitContent(content: string, max = this.MAX_CARD_LENGTH): string[] {
    const paras = content.split('\n\n');
    const chunks: string[] = [];
    let cur = '';
    for (const p of paras) {
      if (cur.length + p.length + 2 <= max) {
        cur += (cur ? '\n\n' : '') + p;
      } else {
        if (cur) chunks.push(cur);
        cur = p.length > max ? p.slice(0, max) : p;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  // ── 状态卡片模板 ──────────────────────────────────────────────────────────

  static buildThinkingCard(): FeishuCardV2 {
    return this.base('💭 Claude 思考中', 'grey', [{ tag: 'markdown', content: '💭 **思考中…**' }]);
  }

  static buildToolCard(tools: ToolRecord[], stream?: { summary: string; content: string }): FeishuCardV2 {
    const elements: FeishuCardV2['body']['elements'] = [];

    for (const t of tools) {
      const statusIcon = t.status === 'running' ? '⏳' : '✓';
      const line = `${t.emoji} **${t.desc || t.name}** ${statusIcon}`;
      if (t.result) {
        elements.push({
          tag: 'collapsible_panel',
          header: { title: { tag: 'plain_text', content: `${t.emoji} ${t.desc || t.name} ${statusIcon}` } },
          elements: [{ tag: 'markdown', content: `\`\`\`\n${t.result}\n\`\`\`` }],
        });
      } else {
        elements.push({ tag: 'markdown', content: line });
      }
    }

    if (stream) {
      elements.push({ tag: 'hr' });
      elements.push({ tag: 'markdown', content: `> ${stream.summary}` });
      elements.push({ tag: 'hr' });
      elements.push({ tag: 'markdown', content: stream.content || '⚡ **正在回复…**' });
    }

    return this.base('🤖 Claude', 'blue', elements);
  }

  static buildPromptConfirmCard(message: string): FeishuCardV2 {
    return this.base('🤖 Claude ⚠️', 'yellow', [
      { tag: 'markdown', content: message || '确认继续？' },
      { tag: 'action', actions: [
        this.btn('✅ 确认', 'primary', { action: 'confirm', value: 'y' }),
        this.btn('❌ 取消', 'danger', { action: 'confirm', value: 'n' }),
      ]},
    ]);
  }

  static buildPromptPermissionCard(tool: string, target: string): FeishuCardV2 {
    return this.base('🤖 Claude 🔐', 'yellow', [
      { tag: 'markdown', content: `Claude 想要 **${tool}** \`${target}\`` },
      { tag: 'action', actions: [
        this.btn('允许一次', 'primary', { action: 'permission', value: '1' }),
        this.btn('总是允许', 'default', { action: 'permission', value: '2' }),
        this.btn('拒绝', 'danger', { action: 'permission', value: '3' }),
      ]},
    ]);
  }

  static buildPromptChoiceCard(message: string, options: string[]): FeishuCardV2 {
    const buttons = options.map((opt, i) =>
      this.btn(opt, 'default', { action: 'choice', value: String(i + 1) })
    );
    return this.base('🤖 Claude', 'blue', [
      { tag: 'markdown', content: message },
      { tag: 'action', actions: buttons },
    ]);
  }

  static buildPromptPlanCard(steps: string[]): FeishuCardV2 {
    const stepsText = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    return this.base('🤖 Claude 📋', 'blue', [
      { tag: 'markdown', content: `**执行计划**\n\n${stepsText}` },
      { tag: 'action', actions: [
        this.btn('✅ 执行', 'primary', { action: 'plan', value: 'y' }),
        this.btn('❌ 取消', 'danger', { action: 'plan', value: 'n' }),
      ]},
    ]);
  }

  static buildAskUserCard(question: string): FeishuCardV2 {
    return this.base('🤖 Claude ❓', 'blue', [
      { tag: 'markdown', content: `❓ ${question}\n\n（直接回复飞书即可）` },
    ]);
  }

  static buildErrorCard(toolName: string, message: string): FeishuCardV2 {
    return this.base('🤖 Claude ❌', 'red', [
      {
        tag: 'collapsible_panel',
        header: { title: { tag: 'plain_text', content: `❌ ${toolName} 执行失败` } },
        elements: [{ tag: 'markdown', content: `\`\`\`\n${message}\n\`\`\`` }],
      },
    ]);
  }

  static buildApiErrorCard(errorType: 'rate_limit' | 'context_full' | 'other', message: string): FeishuCardV2 {
    const info = {
      rate_limit: { icon: '⏳', title: 'API 限流', body: 'Claude 触发了速率限制，正在等待重试…' },
      context_full: { icon: '📦', title: '上下文已满', body: '对话上下文已满，建议发送 `/compact` 压缩对话后继续。' },
      other: { icon: '⚠️', title: 'API 错误', body: message },
    }[errorType];
    return this.base(`🤖 Claude ${info.icon}`, 'red', [
      { tag: 'markdown', content: `**${info.title}**\n\n${info.body}` },
    ]);
  }

  static buildCommandEchoCard(command: string): FeishuCardV2 {
    return this.base('🤖 Claude', 'grey', [
      { tag: 'markdown', content: `⚙️ 已执行 \`${command}\`` },
    ]);
  }

  static buildNotificationCard(message: string): FeishuCardV2 {
    return this.base('🔔 Claude 通知', 'orange', [
      { tag: 'markdown', content: message },
    ]);
  }

  static buildHookBlockedCard(hookName: string, reason: string): FeishuCardV2 {
    return this.base('🤖 Claude ⛔', 'red', [
      { tag: 'markdown', content: `**Hook 拦截**：${hookName}\n\n${reason}` },
    ]);
  }

  static buildDiffCard(content: string, fileName?: string): FeishuCardV2 {
    const title = fileName ? `📄 ${fileName} 变更` : '📄 文件变更';
    return this.base(title, 'grey', [
      { tag: 'markdown', content: `\`\`\`diff\n${content}\n\`\`\`` },
    ]);
  }

  static buildCompactingCard(auto: boolean): FeishuCardV2 {
    return this.base('🤖 Claude', 'grey', [
      { tag: 'markdown', content: auto ? '🗜️ 对话接近上限，正在自动压缩…' : '🗜️ 正在压缩对话…' },
    ]);
  }

  static buildSkillLoadingCard(skillName: string, loaded?: number, total?: number): FeishuCardV2 {
    const text = loaded !== undefined
      ? `📚 已加载 ${loaded}${total ? `/${total}` : ''} 个 skills`
      : `📚 加载 skill: \`${skillName}\``;
    return this.base('🤖 Claude', 'grey', [{ tag: 'markdown', content: text }]);
  }

  // 按钮点击后的"已选择"更新卡片
  static buildButtonDoneCard(title: string, chosen: string): FeishuCardV2 {
    return this.base(title, 'grey', [
      { tag: 'markdown', content: `✅ 已选择：**${chosen}**` },
    ]);
  }

  // ── 私有工具 ──────────────────────────────────────────────────────────────

  private static base(
    title: string,
    color: FeishuCardV2['header']['template'],
    elements: FeishuCardV2['body']['elements'],
  ): FeishuCardV2 {
    return {
      schema: '2.0',
      header: { title: { tag: 'plain_text', content: title }, template: color },
      body: { elements },
    };
  }

  private static btn(label: string, type: ActionButton['type'], value: Record<string, string>): ActionButton {
    return {
      tag: 'button',
      text: { tag: 'plain_text', content: label },
      type,
      value,
      behaviors: [{ type: 'callback', value }],
    };
  }
}

// ── 工具记录类型（供 bridge 使用）────────────────────────────────────────────

export interface ToolRecord {
  name: string;
  desc: string;
  status: 'running' | 'done';
  emoji: string;
  result?: string;
}