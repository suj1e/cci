/**
 * PTY 输出过滤器（升级版）
 * 通过回调上报语义事件，干净文本内容单独回调。
 */

import { FilterConfig, FilterResult, DEFAULT_CONFIG } from './types';
import { VirtualTerminal } from './VirtualTerminal';
import { InputTracker } from './InputTracker';
import { AnsiParser } from './AnsiParser';
import { ClaudeUiDetector, LineEvent } from './ClaudeUiDetector';

export interface SemanticEvent {
  type: Exclude<LineEvent['type'], 'content' | 'noise' | 'diff_line'>;
  // tool_call
  toolName?: string;
  toolDesc?: string;
  toolStatus?: 'running' | 'done';
  // tool_result
  resultContent?: string;
  truncated?: boolean;
  // ask_user
  question?: string;
  // prompt_confirm
  message?: string;
  // prompt_permission
  tool?: string;
  target?: string;
  // prompt_choice / prompt_plan
  options?: string[];
  steps?: string[];
  // skill_loading
  skillName?: string;
  loaded?: number;
  total?: number;
  // mcp_loading
  serverName?: string;
  done?: boolean;
  // compacting
  auto?: boolean;
  // subagent
  agentType?: string;
  desc?: string;
  // hook
  hookName?: string;
  reason?: string;
  hookMessage?: string;
  // notification
  notificationMessage?: string;
  // error_api
  errorType?: 'rate_limit' | 'context_full' | 'other';
  errorMessage?: string;
  // error_tool
  errorToolName?: string;
  // command_echo
  command?: string;
}

export interface PtyOutputFilterOptions {
  config?: Partial<FilterConfig>;
  onSemanticEvent?: (event: SemanticEvent) => void;
  onContent?: (text: string) => void;
  onDiff?: (lines: string[]) => void;
}

export class PtyOutputFilter {
  private config: FilterConfig;
  private terminal: VirtualTerminal;
  private inputTracker: InputTracker;
  private ansiParser: AnsiParser;
  private detector: ClaudeUiDetector;

  private buffer = '';
  private lastSentLineCount = 0;

  // 语义状态
  private inThinking = false;
  private hasEmittedTextStart = false;

  // diff 收集
  private diffBuffer: string[] = [];
  private inDiff = false;

  // tool_result 收集（关联到最近工具）
  private pendingResultLines: string[] = [];
  private resultFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RESULT_COLLECT_MS = 200;

  private onSemanticEvent?: (event: SemanticEvent) => void;
  private onContent?: (text: string) => void;
  private onDiff?: (lines: string[]) => void;

