import { LocalServer } from './localServer';
import { FeishuClient } from './feishuClient';
import { MessageConverter } from '../protocol/messageConverter';
import { ConfigManager } from '../config/config';
import { OutputFormatter } from '../utils/outputFormatter';
import type { BridgeConfig, BridgeMessage } from '../types';
import { Logger } from '../logger';
import fs from 'fs';
import path from 'path';

interface BridgeOptions {
  config: BridgeConfig;
}

export class FeishuBridge {
  private config: BridgeConfig;
  private localServer: LocalServer;
  private feishuClient: FeishuClient;
  private currentUserId: string | null = null;
  private knownUserIds: Set<string> = new Set(); // 记录所有有过交互的用户ID
  private streamBuffer: string[] = [];
  private isStreaming = false;
  private logger = Logger.getInstance();
  private version: string;

  // 累积发送相关
  private pendingBuffer: string = '';
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_THRESHOLD = 200; // 累积字符阈值
  private readonly FLUSH_TIMEOUT = 500; // 超时刷新（毫秒）

  constructor(options: BridgeOptions) {
    this.config = options.config;
    this.version = this.loadVersion();

    this.localServer = new LocalServer({
      port: this.config.port || 8989,
      onMessageFromCli: this.handleCliMessage.bind(this),
      onCliConnect: this.handleCliConnect.bind(this),
      onCliDisconnect: this.handleCliDisconnect.bind(this)
    });

    this.feishuClient = new FeishuClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      onMessageFromFeishu: this.handleFeishuMessage.bind(this),
      onConnected: this.handleFeishuConnected.bind(this),
      onDisconnected: this.handleFeishuDisconnected.bind(this)
    });
  }

  private loadVersion(): string {
    try {
      const pkgPath = path.resolve(__dirname, '../../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  async start(): Promise<void> {
    this.logger.info(`Feishu Bridge v${this.version}`);
    this.logger.info('');

    try {
      await this.localServer.start();
      this.logger.info('Local server started');
    } catch (error) {
      this.logger.error('Failed to start local server:', error);
      throw error;
    }

    try {
      await this.feishuClient.connect();
      this.logger.info('Feishu client connected');
    } catch (error) {
      this.logger.error('Failed to connect to Feishu:', error);
    }

    this.logger.info('Feishu Bridge Service is running');
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Feishu Bridge Service...');

    await this.localServer.stop();
    this.feishuClient.disconnect();

    this.logger.info('Feishu Bridge Service stopped');
  }

  /**
   * 给所有配置的通知用户发送消息
   */
  private sendNotificationToAllUsers(content: string): void {
    const notifyUsers = new Set<string>();

    // 添加配置文件中的用户
    if (this.config.notifyUserIds && Array.isArray(this.config.notifyUserIds)) {
      this.logger.debug('Configured notify users:', this.config.notifyUserIds);
      this.config.notifyUserIds.forEach(userId => notifyUsers.add(userId));
    }

    // 添加有过交互的用户
    this.knownUserIds.forEach(userId => notifyUsers.add(userId));

    // 如果有当前用户也加上
    if (this.currentUserId) {
      notifyUsers.add(this.currentUserId);
    }

    this.logger.debug('Sending notification to users:', Array.from(notifyUsers));

    // 给所有用户发送通知
    notifyUsers.forEach(userId => {
      this.feishuClient.sendMessage(userId, content).then(() => {
        this.logger.debug(`Notification sent to user ${userId} successfully`);
      }).catch((error) => {
        this.logger.error(`Failed to send notification to user ${userId}:`, error);
      });
    });
  }

  private handleCliConnect(): void {
    this.logger.info('CLI connected - message forwarding active');

    // 连接成功后主动发送通知（如果配置开启）
    if (this.config.notifyOnConnection !== false) {
      this.sendNotificationToAllUsers(
        '✅ 已连接到 Claude CLI 会话！\n现在发送的消息会自动转发给 Claude，响应会实时返回。'
      );
    }
  }

  private handleCliDisconnect(): void {
    this.logger.info('CLI disconnected - message forwarding stopped');

    // 断开连接后主动发送通知（如果配置开启）
    if (this.config.notifyOnDisconnection !== false) {
      this.sendNotificationToAllUsers(
        '❌ 已断开与 Claude CLI 的连接。\n需要时请运行 fclaude 重新连接。'
      );
    }
  }

  private handleFeishuConnected(): void {
    this.logger.info('Feishu connected');

    // 服务启动成功后发送通知（如果配置开启）
    if (this.config.notifyOnStartup !== false) {
      this.sendNotificationToAllUsers(
        '🚀 Feishu bridge 已启动！\n服务正常运行，等待连接...\n运行 fclaude 即可开始使用。'
      );
    }
  }

  private handleFeishuDisconnected(): void {
    this.logger.info('Feishu disconnected');
  }

  private handleCliMessage(message: BridgeMessage): void {
    this.logger.debug('Received message from CLI:', message.type);

    switch (message.type) {
      case 'cli_response':
        this.handleCliResponse(message.content);
        break;
      case 'stream_chunk':
        this.handleStreamChunk(message.content);
        break;
      case 'stream_end':
        this.handleStreamEnd();
        break;
    }
  }

  private handleFeishuMessage(data: any): void {
    this.logger.debug('Received message from Feishu');

    const message = this.parseFeishuMessage(data);
    if (!message) {
      return;
    }

    this.currentUserId = message.userId;
    this.knownUserIds.add(message.userId); // 记录用户ID到已知用户列表

    if (this.localServer.hasCliConnection()) {
      const bridgeMessage: BridgeMessage = {
        id: MessageConverter.generateId(),
        type: 'user_message',
        content: message.content,
        userId: message.userId,
        timestamp: Date.now()
      };
      this.logger.info(`[BRIDGE] Sending user_message to CLI: "${message.content.substring(0, 50)}..."`);
      this.logger.info(`[BRIDGE] Full message: ${JSON.stringify(bridgeMessage)}`);
      this.localServer.sendToCli(bridgeMessage);
      this.logger.info('[BRIDGE] Message sent to CLI successfully');
    } else {
      this.logger.warn('No CLI connection, cannot forward Feishu message');
      this.feishuClient.sendMessage(
        message.userId,
        'Claude CLI 未连接。请运行 fclaude 连接后再试。'
      ).catch((error) => {
        this.logger.error('Failed to send notification to Feishu:', error);
      });
    }
  }

  private handleCliResponse(content: string): void {
    if (!this.currentUserId) {
      this.logger.warn('No user ID to send response to');
      return;
    }

    this.logger.debug('Sending response to Feishu user:', this.currentUserId);
    const feishuPost = MessageConverter.markdownToFeishuPost(content);
    this.feishuClient.sendMessage(this.currentUserId, feishuPost)
      .catch((error) => {
        this.logger.error('Failed to send message to Feishu:', error);
      });
  }

  private handleStreamChunk(content: string): void {
    this.isStreaming = true;
    this.streamBuffer.push(content);

    // 累积发送逻辑
    if (this.currentUserId && OutputFormatter.hasContent(content)) {
      const cleanContent = OutputFormatter.formatForFeishu(content);
      this.pendingBuffer += cleanContent;

      // 检查是否达到发送阈值
      if (this.pendingBuffer.length >= this.FLUSH_THRESHOLD) {
        this.flushPendingBuffer();
      } else {
        // 设置或重置超时刷新
        this.scheduleFlush();
      }
    }
  }

  /**
   * 安排超时刷新
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushPendingBuffer();
    }, this.FLUSH_TIMEOUT);
  }

  /**
   * 刷新待发送缓冲区
   */
  private flushPendingBuffer(): void {
    if (!this.currentUserId || !this.pendingBuffer.trim()) {
      return;
    }

    const userId = this.currentUserId;
    const content = this.pendingBuffer.trim();
    this.pendingBuffer = '';

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.logger.info(`[STREAM] Sending accumulated content, length=${content.length}`);

    // 判断是否使用卡片格式（代码块、表格、长内容）
    if (OutputFormatter.shouldUseCard(content)) {
      const card = OutputFormatter.toFeishuCard(content);
      this.feishuClient.sendCardMessage(userId, card)
        .catch((error) => {
          this.logger.error('Failed to send card message to Feishu:', error);
          // 降级为 Post 格式
          const richContent = OutputFormatter.toFeishuPost(content);
          this.feishuClient.sendRichMessage(userId, richContent)
            .catch((err) => {
              this.logger.error('Failed to send fallback post message:', err);
            });
        });
    } else {
      // 使用 Post 格式发送
      const richContent = OutputFormatter.toFeishuPost(content);
      this.feishuClient.sendRichMessage(userId, richContent)
        .catch((error) => {
          this.logger.error('Failed to send rich message to Feishu:', error);
          // 降级为纯文本发送
          this.feishuClient.sendMessage(userId, content)
            .catch((err) => {
              this.logger.error('Failed to send fallback text message:', err);
            });
        });
    }
  }

  /**
   * 清理 ANSI 转义码
   */
  private stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  private handleStreamEnd(): void {
    // 刷新剩余的累积内容
    if (this.pendingBuffer.trim() && this.currentUserId) {
      this.flushPendingBuffer();
    }

    // 发送原始流缓冲区的剩余内容（如果有）
    if (this.streamBuffer.length > 0 && this.currentUserId) {
      const remainingContent = MessageConverter.mergeStreamChunks(this.streamBuffer);
      const cleanContent = OutputFormatter.formatForFeishu(remainingContent);
      if (cleanContent.trim()) {
        this.logger.info('[STREAM] Sending final accumulated content');

        // 判断是否使用卡片格式
        if (OutputFormatter.shouldUseCard(cleanContent)) {
          const card = OutputFormatter.toFeishuCard(cleanContent);
          this.feishuClient.sendCardMessage(this.currentUserId, card)
            .then(() => this.logger.info('[STREAM] Final card message sent'))
            .catch((error) => {
              this.logger.error('Failed to send final card message:', error);
            });
        } else {
          const richContent = OutputFormatter.toFeishuPost(cleanContent);
          this.feishuClient.sendRichMessage(this.currentUserId, richContent)
            .then(() => this.logger.info('[STREAM] Final message sent'))
            .catch((error) => {
              this.logger.error('Failed to send final message to Feishu:', error);
            });
        }
      }
    }

    this.streamBuffer = [];
    this.isStreaming = false;
  }

  private parseFeishuMessage(data: any): { userId: string; content: string } | null {
    try {
      // 打印原始结构方便调试
      this.logger.debug('Raw Feishu message structure:', JSON.stringify(data, null, 2));

      // 兼容不同的消息结构
      const event = data.event || data;
      const sender = event.sender || event.user;
      const message = event.message || event;

      // 获取用户ID
      let userId = '';
      if (sender?.sender_id?.open_id) {
        userId = sender.sender_id.open_id;
      } else if (sender?.open_id) {
        userId = sender.open_id;
      } else if (event?.open_id) {
        userId = event.open_id;
      } else {
        this.logger.error('Cannot find user ID in message');
        return null;
      }

      // 获取消息内容
      let messageContent = '';
      if (message.content) {
        messageContent = message.content;
      } else if (event.content) {
        messageContent = event.content;
      } else {
        this.logger.error('Cannot find message content');
        return null;
      }

      let content = '';
      try {
        const parsed = JSON.parse(messageContent);
        content = parsed.text || messageContent;
      } catch {
        content = messageContent;
      }

      this.logger.info(`Received Feishu message from ${userId}: ${content}`);
      return { userId, content };
    } catch (error) {
      this.logger.error('Failed to parse Feishu message:', error);
      return null;
    }
  }
}
