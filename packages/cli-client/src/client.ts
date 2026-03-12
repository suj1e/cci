import * as pty from 'node-pty';
import WebSocket from 'ws';
import http from 'http';
import { BridgeMessage, ClientOptions, ClientState } from './types';

export class FeishuCliClient {
  private options: Required<ClientOptions>;
  private ws: WebSocket | null = null;
  private ptyProcess: pty.IPty | null = null;
  private state: ClientState = 'disconnected';

  // 输入回显过滤
  private inputBuffer: string = '';
  private lastInputTime: number = 0;
  private readonly INPUT_ECHO_TIMEOUT = 100; // 输入回显检测超时（毫秒）

  constructor(options: ClientOptions = {}) {
    this.options = {
      bridgeUrl: options.bridgeUrl || 'ws://localhost:8989/cli',
      bridgeHttpUrl: options.bridgeHttpUrl || 'http://localhost:8989',
      claudeArgs: options.claudeArgs || [],
    };
  }

  async start(): Promise<void> {
    // 1. 检查 bridge 健康状态
    const health = await this.checkBridgeHealth();
    if (!health) {
      throw new Error('feishu-bridge 服务未运行，请先启动: feishu-bridge start');
    }

    // 2. 连接 WebSocket
    await this.connectWebSocket();

    // 3. 创建 PTY 运行 claude
    this.startPty();

    // 4. 设置数据流处理
    this.setupDataFlow();
  }

  private async checkBridgeHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`${this.options.bridgeHttpUrl}/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state = 'connecting';
      this.ws = new WebSocket(this.options.bridgeUrl);

      this.ws.on('open', () => {
        this.state = 'connected';
        console.log('已连接到 feishu-bridge');
        resolve();
      });

      this.ws.on('error', (error) => {
        this.state = 'error';
        reject(new Error(`WebSocket 连接失败: ${error.message}`));
      });

      this.ws.on('close', () => {
        this.state = 'disconnected';
        console.log('已断开与 feishu-bridge 的连接');
      });
    });
  }

  private startPty(): void {
    const args = this.options.claudeArgs;
    this.ptyProcess = pty.spawn('claude', args, {
      name: 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      cwd: process.cwd(),
      env: process.env as { [key: string]: string },
    });
  }

  private setupDataFlow(): void {
    if (!this.ptyProcess || !this.ws) return;

    // 本地 stdin -> PTY（允许本地操作）
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      if (this.ptyProcess) {
        const inputStr = data.toString();
        // 记录输入用于过滤回显
        this.inputBuffer += inputStr;
        this.lastInputTime = Date.now();
        this.ptyProcess.write(inputStr);
      }
    });

    // PTY 输出 -> stdout + WebSocket
    this.ptyProcess.onData((data) => {
      // 本地输出始终显示
      process.stdout.write(data);

      // 过滤输入回显 - 不发送本地输入的回显到飞书
      const timeSinceInput = Date.now() - this.lastInputTime;
      if (timeSinceInput < this.INPUT_ECHO_TIMEOUT && this.inputBuffer.length > 0) {
        // 检查输出是否包含输入内容（回显）
        const inputLines = this.inputBuffer.split('\n');
        let filteredOutput = data;

        for (const inputLine of inputLines) {
          if (inputLine.trim() && filteredOutput.includes(inputLine)) {
            // 这可能是输入回显，跳过发送
            this.inputBuffer = this.inputBuffer.slice(inputLine.length);
            return;
          }
        }

        // 清理过期的输入缓冲
        if (timeSinceInput > this.INPUT_ECHO_TIMEOUT) {
          this.inputBuffer = '';
        }
      }

      // 发送到 WebSocket（过滤后的输出）
      if (this.ws?.readyState === WebSocket.OPEN) {
        const msg: BridgeMessage = {
          type: 'stream_chunk',
          id: Date.now().toString(),
          content: data,
          timestamp: Date.now(),
        };
        this.ws.send(JSON.stringify(msg));
      }
    });

    // WebSocket 消息 -> PTY
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeMessage;

        if (msg.type === 'user_message' && msg.content) {
          const content = msg.content.trim();
          if (this.ptyProcess) {
            this.ptyProcess.write(content);
            this.ptyProcess.write('\r');
          }
        }
        // 忽略其他消息类型（pong 等）
      } catch (e) {
        // 忽略解析错误
      }
    });

    // PTY 退出 -> 关闭连接
    this.ptyProcess.onExit(async ({ exitCode }) => {
      await this.stop();
      process.exit(exitCode ?? 0);
    });
  }

  async stop(): Promise<void> {
    // 恢复 stdin 状态
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeAllListeners('data');

    if (this.ws) {
      // 发送流结束消息
      if (this.ws.readyState === WebSocket.OPEN) {
        const msg: BridgeMessage = {
          type: 'stream_end',
          id: Date.now().toString(),
          timestamp: Date.now(),
        };
        this.ws.send(JSON.stringify(msg));
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.ws.close();
      this.ws = null;
    }

    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }

    this.state = 'disconnected';
  }

  getState(): ClientState {
    return this.state;
  }
}
