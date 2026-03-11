import { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';
import { Logger } from '../logger';
import type { BridgeMessage } from '../types';

interface FeishuClientOptions {
  appId: string;
  appSecret: string;
  onMessageFromFeishu?: (message: any) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class FeishuClient {
  private client: Client;
  private wsClient: WSClient;
  private eventDispatcher: EventDispatcher;
  private options: FeishuClientOptions;
  private isConnected = false;
  private retryCount = 0;
  private maxRetries = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private logger = Logger.getInstance();

  constructor(options: FeishuClientOptions) {
    this.options = options;
    this.client = new Client({
      appId: options.appId,
      appSecret: options.appSecret,
      disableTokenCache: false
    });

    this.eventDispatcher = new EventDispatcher({
      encryptKey: '',
    });

    this.wsClient = new WSClient({
      appId: options.appId,
      appSecret: options.appSecret,
      autoReconnect: true
    });
  }

  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to Feishu WebSocket...');

      this.eventDispatcher.register({
        'im.message.receive_v1': async (data: any) => {
          this.logger.debug('Received Feishu message event');
          if (this.options.onMessageFromFeishu) {
            this.options.onMessageFromFeishu(data);
          }
        }
      });

      await this.wsClient.start({
        eventDispatcher: this.eventDispatcher
      });

      this.isConnected = true;
      this.retryCount = 0;
      this.logger.info('Connected to Feishu WebSocket');

      if (this.options.onConnected) {
        this.options.onConnected();
      }
    } catch (error) {
      this.logger.error('Feishu connection failed:', error);
      this.isConnected = false;
      this.retryCount++;

      if (this.retryCount <= this.maxRetries) {
        this.scheduleReconnect();
      }

      throw error;
    }
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    try {
      this.wsClient.close();
    } catch (error) {
      this.logger.error('Error closing Feishu WebSocket:', error);
    }

    if (this.options.onDisconnected) {
      this.options.onDisconnected();
    }
  }

  async sendMessage(userId: string, content: any): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to Feishu');
    }

    try {
      // 先尝试作为文本消息发送
      if (typeof content === 'string') {
        await this.client.im.message.create({
          params: {
            receive_id_type: 'open_id'
          },
          data: {
            receive_id: userId,
            msg_type: 'text',
            content: JSON.stringify({ text: content })
          }
        });
      } else {
        // 作为富文本消息发送
        await this.client.im.message.create({
          params: {
            receive_id_type: 'open_id'
          },
          data: {
            receive_id: userId,
            msg_type: 'post',
            content: JSON.stringify(content)
          }
        });
      }
      this.logger.debug('Message sent to Feishu');
    } catch (error) {
      this.logger.error('Failed to send message to Feishu:', error);
      throw error;
    }
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.retryCount * 5000, 30000);
    this.logger.warn(`Reconnecting in ${delay / 1000} seconds...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error('Reconnect failed:', error);
      });
    }, delay);
  }
}
