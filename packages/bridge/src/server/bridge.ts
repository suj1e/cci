import { LocalServer } from './localServer';
import { FeishuClient, FeishuActionPayload } from './feishuClient';
import { MessageConverter } from '../protocol/messageConverter';
import { OutputFormatter, ToolRecord, FeishuCardV2 } from '../utils/outputFormatter';
import type {
  BridgeConfig, BridgeMessage,
  ToolCallMessage, ToolResultMessage,
  SkillLoadingMessage, McpLoadingMessage,
  SubagentStartMessage,
  HookBlockedMessage, HookWarningMessage,
  ApiErrorMessage, ToolErrorMessage,
  DiffContentMessage
} from '../types';
import { Logger } from '../logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * 响应状态机
 * idle → thinking → tool_calling → [prompt?] → streaming → idle
 *
 * 整个响应过程维护一张"过程卡片"（patch 更新），流结束后发独立的最终卡片。
 */
type ResponsePhase = 'idle' | 'thinking' | 'tool_calling' | 'prompt' | 'streaming';

// 按钮回调映射：action -> 发给 PTY 的字符
const ACTION_MAP: Record<string, Record<string, string>> = {
  confirm:    { y: 'y\r', n: 'n\r' },
  permission: { '1': '1\r', '2': '2\r', '3': '3\r' },
  choice:     { '1': '1\r', '2': '2\r', '3': '3\r', '4': '4\r', '5': '5\r' },
  plan:       { y: 'y\r', n: 'n\r' },
};

// 按钮回调的标签（用于更新卡片显示）
const ACTION_LABEL: Record<string, Record<string, string>> = {
  confirm:    { y: '✅ 确认', n: '❌ 取消' },
  permission: { '1': '允许一次', '2': '总是允许', '3': '拒绝' },
  plan:       { y: '✅ 执行', n: '❌ 取消' },
};


const TOOL_EMOJI: Record<string, string> = {
  Bash: '⚡', Grep: '🔍', Glob: '🔎', LS: '📂', Read: '📖',
  Edit: '✏️', MultiEdit: '✏️', Write: '📝', WebSearch: '🌐',
  WebFetch: '🔗', TodoRead: '📋', TodoWrite: '📋', NotebookRead: '📓',
  NotebookEdit: '📓', Agent: '🤖', Task: '🔀', Skill: '📚',
  ExitPlanMode: '🏁', Sleep: '💤', LSP: '🔬', default: '🔧',
};

export class FeishuBridge {
  private config: BridgeConfig;
  private localServer: LocalServer;
  private feishuClient: FeishuClient;
  private logger = Logger.getInstance();
  private version: string;

  private currentUserId: string | null = null;
  private knownUserIds: Set<string> = new Set();

  // ── 响应状态机 ────────────────────────────────────────────────────────────
  private phase: ResponsePhase = 'idle';
  private statusCardId: string | null = null;
  private toolCalls: ToolRecord[] = [];
  private lastToolResult: string | null = null;
  private streamAccum = '';
  private inCodeBlock = false;

  // Patch 节流
  private patchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPatch = false;
  private readonly PATCH_THROTTLE = 500;

  // 流式防抖
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly FLUSH_TIMEOUT = 600;

  // 超时检测
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly IDLE_TIMEOUT = 30000;

