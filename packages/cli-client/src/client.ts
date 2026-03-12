import * as pty from 'node-pty';
import WebSocket from 'ws';
import http from 'http';
import { BridgeMessage, ClientOptions, ClientState } from './types';
import { PtyOutputFilter, SemanticEvent } from './filter/PtyOutputFilter';

export class FeishuCliClient {
  private options: Required<ClientOptions>;
  private ws: WebSocket | null = null;
  private ptyProcess: pty.IPty | null = null;
  private state: ClientState = 'disconnected';

  private lastInputTime = 0;
  private lastInputStr = '';
  private readonly INPUT_ECHO_TIMEOUT = 150;

  private outputFilter: PtyOutputFilter;

  // diff 收集状态（跨多次 filter 调用）
  private diffLines: string[] = [];
  private diffFileName = '';

  // 响应结束检测
  private responseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RESPONSE_END_TIMEOUT = 1500;
  private isResponding = false;

  // 心跳
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly PING_INTERVAL = 30000;

  constructor(options: ClientOptions = {}) {
    this.options = {
      bridgeUrl: options.bridgeUrl || 'ws://localhost:8989/cli',
      bridgeHttpUrl: options.bridgeHttpUrl || 'http://localhost:8989',
      claudeArgs: options.claudeArgs || [],
    };

    this.outputFilter = new PtyOutputFilter({
      onSemanticEvent: (ev) => this.handleSemanticEvent(ev),
      onContent: (text) => this.handleContent(text),
      onDiff: (lines) => this.handleDiff(lines),
    });
  }

  async start(): Promise<void> {
    const health = await this.checkBridgeHealth();
    if (!health) throw new Error('feishu-bridge 未运行，请先启动: feishu-bridge start');
    await this.connectWebSocket();
    this.startPty();
    this.setupDataFlow();
    this.startPing();
  }