  constructor(options: PtyOutputFilterOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...(options.config ?? {}) };
    this.terminal = new VirtualTerminal(this.config);
    this.inputTracker = new InputTracker(this.config);
    this.ansiParser = new AnsiParser(this.terminal);
    this.detector = new ClaudeUiDetector();
    this.onSemanticEvent = options.onSemanticEvent;
    this.onContent = options.onContent;
    this.onDiff = options.onDiff;
  }

  recordInput(data: string): void {
    if (this.config.enableEchoFilter) this.inputTracker.recordInput(data);
  }

  filter(data: string): FilterResult {
    this.buffer += data;

    if (this.config.enableEchoFilter && this.inputTracker.isEcho(this.buffer)) {
      this.buffer = '';
      return { text: '', hasContent: false };
    }

    const cleanText = this.ansiParser.parse(this.buffer);
    this.terminal.write(cleanText);
    const terminalContent = this.terminal.getContent();
    const lines = terminalContent.split('\n');
    const newLines = lines.slice(this.lastSentLineCount);
    this.lastSentLineCount = lines.length;
    this.buffer = '';

    if (newLines.length === 0) return { text: '', hasContent: false };

    const contentLines: string[] = [];
    for (const line of newLines) {
      const event = this.detector.classifyLine(line);
      this.handleLineEvent(event, contentLines);
    }

    // 刷新 diff 缓冲
    if (this.inDiff && contentLines.length > 0) {
      this.flushDiff();
    }

    const result = this.cleanup(contentLines.join('\n'));
    const hasContent = result.trim().length > 0;
    if (hasContent) this.onContent?.(result);

    return { text: result, hasContent };
  }

  private handleLineEvent(event: LineEvent, contentLines: string[]): void {
    switch (event.type) {

      case 'thinking_start':
        if (!this.inThinking) {
          this.inThinking = true;
          this.hasEmittedTextStart = false;
          this.emit({ type: 'thinking_start' });
        }
        break;

      case 'thinking_end':
        if (this.inThinking) {
          this.inThinking = false;
          this.emit({ type: 'thinking_end' });
        }
        break;

      case 'tool_call':
        if (this.inThinking) { this.inThinking = false; this.emit({ type: 'thinking_end' }); }
        this.flushPendingResult();
        this.emit({ type: 'tool_call', toolName: event.toolName, toolDesc: event.toolDesc, toolStatus: event.status });
        break;

      case 'tool_result':
        // 收集结果行，防抖后一起发
        this.pendingResultLines.push(event.content);
        if (this.resultFlushTimer) clearTimeout(this.resultFlushTimer);
        this.resultFlushTimer = setTimeout(() => this.flushPendingResult(), this.RESULT_COLLECT_MS);
        break;

      case 'ask_user':
        this.emit({ type: 'ask_user', question: event.question });
        break;

      case 'prompt_confirm':
        this.emit({ type: 'prompt_confirm', message: event.message });
        break;

      case 'prompt_permission':
        this.emit({ type: 'prompt_permission', tool: event.tool, target: event.target });
        break;

      case 'prompt_choice':
        this.emit({ type: 'prompt_choice', message: event.message, options: event.options });
        break;

      case 'prompt_plan':
        this.emit({ type: 'prompt_plan', steps: event.steps });
        break;

      case 'skill_loading':
        this.emit({ type: 'skill_loading', skillName: event.skillName, loaded: event.loaded, total: event.total });
        break;

      case 'mcp_loading':
        this.emit({ type: 'mcp_loading', serverName: event.serverName, done: event.done });
        break;

      case 'compacting':
        this.emit({ type: 'compacting', auto: event.auto });
        break;

      case 'hook_blocked':
        this.emit({ type: 'hook_blocked', hookName: event.hookName, reason: event.reason });
        break;

      case 'hook_warning':
        this.emit({ type: 'hook_warning', hookName: event.hookName, hookMessage: event.message });
        break;

      case 'notification':
        this.emit({ type: 'notification', notificationMessage: event.message });
        break;

      case 'error_api':
        this.emit({ type: 'error_api', errorType: event.errorType, errorMessage: event.message });
        break;

      case 'error_tool':
        this.emit({ type: 'error_tool', errorToolName: event.toolName, errorMessage: event.message });
        break;

      case 'command_echo':
        this.emit({ type: 'command_echo', command: event.command });
        break;

      case 'diff_line':
        this.inDiff = true;
        this.diffBuffer.push(event.line);
        break;

      case 'content':
        if (this.inDiff) this.flushDiff();
        if (!this.hasEmittedTextStart && event.text.trim()) {
          this.hasEmittedTextStart = true;
          if (this.inThinking) { this.inThinking = false; this.emit({ type: 'thinking_end' }); }
          this.emit({ type: 'text_start' });
        }
        contentLines.push(event.text);
        break;

      case 'noise':
        break;
    }
  }

  private emit(event: SemanticEvent): void {
    this.onSemanticEvent?.(event);
  }

  private flushPendingResult(): void {
    if (this.resultFlushTimer) { clearTimeout(this.resultFlushTimer); this.resultFlushTimer = null; }
    if (this.pendingResultLines.length === 0) return;
    const content = this.pendingResultLines.join('\n');
    const truncated = content.length > 500;
    this.emit({
      type: 'tool_result',
      resultContent: truncated ? content.slice(0, 500) + '\n…（内容过长已截断）' : content,
      truncated,
    });
    this.pendingResultLines = [];
  }

  private flushDiff(): void {
    if (this.diffBuffer.length > 0) {
      this.onDiff?.(this.diffBuffer);
      this.diffBuffer = [];
    }
    this.inDiff = false;
  }

  reset(): void {
    this.buffer = '';
    this.lastSentLineCount = 0;
    this.inThinking = false;
    this.hasEmittedTextStart = false;
    this.diffBuffer = [];
    this.inDiff = false;
    this.pendingResultLines = [];
    if (this.resultFlushTimer) clearTimeout(this.resultFlushTimer);
    this.terminal.reset();
    this.inputTracker.reset();
  }

  private cleanup(text: string): string {
    return text
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/\x00/g, '').replace(/\x07/g, '')
      .replace(/[\x01-\x06\x08-\x1F\x7F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n').map(l => l.trimEnd()).join('\n')
      .replace(/^\n+/, '').replace(/\n+$/, '');
  }

  getTerminalContent(): string { return this.terminal.getContent(); }
}