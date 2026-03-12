/**
 * Claude CLI 语义事件提取器
 *
 * 识别 PTY 输出中的所有语义事件，供 PtyOutputFilter 上报给 bridge。
 */

export type LineEvent =
  | { type: 'thinking_start' }
  | { type: 'thinking_end' }
  | { type: 'tool_call'; toolName: string; toolDesc: string; status: 'running' | 'done' }
  | { type: 'tool_result'; content: string }
  | { type: 'ask_user'; question: string }
  | { type: 'prompt_confirm'; message: string }
  | { type: 'prompt_permission'; tool: string; target: string }
  | { type: 'prompt_choice'; message: string; options: string[] }
  | { type: 'prompt_plan'; steps: string[] }
  | { type: 'skill_loading'; skillName: string; loaded?: number; total?: number }
  | { type: 'mcp_loading'; serverName: string; done: boolean }
  | { type: 'compacting'; auto: boolean }
  | { type: 'subagent_start'; agentType: string; desc: string }
  | { type: 'hook_blocked'; hookName: string; reason: string }
  | { type: 'hook_warning'; hookName: string; message: string }
  | { type: 'notification'; message: string }
  | { type: 'error_api'; errorType: 'rate_limit' | 'context_full' | 'other'; message: string }
  | { type: 'error_tool'; toolName: string; message: string }
  | { type: 'command_echo'; command: string }
  | { type: 'diff_line'; line: string }
  | { type: 'noise' }
  | { type: 'content'; text: string };

export class ClaudeUiDetector {

  // ── Spinner / 噪声字符集 ───────────────────────────────────────────────────

  private static readonly SPINNER_CHARS = new Set([
    '✢','✶','✻','✽','✾','✿','❀','❁','❂','❃','❄','❅','❆','❇','❈','❉','❊','❋',
    '⚫','⚪','●','○','◐','◑','◒','◓','◔','◕','◈','◇','◆','◉','◊',
    '★','☆','✦','✧','✩','✪','✫','✬','✭','✮','✯','✰',
    '⠁','⠂','⠃','⠄','⠅','⠆','⠇','⠈','⠉','⠊','⠋','⠌','⠍','⠎','⠏',
    '⠐','⠑','⠒','⠓','⠔','⠕','⠖','⠗','⠘','⠙','⠚','⠛','⠜','⠝','⠞','⠟',
    '⠠','⠡','⠢','⠣','⠤','⠥','⠦','⠧','⠨','⠩','⠪','⠫','⠬','⠭','⠮','⠯',
    '⠰','⠱','⠲','⠳','⠴','⠵','⠶','⠷','⠸','⠹','⠺','⠻','⠼','⠽','⠾','⠿',
    '*','·','•','‧','‣','⁃','∙','⋅',
  ]);

  private static readonly BOX_RE = /[╭╮╰╯─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬┄┅┆┇┈┉┊┋]/;
  private static readonly BLOCK_RE = /[█▉▊▋▌▍▎▏▐░▒▓▔▕▀▁▂▃▄▅▆▇▖▗▘▙▚▛▜▝▞▟]/;

  // ── 工具调用模式（● 开头） ────────────────────────────────────────────────

