import { LocalServer } from './localServer';
import { FeishuClient } from './feishuClient';
import { MessageConverter } from '../protocol/messageConverter';
import { ConfigManager } from '../config/config';
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
  private streamBuffer: string[] = [];
  private isStreaming = false;
  private logger = Logger.getInstance();
  private version: string;

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

  private handleCliConnect(): void {
    this.logger.info('CLI connected - message forwarding active');
  }

  private handleCliDisconnect(): void {
    this.logger.info('CLI disconnected - message forwarding stopped');
  }

  private handleFeishuConnected(): void {
    this.logger.info('Feishu connected');
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

    if (this.localServer.hasCliConnection()) {
      const bridgeMessage: BridgeMessage = {
        id: MessageConverter.generateId(),
        type: 'user_message',
        content: message.content,
        userId: message.userId,
        timestamp: Date.now()
      };
      this.localServer.sendToCli(bridgeMessage);
      this.logger.debug('Message forwarded to CLI');
    } else {
      this.logger.warn('No CLI connection, cannot forward Feishu message');
      this.feishuClient.sendMessage(
        message.userId,
        'Sorry, Claude CLI is not connected yet. Please run `/connect-feishu` in the CLI first.'
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
  }

  private handleStreamEnd(): void {
    const fullContent = MessageConverter.mergeStreamChunks(this.streamBuffer);

    if (this.currentUserId) {
      const feishuPost = MessageConverter.markdownToFeishuPost(fullContent);
      this.feishuClient.sendMessage(this.currentUserId, feishuPost)
        .catch((error) => {
          this.logger.error('Failed to send message to Feishu:', error);
        });
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
