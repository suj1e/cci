// 桥接服务类型定义

// 飞书 WebSocket 事件类型
export interface FeishuWebSocketEvent {
  header: {
    event_id: string;
    token: string;
    create_time: string;
    event_type: string;
    tenant_key: string;
    app_id: string;
  };
  event: {
    sender: {
      sender_id: {
        union_id: string;
        user_id: string;
        open_id: string;
      };
      sender_type: string;
      tenant_key: string;
    };
    message: {
      message_id: string;
      root_id?: string;
      parent_id?: string;
      create_time: string;
      chat_id: string;
      chat_type: string;
      message_type: string;
      content: string;
      mentions?: Array<{
        key: string;
        id: {
          union_id: string;
          user_id: string;
          open_id: string;
        };
        name: string;
        tenant_key: string;
      }>;
    };
  };
}

// WebSocket 消息类型
export type MessageType =
  | 'user_message'
  | 'cli_response'
  | 'stream_chunk'
  | 'stream_end'
  | 'ping'
  | 'pong';

// 基础消息格式
export interface BaseMessage {
  type: MessageType;
  id: string;
  timestamp: number;
}

// 用户消息（从飞书到CLI）
export interface UserMessage extends BaseMessage {
  type: 'user_message';
  content: string;
  userId: string;
}

// CLI响应（从CLI到飞书）
export interface CliResponse extends BaseMessage {
  type: 'cli_response';
  content: string;
  conversationId?: string;
}

// 流式响应块
export interface StreamChunk extends BaseMessage {
  type: 'stream_chunk';
  content: string;
  conversationId?: string;
}

// 流式响应结束
export interface StreamEnd extends BaseMessage {
  type: 'stream_end';
  conversationId?: string;
}

// Ping/Pong消息
export interface PingMessage extends BaseMessage {
  type: 'ping';
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
}

// 消息联合类型
export type BridgeMessage =
  | UserMessage
  | CliResponse
  | StreamChunk
  | StreamEnd
  | PingMessage
  | PongMessage;

// 飞书富文本元素类型
export type FeishuElementType =
  | 'text'
  | 'a'
  | 'at'
  | 'image'
  | 'code_block'
  | 'hr'
  | 'md_block';

// 飞书富文本元素
export interface FeishuElement {
  tag: FeishuElementType;
  text?: string;
  href?: string;
  user_id?: string;
  language?: string;
  code?: string;
}

// 飞书富文本内容
export interface FeishuRichText {
  elements: FeishuElement[];
}

// 飞书消息卡片
export interface FeishuCard {
  config: {
    wide_screen_mode: boolean;
  };
  elements: FeishuCardElement[];
}

export interface FeishuCardElement {
  tag: string;
  text?: FeishuCardText;
  content?: string;
  elements?: FeishuCardElement[];
  lang?: string;
}

export interface FeishuCardText {
  tag: string;
  content: string;
}

// 配置文件类型
export interface BridgeConfig {
  appId: string;
  appSecret: string;
  port?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  notifyUserIds?: string[]; // 配置需要接收通知的用户openid列表
  notifyOnStartup?: boolean; // 服务启动时是否发送通知
  notifyOnConnection?: boolean; // CLI连接时是否发送通知
  notifyOnDisconnection?: boolean; // CLI断开时是否发送通知
}