  private static readonly TOOL_PATTERNS: Array<{
    re: RegExp;
    name: string | null; // null = 从捕获组取
    descGroup: number;
    nameGroup?: number;
    status: 'running' | 'done';
  }> = [
    // Bash
    { re: /^[●•]\s*Bash\((.+?)\)(?:[…\.]+)?$/i,                              name: 'Bash',       descGroup: 1, status: 'running' },
    // Grep
    { re: /^[●•]\s*Grep(?:ping)?\s+(.+?)(?:[…\.]+)?$/i,                      name: 'Grep',       descGroup: 1, status: 'running' },
    // Glob
    { re: /^[●•]\s*Glob(?:bing)?\s+(.+?)(?:[…\.]+)?$/i,                      name: 'Glob',       descGroup: 1, status: 'running' },
    // LS / List
    { re: /^[●•]\s*(?:LS|List(?:ing)?)\s+(.+?)(?:[…\.]+)?$/i,                name: 'LS',         descGroup: 1, status: 'running' },
    // Read
    { re: /^[●•]\s*Read(?:ing)?\s+(?:file\s+)?(.+?)(?:[…\.]+)?$/i,           name: 'Read',       descGroup: 1, status: 'running' },
    { re: /^[●•]\s*Read\s+(\d+\s+files?.*)$/i,                                name: 'Read',       descGroup: 1, status: 'done'    },
    // Edit
    { re: /^[●•]\s*Edit(?:ing|ed)?\s+(.+?)(?:[…\.]+)?$/i,                    name: 'Edit',       descGroup: 1, status: 'running' },
    { re: /^[●•]\s*Edited\s+(.+)$/i,                                          name: 'Edit',       descGroup: 1, status: 'done'    },
    // MultiEdit
    { re: /^[●•]\s*MultiEdit(?:ing)?\s+(.+?)(?:[…\.]+)?$/i,                  name: 'MultiEdit',  descGroup: 1, status: 'running' },
    // Write
    { re: /^[●•]\s*Writ(?:ing|e|ten)\s+(.+?)(?:[…\.]+)?$/i,                  name: 'Write',      descGroup: 1, status: 'running' },
    { re: /^[●•]\s*Wrote\s+(.+)$/i,                                           name: 'Write',      descGroup: 1, status: 'done'    },
    // WebSearch
    { re: /^[●•]\s*WebSearch\("?(.+?)"?\)(?:[…\.]+)?$/i,                     name: 'WebSearch',  descGroup: 1, status: 'running' },
    // WebFetch
    { re: /^[●•]\s*WebFetch\((.+?)\)(?:[…\.]+)?$/i,                          name: 'WebFetch',   descGroup: 1, status: 'running' },
    // TodoRead / TodoWrite
    { re: /^[●•]\s*TodoRead(?:\(.*?\))?(?:[…\.]+)?$/i,                        name: 'TodoRead',   descGroup: 0, status: 'running' },
    { re: /^[●•]\s*TodoWrite(?:\(.*?\))?(?:[…\.]+)?$/i,                       name: 'TodoWrite',  descGroup: 0, status: 'running' },
    // NotebookRead / NotebookEdit
    { re: /^[●•]\s*NotebookRead\((.+?)\)(?:[…\.]+)?$/i,                       name: 'NotebookRead',  descGroup: 1, status: 'running' },
    { re: /^[●•]\s*NotebookEdit\((.+?)\)(?:[…\.]+)?$/i,                       name: 'NotebookEdit',  descGroup: 1, status: 'running' },
    // Agent / Task (subagent)
    { re: /^[●•]\s*(?:Agent|Task)\((.+?)\)(?:[…\.]+)?$/i,                     name: 'Agent',      descGroup: 1, status: 'running' },
    // Skill
    { re: /^[●•]\s*Skill\((.+?)\)(?:[…\.]+)?$/i,                              name: 'Skill',      descGroup: 1, status: 'running' },
    // ExitPlanMode
    { re: /^[●•]\s*ExitPlanMode(?:\(.*?\))?(?:[…\.]+)?$/i,                    name: 'ExitPlanMode', descGroup: 0, status: 'done'  },
    // Sleep
    { re: /^[●•]\s*Sleep\((\d+)\)(?:[…\.]+)?$/i,                              name: 'Sleep',      descGroup: 1, status: 'running' },
    // LSP
    { re: /^[●•]\s*LSP\((.+?)\)(?:[…\.]+)?$/i,                               name: 'LSP',        descGroup: 1, status: 'running' },
    // MCP 工具：● mcp__server__method(args)
    { re: /^[●•]\s*(mcp__(\w+)__(\w+))\((.*)?\)(?:[…\.]+)?$/i,               name: null,         descGroup: 4, nameGroup: 1, status: 'running' },
    // 通用兜底（● SomeTool args）
    { re: /^[●•]\s*([A-Z]\w+)\s+(.+?)(?:[…\.]+)?$/,                          name: null,         descGroup: 2, nameGroup: 1, status: 'running' },
  ];

  // ── 多行状态 ──────────────────────────────────────────────────────────────

  private planBuffer: string[] = [];
  private inPlanMode = false;
  private choiceBuffer: string[] = [];
  private pendingChoiceMsg = '';
  private inChoiceMode = false;

  // ── 公开接口 ──────────────────────────────────────────────────────────────