  constructor(options: { config: BridgeConfig }) {
    this.config = options.config;
    this.version = this.loadVersion();

    this.localServer = new LocalServer({
      port: this.config.port || 8989,
      onMessageFromCli: this.handleCliMessage.bind(this),
      onCliConnect: this.handleCliConnect.bind(this),
      onCliDisconnect: this.handleCliDisconnect.bind(this),
    });

    this.feishuClient = new FeishuClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      onMessageFromFeishu: this.handleFeishuMessage.bind(this),
      onActionCallback: this.handleActionCallback.bind(this),
      onConnected: this.handleFeishuConnected.bind(this),
      onDisconnected: this.handleFeishuDisconnected.bind(this),
    });
  }

  async start(): Promise<void> {
    this.logger.info(`Feishu Bridge v${this.version}`);
    await this.localServer.start();
    try { await this.feishuClient.connect(); } catch (e) { this.logger.error('Feishu connect failed:', e); }
    this.logger.info('Feishu Bridge running');
  }

  async stop(): Promise<void> {
    await this.localServer.stop();
    this.feishuClient.disconnect();
  }

  // ── CLI 消息路由 ──────────────────────────────────────────────────────────

  private handleCliMessage(message: BridgeMessage): void {
    this.resetIdleTimeout();
    this.logger.debug('CLI msg:', message.type);

    switch (message.type) {
      case 'thinking_start':   this.onThinkingStart(); break;
      case 'thinking_end':     this.onThinkingEnd(); break;
      case 'tool_call':        this.onToolCall(message); break;
      case 'tool_result':      this.onToolResult(message); break;
      case 'text_start':       this.onTextStart(); break;
      case 'stream_chunk':     this.onStreamChunk(message.content); break;
      case 'stream_end':       this.onStreamEnd(); break;
      case 'cli_response':     this.onCliResponse(message.content); break;
      case 'ask_user':         this.onAskUser(message.question); break;
      case 'prompt_confirm':   this.onPromptConfirm(message.message); break;
      case 'prompt_permission':this.onPromptPermission(message.tool, message.target); break;
      case 'prompt_choice':    this.onPromptChoice(message.message, message.options); break;
      case 'prompt_plan':      this.onPromptPlan(message.steps); break;
      case 'skill_loading':    this.onSkillLoading(message); break;
      case 'mcp_loading':      this.onMcpLoading(message); break;
      case 'compacting':       this.onCompacting(message.auto); break;
      case 'subagent_start':   this.onSubagentStart(message); break;
      case 'hook_blocked':     this.onHookBlocked(message); break;
      case 'hook_warning':     this.onHookWarning(message); break;
      case 'notification':     this.onNotification(message.message); break;
      case 'error_api':        this.onApiError(message); break;
      case 'error_tool':       this.onToolError(message); break;
      case 'command_echo':     this.onCommandEcho(message.command); break;
      case 'diff_content':     this.onDiffContent(message); break;
      case 'ping':             /* pong 由 localServer 处理 */ break;
    }
  }

  // ── 飞书消息处理 ──────────────────────────────────────────────────────────

  private handleFeishuMessage(data: any): void {
    const msg = this.parseFeishuMessage(data);
    if (!msg) return;
    this.currentUserId = msg.userId;
    this.knownUserIds.add(msg.userId);

    if (!this.localServer.hasCliConnection()) {
      this.feishuClient.sendText(msg.userId, 'Claude CLI 未连接，请运行 fclaude 连接后再试。').catch(() => {});
      return;
    }

    // 图片消息：下载后以 base64 传给 PTY（告知 Claude）
    if (msg.imageKey) {
      this.handleImageMessage(msg.userId, msg.imageKey);
      return;
    }

    // 文件消息：下载到本地，告知路径
    if (msg.fileKey) {
      this.handleFileMessage(msg.userId, msg.fileKey, msg.fileName);
      return;
    }

    this.forwardToCli(msg.content, msg.userId);
  }

  private forwardToCli(content: string, userId: string): void {
    this.localServer.sendToCli({
      id: MessageConverter.generateId(),
      type: 'user_message',
      content,
      userId,
      timestamp: Date.now(),
    } as any);
  }

  private async handleImageMessage(userId: string, imageKey: string): Promise<void> {
    const buffer = await this.feishuClient.downloadImage(imageKey).catch(() => null);
    if (!buffer) {
      this.feishuClient.sendText(userId, '⚠️ 图片下载失败，请重试。').catch(() => {});
      return;
    }
    const b64 = buffer.toString('base64');
    const prompt = `[用户发送了一张图片，base64如下，请分析]\ndata:image/jpeg;base64,${b64}`;
    this.forwardToCli(prompt, userId);
  }

  private async handleFileMessage(userId: string, fileKey: string, fileName?: string): Promise<void> {
    const result = await this.feishuClient.downloadFile(fileKey).catch(() => null);
    if (!result) {
      this.feishuClient.sendText(userId, '⚠️ 文件下载失败，请重试。').catch(() => {});
      return;
    }
    const saveName = fileName || result.name;
    const savePath = path.join(os.tmpdir(), `feishu-${Date.now()}-${saveName}`);
    fs.writeFileSync(savePath, result.buffer);
    this.forwardToCli(`[用户上传了文件，已保存到 ${savePath}，请处理该文件]`, userId);
    this.feishuClient.sendText(userId, `📎 文件已接收，路径：\`${savePath}\``).catch(() => {});
  }

  // ── 按钮回调处理 ──────────────────────────────────────────────────────────

  private async handleActionCallback(payload: FeishuActionPayload): Promise<void> {
    this.logger.info(`Action callback: action=${payload.action} value=${payload.value}`);
    const { action, value, messageId, userId } = payload;

    // 发字符给 PTY
    const charToSend = ACTION_MAP[action]?.[value];
    if (charToSend) {
      this.localServer.sendToCli({
        id: MessageConverter.generateId(),
        type: 'user_message',
        content: charToSend.replace('\r', ''),
        userId,
        timestamp: Date.now(),
      } as any);
    }

    // 更新按钮卡片为"已选择"状态
    const label = ACTION_LABEL[action]?.[value] ?? value;
    const titleMap: Record<string, string> = {
      confirm: '🤖 Claude ⚠️',
      permission: '🤖 Claude 🔐',
      plan: '🤖 Claude 📋',
    };
    const updatedCard = OutputFormatter.buildButtonDoneCard(titleMap[action] ?? '🤖 Claude', label);
    await this.feishuClient.updateCardButtons(messageId, updatedCard).catch(() => {});
  }

  // ── 状态机：thinking ──────────────────────────────────────────────────────

  private async onThinkingStart(): Promise<void> {
    if (this.phase !== 'idle') return;
    this.phase = 'thinking';
    this.toolCalls = [];
    this.streamAccum = '';
    this.inCodeBlock = false;
    this.lastToolResult = null;
    if (!this.currentUserId) return;
    try {
      this.statusCardId = await this.feishuClient.sendCardMessage(
        this.currentUserId,
        OutputFormatter.buildThinkingCard(),
      );
    } catch (e) { this.logger.error('Failed to send thinking card:', e); }
  }

  private onThinkingEnd(): void {
    if (this.phase !== 'thinking') return;
    this.phase = 'tool_calling';
    this.schedulePatch();
  }

  // ── 状态机：tool_call / tool_result ──────────────────────────────────────

  private onToolCall(msg: ToolCallMessage): void {
    if (this.phase === 'idle' || this.phase === 'thinking') {
      if (this.phase === 'idle') this.initStatusCard();
      this.phase = 'tool_calling';
    }

    const name = msg.toolName ?? 'Tool';
    const desc = msg.toolDesc ?? '';
    const status = msg.toolStatus ?? 'running';
    const emoji = TOOL_EMOJI[name] ?? TOOL_EMOJI.default;

    // 更新已有记录 or 新增
    const existing = this.toolCalls.find(t => t.name === name && t.desc === desc);
    if (existing) {
      existing.status = status;
      if (this.lastToolResult && status === 'done') {
        existing.result = this.lastToolResult;
        this.lastToolResult = null;
      }
    } else {
      this.toolCalls.push({ name, desc, status, emoji });
    }
    this.schedulePatch();
  }

  private onToolResult(msg: ToolResultMessage): void {
    // 把结果挂到最近一个 running 工具上
    const content = msg.content ?? '';
    const lastTool = [...this.toolCalls].reverse().find(t => t.status === 'running');
    if (lastTool) {
      lastTool.result = content;
    } else {
      this.lastToolResult = content;
    }
    this.schedulePatch();
  }

  // ── 状态机：prompt ────────────────────────────────────────────────────────

  private async onAskUser(question?: string): Promise<void> {
    this.phase = 'prompt';
    if (!this.currentUserId || !question) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildAskUserCard(question),
    ).catch(e => this.logger.error('Failed to send ask_user card:', e));
  }

  private async onPromptConfirm(message?: string): Promise<void> {
    this.phase = 'prompt';
    if (!this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildPromptConfirmCard(message ?? '确认继续？'),
    ).catch(e => this.logger.error('Failed to send confirm card:', e));
  }

  private async onPromptPermission(tool?: string, target?: string): Promise<void> {
    this.phase = 'prompt';
    if (!this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildPromptPermissionCard(tool ?? 'unknown', target ?? 'unknown'),
    ).catch(e => this.logger.error('Failed to send permission card:', e));
  }

  private async onPromptChoice(message?: string, options?: string[]): Promise<void> {
    this.phase = 'prompt';
    if (!this.currentUserId || !options?.length) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildPromptChoiceCard(message ?? '', options),
    ).catch(e => this.logger.error('Failed to send choice card:', e));
  }

  private async onPromptPlan(steps?: string[]): Promise<void> {
    this.phase = 'prompt';
    if (!this.currentUserId || !steps?.length) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildPromptPlanCard(steps),
    ).catch(e => this.logger.error('Failed to send plan card:', e));
  }

  // ── 状态机：streaming ─────────────────────────────────────────────────────

  private onTextStart(): void {
    if (this.phase === 'streaming') return;
    this.phase = 'streaming';
    this.toolCalls = this.toolCalls.map(t => ({ ...t, status: 'done' as const }));
    this.schedulePatch();
  }

  private onStreamChunk(content?: string): void {
    if (!content || !OutputFormatter.hasContent(content)) return;
    if (this.phase !== 'streaming') this.onTextStart();
    const clean = OutputFormatter.formatForFeishu(content);
    if (!clean) return;
    const ticks = (clean.match(/```/g) ?? []).length;
    if (ticks % 2 !== 0) this.inCodeBlock = !this.inCodeBlock;
    this.streamAccum += clean;
    this.scheduleFlush();
  }

  private async onStreamEnd(): Promise<void> {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    if (this.patchTimer) { clearTimeout(this.patchTimer); this.patchTimer = null; }
    if (this.timeoutTimer) { clearTimeout(this.timeoutTimer); this.timeoutTimer = null; }

    const userId = this.currentUserId;
    const finalContent = this.streamAccum.trim();

    // 重置
    this.phase = 'idle';
    this.streamAccum = '';
    this.statusCardId = null;
    this.toolCalls = [];
    this.inCodeBlock = false;
    this.pendingPatch = false;
    this.lastToolResult = null;

    if (!userId || !finalContent) return;

    this.logger.info('[STREAM] Sending final message');
    if (OutputFormatter.shouldUseCard(finalContent)) {
      for (const card of OutputFormatter.toFeishuCards(finalContent)) {
        await this.feishuClient.sendCardMessage(userId, card).catch(e => this.logger.error('Final card failed:', e));
      }
    } else {
      await this.feishuClient.sendRichMessage(userId, OutputFormatter.toFeishuPost(finalContent))
        .catch(e => this.logger.error('Final post failed:', e));
    }
  }

  private onCliResponse(content?: string): void {
    if (!content || !this.currentUserId) return;
    const clean = OutputFormatter.formatForFeishu(content);
    if (!clean.trim()) return;
    const userId = this.currentUserId;
    if (OutputFormatter.shouldUseCard(clean)) {
      OutputFormatter.toFeishuCards(clean).forEach(card =>
        this.feishuClient.sendCardMessage(userId, card).catch(() => {})
      );
    } else {
      this.feishuClient.sendRichMessage(userId, OutputFormatter.toFeishuPost(clean)).catch(() => {});
    }
  }

  // ── 状态事件 ─────────────────────────────────────────────────────────────

  private onSkillLoading(msg: SkillLoadingMessage): void {
    if (!this.currentUserId) return;
    // skill loading 显示在状态卡片里（追加一行），不单独发卡片
    const line = msg.loaded !== undefined
      ? `📚 已加载 ${msg.loaded}${msg.total ? `/${msg.total}` : ''} 个 skills`
      : `📚 加载 skill: \`${msg.skillName}\``;
    this.toolCalls.push({ name: 'Skill', desc: line, status: 'running', emoji: '📚' });
    this.schedulePatch();
  }

  private onMcpLoading(msg: McpLoadingMessage): void {
    const desc = msg.done ? `✓ MCP: ${msg.serverName}` : `MCP: ${msg.serverName}`;
    const existing = this.toolCalls.find(t => t.name === 'MCP' && t.desc.includes(msg.serverName ?? ''));
    if (existing) {
      existing.desc = desc;
      existing.status = msg.done ? 'done' : 'running';
    } else {
      this.toolCalls.push({ name: 'MCP', desc, status: msg.done ? 'done' : 'running', emoji: '🔌' });
    }
    this.schedulePatch();
  }

  private async onCompacting(auto?: boolean): Promise<void> {
    if (!this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildCompactingCard(auto ?? false),
    ).catch(() => {});
  }

  private onSubagentStart(msg: SubagentStartMessage): void {
    this.toolCalls.push({ name: 'Agent', desc: `${msg.agentType ?? 'subagent'}: ${msg.desc ?? ''}`, status: 'running', emoji: '🤖' });
    this.schedulePatch();
  }

  private async onHookBlocked(msg: HookBlockedMessage): Promise<void> {
    if (!this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildHookBlockedCard(msg.hookName ?? 'hook', msg.reason ?? ''),
    ).catch(() => {});
  }

  private async onHookWarning(msg: HookWarningMessage): Promise<void> {
    if (!this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildHookBlockedCard(`⚠️ ${msg.hookName ?? 'hook'} warning`, msg.message ?? ''),
    ).catch(() => {});
  }

  private async onNotification(message?: string): Promise<void> {
    if (!message || !this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildNotificationCard(message),
    ).catch(() => {});
  }

  private async onApiError(msg: ApiErrorMessage): Promise<void> {
    if (!this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildApiErrorCard(msg.errorType ?? 'other', msg.message ?? ''),
    ).catch(() => {});
  }

  private async onToolError(msg: ToolErrorMessage): Promise<void> {
    if (!this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildErrorCard(msg.toolName ?? 'Tool', msg.message ?? ''),
    ).catch(() => {});
  }

  private async onCommandEcho(command?: string): Promise<void> {
    if (!command || !this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildCommandEchoCard(command),
    ).catch(() => {});
  }

  private async onDiffContent(msg: DiffContentMessage): Promise<void> {
    if (!msg.content || !this.currentUserId) return;
    await this.feishuClient.sendCardMessage(
      this.currentUserId,
      OutputFormatter.buildDiffCard(msg.content, msg.fileName),
    ).catch(() => {});
  }

  // ── 卡片构建（过程卡片）──────────────────────────────────────────────────

  private buildStatusCard(): FeishuCardV2 {
    switch (this.phase) {
      case 'thinking':
        return OutputFormatter.buildThinkingCard();

      case 'tool_calling':
        return OutputFormatter.buildToolCard(this.toolCalls);

      case 'streaming': {
        const summary = this.toolCalls.length > 0
          ? this.toolCalls.map(t => t.emoji).join(' · ')
          : '';
        const content = OutputFormatter.formatForFeishu(this.streamAccum) || '⚡ **正在回复…**';
        return OutputFormatter.buildToolCard(
          this.toolCalls,
          this.toolCalls.length > 0 ? { summary, content } : undefined,
        );
      }

      default:
        return OutputFormatter.buildThinkingCard();
    }
  }

  // ── Patch 节流 ────────────────────────────────────────────────────────────

  private schedulePatch(): void {
    this.pendingPatch = true;
    if (this.patchTimer) return;
    this.patchTimer = setTimeout(() => {
      this.patchTimer = null;
      if (this.pendingPatch) { this.pendingPatch = false; this.doPatch(); }
    }, this.PATCH_THROTTLE);
  }

  private async doPatch(): Promise<void> {
    if (!this.statusCardId || !this.currentUserId) return;
    try {
      await this.feishuClient.patchCardMessage(this.statusCardId, this.buildStatusCard());
    } catch (e) { this.logger.error('[PATCH] Failed:', e); }
  }

  // ── 流式防抖 ──────────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (!this.inCodeBlock) this.schedulePatch();
    }, this.FLUSH_TIMEOUT);
  }

  // ── 超时检测 ──────────────────────────────────────────────────────────────

  private resetIdleTimeout(): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    if (this.phase === 'idle') return;
    this.timeoutTimer = setTimeout(() => {
      if (this.phase !== 'idle' && this.currentUserId) {
        this.feishuClient.sendText(
          this.currentUserId,
          '⏱️ Claude 似乎还在处理中，可以等待或在本地终端查看状态。',
        ).catch(() => {});
      }
    }, this.IDLE_TIMEOUT);
  }

  // ── 初始化状态卡片（无 thinking 直接来工具调用时）───────────────────────

  private initStatusCard(): void {
    if (!this.currentUserId) return;
    this.toolCalls = [];
    this.streamAccum = '';
    this.feishuClient.sendCardMessage(this.currentUserId, OutputFormatter.buildThinkingCard())
      .then(id => { this.statusCardId = id; })
      .catch(e => this.logger.error('Failed to init status card:', e));
  }

  // ── 通知广播 ──────────────────────────────────────────────────────────────

  private notify(text: string): void {
    const users = new Set<string>([
      ...(this.config.notifyUserIds ?? []),
      ...this.knownUserIds,
      ...(this.currentUserId ? [this.currentUserId] : []),
    ]);
    users.forEach(uid => this.feishuClient.sendText(uid, text).catch(() => {}));
  }

  private handleCliConnect(): void {
    this.logger.info('CLI connected');
    if (this.config.notifyOnConnection !== false)
      this.notify('✅ 已连接到 Claude CLI！\n现在发送的消息会自动转发给 Claude。');
  }

  private handleCliDisconnect(): void {
    this.logger.info('CLI disconnected');
    if (this.config.notifyOnDisconnection !== false)
      this.notify('❌ 已断开与 Claude CLI 的连接。\n需要时请运行 fclaude 重新连接。');
  }

  private handleFeishuConnected(): void {
    this.logger.info('Feishu connected');
    if (this.config.notifyOnStartup !== false)
      this.notify('🚀 Feishu bridge 已启动！\n运行 fclaude 即可开始使用。');
  }

  private handleFeishuDisconnected(): void { this.logger.info('Feishu disconnected'); }

  // ── 飞书消息解析 ──────────────────────────────────────────────────────────

  private parseFeishuMessage(data: any): {
    userId: string; content: string;
    imageKey?: string; fileKey?: string; fileName?: string;
  } | null {
    try {
      const event = data.event || data;
      const sender = event.sender || event.user;
      const message = event.message || event;
      const userId = sender?.sender_id?.open_id || sender?.open_id || event?.open_id || '';
      if (!userId) { this.logger.error('Cannot find user ID'); return null; }

      const msgType = message.message_type ?? 'text';
      const raw = message.content || event.content || '{}';
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { /**/ }

      // 图片消息
      if (msgType === 'image') {
        return { userId, content: '', imageKey: parsed.image_key };
      }
      // 文件消息
      if (msgType === 'file') {
        return { userId, content: '', fileKey: parsed.file_key, fileName: parsed.file_name };
      }
      // 文字消息
      const content = parsed.text || raw;
      this.logger.info(`Received from ${userId}: ${content.slice(0, 100)}`);
      return { userId, content };
    } catch (e) {
      this.logger.error('Failed to parse Feishu message:', e);
      return null;
    }
  }

  private loadVersion(): string {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'));
      return pkg.version || '1.0.0';
    } catch { return '1.0.0'; }
  }
}