  async stop(): Promise<void> {
    this.stopPing();
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeAllListeners('data');
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWs({ type: 'stream_end' });
      await new Promise(r => setTimeout(r, 100));
    }
    this.ws?.close();
    this.ws = null;
    this.ptyProcess?.kill();
    this.ptyProcess = null;
    this.state = 'disconnected';
  }

  getState(): ClientState { return this.state; }

  // ── 语义事件处理 ──────────────────────────────────────────────────────────

  private handleSemanticEvent(ev: SemanticEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    switch (ev.type) {
      case 'thinking_start':
        this.sendWs({ type: 'thinking_start' });
        break;
      case 'thinking_end':
        this.sendWs({ type: 'thinking_end' });
        break;
      case 'text_start':
        this.sendWs({ type: 'text_start' });
        break;

      case 'tool_call':
        this.markResponding();
        this.sendWs({ type: 'tool_call', toolName: ev.toolName, toolDesc: ev.toolDesc, toolStatus: ev.toolStatus });
        break;

      case 'tool_result':
        this.sendWs({ type: 'tool_result', toolName: 'unknown', content: ev.resultContent, truncated: ev.truncated });
        break;

      case 'ask_user':
        this.sendWs({ type: 'ask_user', question: ev.question });
        break;

      case 'prompt_confirm':
        this.sendWs({ type: 'prompt_confirm', message: ev.message });
        break;

      case 'prompt_permission':
        this.sendWs({ type: 'prompt_permission', tool: ev.tool, target: ev.target });
        break;

      case 'prompt_choice':
        this.sendWs({ type: 'prompt_choice', message: ev.message, options: ev.options });
        break;

      case 'prompt_plan':
        this.sendWs({ type: 'prompt_plan', steps: ev.steps });
        break;

      case 'skill_loading':
        this.sendWs({ type: 'skill_loading', skillName: ev.skillName, loaded: ev.loaded, total: ev.total });
        break;

      case 'mcp_loading':
        this.sendWs({ type: 'mcp_loading', serverName: ev.serverName, done: ev.done });
        break;

      case 'compacting':
        this.sendWs({ type: 'compacting', auto: ev.auto });
        break;

      case 'hook_blocked':
        this.sendWs({ type: 'hook_blocked', hookName: ev.hookName, message: ev.reason });
        break;

      case 'hook_warning':
        this.sendWs({ type: 'hook_warning', hookName: ev.hookName, message: ev.hookMessage });
        break;

      case 'notification':
        this.sendWs({ type: 'notification', content: ev.notificationMessage });
        break;

      case 'error_api':
        this.sendWs({ type: 'error_api', errorType: ev.errorType, content: ev.errorMessage });
        break;

      case 'error_tool':
        this.sendWs({ type: 'error_tool', toolName: ev.errorToolName, content: ev.errorMessage });
        break;

      case 'command_echo':
        this.sendWs({ type: 'command_echo', command: ev.command });
        break;
    }
  }

  private handleContent(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!text.trim()) return;
    if (this.isInputEcho(text)) return;
    this.markResponding();
    this.sendWs({ type: 'stream_chunk', content: text });
  }

  private handleDiff(lines: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.sendWs({ type: 'diff_content', content: lines.join('\n'), fileName: this.diffFileName || undefined });
  }

  private markResponding(): void {
    this.isResponding = true;
    if (this.responseTimer) clearTimeout(this.responseTimer);
    this.responseTimer = setTimeout(() => {
      if (this.isResponding) {
        this.isResponding = false;
        this.sendWs({ type: 'stream_end' });
      }
    }, this.RESPONSE_END_TIMEOUT);
  }

  // ── 心跳 ──────────────────────────────────────────────────────────────────

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendWs({ type: 'ping' });
      }
    }, this.PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  // ── 工具函数 ──────────────────────────────────────────────────────────────

  private isInputEcho(text: string): boolean {
    if (Date.now() - this.lastInputTime > this.INPUT_ECHO_TIMEOUT) return false;
    const inputClean = this.lastInputStr.trim();
    if (!inputClean) return false;
    return text.trim().startsWith(inputClean) || inputClean.startsWith(text.trim());
  }

  private sendWs(partial: Partial<BridgeMessage>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg: BridgeMessage = {
      type: partial.type ?? 'stream_chunk',
      id: Date.now().toString(),
      timestamp: Date.now(),
      ...partial,
    } as BridgeMessage;
    this.ws.send(JSON.stringify(msg));
  }

  // ── 连接 ──────────────────────────────────────────────────────────────────

  private async checkBridgeHealth(): Promise<boolean> {
    return new Promise(resolve => {
      const req = http.get(`${this.options.bridgeHttpUrl}/health`, res => resolve(res.statusCode === 200));
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state = 'connecting';
      this.ws = new WebSocket(this.options.bridgeUrl);
      this.ws.on('open', () => { this.state = 'connected'; console.log('已连接到 feishu-bridge'); resolve(); });
      this.ws.on('error', e => { this.state = 'error'; reject(new Error(`WebSocket 连接失败: ${e.message}`)); });
      this.ws.on('close', () => { this.state = 'disconnected'; console.log('已断开连接'); this.stopPing(); });
      this.ws.on('message', raw => {
        try {
          const msg = JSON.parse(raw.toString()) as BridgeMessage;
          if (msg.type === 'pong') return; // 心跳回包忽略
          if (msg.type === 'user_message' && msg.content && this.ptyProcess) {
            this.ptyProcess.write(msg.content.trim() + '\r');
          }
        } catch { /**/ }
      });
    });
  }

  private startPty(): void {
    this.ptyProcess = pty.spawn('claude', this.options.claudeArgs, {
      name: 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      cwd: process.cwd(),
      env: process.env as { [key: string]: string },
    });
  }

  private setupDataFlow(): void {
    if (!this.ptyProcess || !this.ws) return;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', data => {
      if (!this.ptyProcess) return;
      const inputStr = data.toString();
      this.lastInputStr = inputStr;
      this.lastInputTime = Date.now();
      this.outputFilter.recordInput(inputStr);
      this.ptyProcess.write(inputStr);
    });

    this.ptyProcess.onData(data => {
      process.stdout.write(data);
      this.outputFilter.filter(data);
    });

    this.ptyProcess.onExit(async ({ exitCode }) => {
      await this.stop();
      process.exit(exitCode ?? 0);
    });
  }
}