  classifyLine(line: string): LineEvent {
    const trimmed = line.trim();

    // 空行
    if (!trimmed) return { type: 'noise' };

    // 1. 纯噪声
    if (this.isNoiseLine(trimmed)) return { type: 'noise' };

    // 2. Thinking
    if (this.isThinkingStart(trimmed)) return { type: 'thinking_start' };
    if (this.isThinkingEnd(trimmed)) return { type: 'thinking_end' };

    // 3. 工具结果（⎿ 开头）
    if (/^[⎿└▶]/.test(trimmed)) {
      const content = trimmed.replace(/^[⎿└▶]\s*/, '');
      return { type: 'tool_result', content };
    }

    // 4. 工具调用
    const toolEvent = this.matchToolCall(trimmed);
    if (toolEvent) return toolEvent;

    // 5. AskUserQuestion
    const askEvent = this.matchAskUser(trimmed);
    if (askEvent) return askEvent;

    // 6. 交互 prompt
    const promptEvent = this.matchPrompt(trimmed);
    if (promptEvent) return promptEvent;

    // 7. Plan mode
    const planEvent = this.matchPlanMode(trimmed);
    if (planEvent) return planEvent;

    // 8. Choice mode（多行收集）
    if (this.inChoiceMode) {
      return this.collectChoice(trimmed);
    }

    // 9. Skill loading
    const skillEvent = this.matchSkillLoading(trimmed);
    if (skillEvent) return skillEvent;

    // 10. MCP loading
    const mcpEvent = this.matchMcpLoading(trimmed);
    if (mcpEvent) return mcpEvent;

    // 11. Compacting
    if (/^(?:Auto-)?[Cc]ompacting\s+conversation/i.test(trimmed)) {
      return { type: 'compacting', auto: /auto/i.test(trimmed) };
    }

    // 12. Hook 事件
    const hookEvent = this.matchHook(trimmed);
    if (hookEvent) return hookEvent;

    // 13. Notification
    if (/^Notification:\s*(.+)$/i.test(trimmed)) {
      return { type: 'notification', message: trimmed.replace(/^Notification:\s*/i, '') };
    }

    // 14. API 错误
    const apiErr = this.matchApiError(trimmed);
    if (apiErr) return apiErr;

    // 15. 工具错误
    const toolErr = this.matchToolError(trimmed);
    if (toolErr) return toolErr;

    // 16. /command 回显
    if (/^\/[a-z][\w:]*/.test(trimmed)) {
      return { type: 'command_echo', command: trimmed };
    }

    // 17. Diff 行
    if (/^[+\-]{1}[^+\-]/.test(line) && !/^---\s/.test(line) && !/^\+\+\+\s/.test(line)) {
      return { type: 'diff_line', line };
    }

    // 18. Pasted content（过滤）
    if (/^\[Pasted (?:text|image)[^\]]*\]/.test(trimmed)) return { type: 'noise' };

    // 19. MCP 超限警告
    if (/MCP tool output exceeded/i.test(trimmed)) {
      return { type: 'hook_warning', hookName: 'MCP', message: trimmed };
    }

    // 20. /context 输出（token 统计表格）
    if (/^(system|messages|tools|memory|total)\s+\d+/i.test(trimmed)) {
      return { type: 'noise' }; // bridge 侧会在 context_info 事件里单独处理
    }

    // 21. 耗时行（showTurnDuration）
    if (/^(Cooked|Brewed)\s+for\s+\d+/.test(trimmed)) return { type: 'noise' };
    if (/^\d+s\s*[·•]\s*↓/.test(trimmed)) return { type: 'noise' };
    if (/^↓\s*\d+\s*tokens?/i.test(trimmed)) return { type: 'noise' };

