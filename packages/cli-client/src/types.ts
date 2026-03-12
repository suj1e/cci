/**
 * 与 bridge 通信的消息类型
 */
export type BridgeMessageType =
  | 'user_message'    // 从飞书收到的用户消息
  | 'stream_chunk'    // CLI 输出流片段
  | 'stream_end'      // 流结束标记
  | 'cli_response'    // 完整的 CLI 响应
  | 'ping'            // 心跳请求
  | 'pong';           // 心跳响应

/**
 * Bridge 消息格式
 */
export interface BridgeMessage {
  type: BridgeMessageType;
  id: string;
  content?: string;
  userId?: string;
  timestamp: number;
}

/**
 * 客户端配置选项
 */
export interface ClientOptions {
  /** Bridge WebSocket URL */
  bridgeUrl?: string;  // 默认 ws://localhost:8989/cli
  /** 透传给 claude 的参数 */
  claudeArgs?: string[];
  /** Bridge HTTP 地址（用于健康检查） */
  bridgeHttpUrl?: string;  // 默认 http://localhost:8989
}

/**
 * 客户端状态
 */
export type ClientState = 'disconnected' | 'connecting' | 'connected' | 'error';
