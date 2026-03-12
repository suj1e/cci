import { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';
import { Logger } from '../logger';
import type { FeishuCardV2 } from '../utils/outputFormatter';

interface FeishuClientOptions {
  appId: string;
  appSecret: string;
  onMessageFromFeishu?: (message: any) => void;
  onActionCallback?: (action: FeishuActionPayload) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export interface FeishuActionPayload {
  messageId: string;
  userId: string;
  action: string;   // action 字段
  value: string;    // value 字段
  raw: any;
}

export class FeishuClient {
  private client: Client;
  private wsClient: WSClient;
  private eventDispatcher: EventDispatcher;
  private options: FeishuClientOptions;
  private isConnected = false;
  private retryCount = 0;
  private readonly maxRetries = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private logger = Logger.getInstance();

  constructor(options: FeishuClientOptions) {
    this.options = options;
    this.client = new Client({
      appId: options.appId,
      appSecret: options.appSecret,
      disableTokenCache: false,
    });
    this.eventDispatcher = new EventDispatcher({ encryptKey: '' });
    this.wsClient = new WSClient({
      appId: options.appId,
      appSecret: options.appSecret,
      autoReconnect: true,
    });
  }

  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to Feishu WebSocket...');

      this.eventDispatcher.register({
        'im.message.receive_v1': async (data: any) => {
          this.logger.debug('Received Feishu message event');
          this.options.onMessageFromFeishu?.(data);
        },
        // 按钮回调事件
        'card.action.trigger': async (data: any) => {
          this.logger.debug('Received card action:', JSON.stringify(data).slice(0, 200));
          this.handleCardAction(data);
        },
      });

      await this.wsClient.start({ eventDispatcher: this.eventDispatcher });
      this.isConnected = true;
      this.retryCount = 0;
      this.logger.info('Connected to Feishu WebSocket');
      this.options.onConnected?.();
    } catch (error) {
      this.logger.error('Feishu connection failed:', error);
      this.isConnected = false;
      this.retryCount++;
      if (this.retryCount <= this.maxRetries) this.scheduleReconnect();
      throw error;
    }
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.wsClient.close(); } catch (e) { this.logger.error('Error closing WS:', e); }
    this.options.onDisconnected?.();
  }

  // ── 发消息 ────────────────────────────────────────────────────────────────

  async sendText(userId: string, text: string): Promise<string> {
    const res = await this.client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: userId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });
    return (res as any)?.data?.message_id ?? '';
  }

  async sendRichMessage(userId: string, richContent: any): Promise<string> {
    const res = await this.client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: userId,
        msg_type: 'post',
        content: JSON.stringify(richContent),
      },
    });
    return (res as any)?.data?.message_id ?? '';
  }

  async sendCardMessage(userId: string, card: FeishuCardV2): Promise<string> {
    const res = await this.client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: userId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });
    const msgId = (res as any)?.data?.message_id ?? '';
    this.logger.debug(`Card sent, messageId: ${msgId}`);
    return msgId;
  }

  /** Patch 更新已发卡片（节流由调用方控制） */
  async patchCardMessage(messageId: string, card: FeishuCardV2): Promise<void> {
    if (!messageId) return;
    try {
      await (this.client.im.message as any).patch({
        path: { message_id: messageId },
        data: { content: JSON.stringify(card) },
      });
      this.logger.debug(`Card patched: ${messageId}`);
    } catch (e: any) {
      this.logger.error(`Failed to patch card ${messageId}:`, e?.message ?? e);
    }
  }

  /** 按钮点击后更新卡片为"已选择"状态 */
  async updateCardButtons(messageId: string, card: FeishuCardV2): Promise<void> {
    await this.patchCardMessage(messageId, card);
  }

  /** 下载飞书图片到 buffer */
  async downloadImage(imageKey: string): Promise<Buffer | null> {
    try {
      const res = await (this.client.im.image as any).get({
        path: { image_key: imageKey },
      });
      if (res?.rawResponse) {
        const chunks: Buffer[] = [];
        for await (const chunk of res.rawResponse.body) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      }
      return null;
    } catch (e) {
      this.logger.error('Failed to download image:', e);
      return null;
    }
  }

  /** 下载飞书文件到 buffer */
  async downloadFile(fileKey: string): Promise<{ buffer: Buffer; name: string } | null> {
    try {
      const res = await (this.client.im.file as any).get({
        path: { file_key: fileKey },
      });
      if (res?.rawResponse) {
        const name = res.rawResponse.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ?? 'file';
        const chunks: Buffer[] = [];
        for await (const chunk of res.rawResponse.body) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return { buffer: Buffer.concat(chunks), name };
      }
      return null;
    } catch (e) {
      this.logger.error('Failed to download file:', e);
      return null;
    }
  }

  /** 兼容旧接口 */
  async sendMessage(userId: string, content: any): Promise<void> {
    if (typeof content === 'string') await this.sendText(userId, content);
    else await this.sendRichMessage(userId, content);
  }

  isClientConnected(): boolean { return this.isConnected; }

  // ── 按钮回调处理 ─────────────────────────────────────────────────────────

  private handleCardAction(data: any): void {
    try {
      const operator = data?.event?.operator ?? data?.operator;
      const userId = operator?.operator_id?.open_id ?? operator?.open_id ?? '';
      const action = data?.event?.action ?? data?.action ?? {};
      const value = action?.value ?? {};
      const messageId = data?.event?.context?.open_message_id ?? data?.context?.open_message_id ?? '';

      if (!userId || !messageId) {
        this.logger.warn('Card action missing userId or messageId');
        return;
      }

      this.options.onActionCallback?.({
        messageId,
        userId,
        action: value.action ?? '',
        value: value.value ?? '',
        raw: data,
      });
    } catch (e) {
      this.logger.error('Failed to handle card action:', e);
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.retryCount * 5000, 30000);
    this.logger.warn(`Reconnecting in ${delay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(e => this.logger.error('Reconnect failed:', e));
    }, delay);
  }
}