    // 22. 正常内容
    return { type: 'content', text: line };
  }

  /** 兼容旧接口：只返回干净文本 */
  filter(text: string): string {
    const lines = text.split('\n');
    const kept: string[] = [];
    for (const line of lines) {
      const ev = this.classifyLine(line);
      if (ev.type === 'content') kept.push(ev.text);
    }
    return kept.join('\n');
  }

  hasSpinner(text: string): boolean {
    return [...text].some(c => ClaudeUiDetector.SPINNER_CHARS.has(c));
  }

  // ── 私有：噪声检测 ────────────────────────────────────────────────────────

  private isNoiseLine(line: string): boolean {
    // 纯 spinner 字符
    if ([...line].every(c => ClaudeUiDetector.SPINNER_CHARS.has(c) || c === ' ')) return true;
    // 纯框架字符
    if (ClaudeUiDetector.BOX_RE.test(line) &&
      [...line].every(c => ClaudeUiDetector.BOX_RE.test(c) || ClaudeUiDetector.BLOCK_RE.test(c) || c === ' '))
      return true;
    // 分割线
    if (/^[─═\-_=~▪\s]{5,}$/.test(line)) return true;
    // Prompt 符号行
    if (/^[❯>]\s*$/.test(line)) return true;
    // esc/ctrl 提示
    if (/esc\s*to\s*interrupt/i.test(line)) return true;
    if (/\?\s*for\s*shortcuts/i.test(line)) return true;
    if (/ctrl\+[a-z]\s+to/i.test(line)) return true;
    // Hook 通过行
    if (/^✔\s*(Allowed|Pre|Post|hook\s+passed)/i.test(line)) return true;
    if (/^Running\s+hook:/i.test(line)) return true;
    if (/^running\s+stop\s+hook/i.test(line)) return true;
    if (/^Stop\s+hook\s+running/i.test(line)) return true;
    // session 边界
    if (/^(Session|Human|Assistant):\s*$/i.test(line)) return true;
    return false;
  }

  private isThinkingStart(line: string): boolean {
    if (/\(thinking\)/i.test(line)) return true;
    if (/^(Puzzling|Brewing|Thinking|Working|Analyzing|Pondering)\b/i.test(line)) return true;
    return false;
  }

  private isThinkingEnd(line: string): boolean {
    if (/\(thought\s+for\s+\d+s?\)/i.test(line)) return true;
    if (/^Brewed\s+for\s+\d+s/i.test(line)) return true;
    if (/^Cooked\s+for\s+\d+/i.test(line)) return true;
    return false;
  }

  // ── 私有：工具调用 ────────────────────────────────────────────────────────

  private matchToolCall(line: string): LineEvent | null {
    for (const p of ClaudeUiDetector.TOOL_PATTERNS) {
      const m = line.match(p.re);
      if (!m) continue;

      let toolName = p.name ?? (m[p.nameGroup!] ?? 'Tool');
      let toolDesc = (m[p.descGroup] ?? '').trim().replace(/[…\.]+$/, '');

      // MCP 工具：解析 mcp__server__method → "server: method"
      if (!p.name && /^mcp__/.test(toolName)) {
        const parts = toolName.split('__');
        toolName = parts[1] ?? toolName;
        toolDesc = `${parts[2] ?? ''}${toolDesc ? ` ${toolDesc}` : ''}`.trim();
      }

      // WebFetch：只显示域名
      if (toolName === 'WebFetch') {
        try { toolDesc = new URL(toolDesc).hostname; } catch { /**/ }
      }

      return { type: 'tool_call', toolName, toolDesc, status: p.status };
    }
    return null;
  }

  // ── 私有：AskUserQuestion ─────────────────────────────────────────────────

  private matchAskUser(line: string): LineEvent | null {
    // ● AskUserQuestion("xxx")
    const m = line.match(/^[●•]\s*AskUserQuestion\("?(.+?)"?\)(?:[…\.]+)?$/i);
    if (m) return { type: 'ask_user', question: m[1].trim() };
    return null;
  }

  // ── 私有：交互 Prompt ─────────────────────────────────────────────────────

  private matchPrompt(line: string): LineEvent | null {
    // y/n 确认
    if (/[?？]\s*\(y\/?n\)\s*[›>]?\s*$/i.test(line)) {
      return { type: 'prompt_confirm', message: line.replace(/[?？]\s*\(y\/?n\)\s*[›>]?\s*$/i, '').trim() };
    }
    // Allow/Deny 权限
    if (/Allow\s+once|Always\s+allow|Deny/i.test(line)) {
      const toolMatch = line.match(/wants?\s+to\s+(\w+)\s+(.+?)(?:\s*—|\s*\.|$)/i);
      return {
        type: 'prompt_permission',
        tool: toolMatch?.[1] ?? 'unknown',
        target: toolMatch?.[2] ?? line,
      };
    }
    // › 多选开始
    if (/^\s*›\s*$/.test(line) && this.choiceBuffer.length > 0) {
      const result: LineEvent = {
        type: 'prompt_choice',
        message: this.pendingChoiceMsg,
        options: [...this.choiceBuffer],
      };
      this.choiceBuffer = [];
      this.pendingChoiceMsg = '';
      this.inChoiceMode = false;
      return result;
    }
    return null;
  }

  private collectChoice(line: string): LineEvent {
    if (/^\s*\d+[\.\)]\s+/.test(line)) {
      this.choiceBuffer.push(line.replace(/^\s*\d+[\.\)]\s+/, '').trim());
    } else if (/[?？]\s*[›>]?\s*$/.test(line)) {
      // 这是问题行，切换到 choice 收集模式
      this.pendingChoiceMsg = line.replace(/[›>]?\s*$/, '').trim();
      this.inChoiceMode = true;
    } else {
      // 不是选项行，结束收集
      this.inChoiceMode = false;
      this.choiceBuffer = [];
      return { type: 'content', text: line };
    }
    return { type: 'noise' };
  }

  // ── 私有：Plan mode ───────────────────────────────────────────────────────

  private matchPlanMode(line: string): LineEvent | null {
    // 进入 plan 收集
    if (/^I(?:'ll| will)\s+(make|create|perform|implement)/i.test(line)) {
      this.inPlanMode = true;
      this.planBuffer = [];
      return { type: 'noise' };
    }
    if (this.inPlanMode) {
      if (/^\s*\d+[\.\)]\s+/.test(line)) {
        this.planBuffer.push(line.replace(/^\s*\d+[\.\)]\s+/, '').trim());
        return { type: 'noise' };
      }
      if (/Proceed\?|Continue\?|Shall I/i.test(line)) {
        const steps = [...this.planBuffer];
        this.inPlanMode = false;
        this.planBuffer = [];
        return { type: 'prompt_plan', steps };
      }
    }
    return null;
  }

  // ── 私有：Skill / MCP loading ─────────────────────────────────────────────

  private matchSkillLoading(line: string): LineEvent | null {
    let m = line.match(/^Loading\s+skill[:\s]+(.+?)(?:[…\.]+)?$/i);
    if (m) return { type: 'skill_loading', skillName: m[1].trim() };
    m = line.match(/^Loaded\s+(\d+)\s+(?:\/\s*(\d+)\s+)?skills?/i);
    if (m) return { type: 'skill_loading', skillName: '', loaded: parseInt(m[1]), total: m[2] ? parseInt(m[2]) : undefined };
    return null;
  }

  private matchMcpLoading(line: string): LineEvent | null {
    let m = line.match(/^Loading\s+MCP\s+server[:\s]+(.+?)(?:[…\.]+)?$/i);
    if (m) return { type: 'mcp_loading', serverName: m[1].trim(), done: false };
    m = line.match(/^(?:Connected to|Loaded)\s+MCP\s+(?:server\s+)?(.+?)(?:[…\.]+)?$/i);
    if (m) return { type: 'mcp_loading', serverName: m[1].trim(), done: true };
    return null;
  }

  // ── 私有：Hook ────────────────────────────────────────────────────────────

  private matchHook(line: string): LineEvent | null {
    let m = line.match(/^[✘✗]\s*Hook\s+blocked[:\s]+(.+?)(?:\s*[—-]\s*(.+))?$/i);
    if (m) return { type: 'hook_blocked', hookName: m[1].trim(), reason: m[2]?.trim() ?? '' };
    m = line.match(/^[⚠⚡]\s*Hook\s+warning[:\s]+(.+?)(?:\s*[—-]\s*(.+))?$/i);
    if (m) return { type: 'hook_warning', hookName: m[1].trim(), message: m[2]?.trim() ?? line };
    return null;
  }

  // ── 私有：错误 ────────────────────────────────────────────────────────────

  private matchApiError(line: string): LineEvent | null {
    if (/rate\s*limit/i.test(line) && /API\s+[Ee]rror|429/i.test(line)) {
      return { type: 'error_api', errorType: 'rate_limit', message: line };
    }
    if (/context\s+window\s+exceeded/i.test(line)) {
      return { type: 'error_api', errorType: 'context_full', message: line };
    }
    if (/^API\s+[Ee]rror[:\s]/i.test(line)) {
      return { type: 'error_api', errorType: 'other', message: line };
    }
    return null;
  }

  private matchToolError(line: string): LineEvent | null {
    // Error: xxx（不是 API Error）
    const m = line.match(/^(?:Error|Failed)[:\s]+(.+)$/i);
    if (m && !/API\s+Error/i.test(line)) {
      return { type: 'error_tool', toolName: 'unknown', message: m[1].trim() };
    }
    return null;
  }
}