import * as pty from 'node-pty';
import WebSocket from 'ws';
import http from 'http';
import { BridgeMessage, ClientOptions, ClientState } from './types';

export class FeishuCliClient {
  private options: Required<ClientOptions>;
  private ws: WebSocket | null = null;
  private ptyProcess: pty.IPty | null = null;
  private state: ClientState = 'disconnected';

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

    // PTY 输出 -> stdout + WebSocket
    this.ptyProcess.onData((data) => {
      process.stdout.write(data);
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
          // 注入到 PTY 作为用户输入
          this.ptyProcess?.write(msg.content + '\n');
        }
      } catch (e) {
        // 忽略解析错误
      }
    });

    // PTY 退出 -> 关闭连接
    this.ptyProcess.onExit(({ exitCode }) => {
      this.stop();
      process.exit(exitCode ?? 0);
    });
  }

  async stop(): Promise<void> {
    if (this.ws) {
      // 发送流结束消息
      if (this.ws.readyState === WebSocket.OPEN) {
        const msg: BridgeMessage = {
          type: 'stream_end',
          id: Date.now().toString(),
          timestamp: Date.now(),
        };
        this.ws.send(JSON.stringify(msg));
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
