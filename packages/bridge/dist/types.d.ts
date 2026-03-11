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
export type MessageType = 'user_message' | 'cli_response' | 'stream_chunk' | 'stream_end' | 'ping' | 'pong';
export interface BaseMessage {
    type: MessageType;
    id: string;
    timestamp: number;
}
export interface UserMessage extends BaseMessage {
    type: 'user_message';
    content: string;
    userId: string;
}
export interface CliResponse extends BaseMessage {
    type: 'cli_response';
    content: string;
    conversationId?: string;
}
export interface StreamChunk extends BaseMessage {
    type: 'stream_chunk';
    content: string;
    conversationId?: string;
}
export interface StreamEnd extends BaseMessage {
    type: 'stream_end';
    conversationId?: string;
}
export interface PingMessage extends BaseMessage {
    type: 'ping';
}
export interface PongMessage extends BaseMessage {
    type: 'pong';
}
export type BridgeMessage = UserMessage | CliResponse | StreamChunk | StreamEnd | PingMessage | PongMessage;
export type FeishuElementType = 'text' | 'a' | 'at' | 'image' | 'code_block' | 'hr' | 'md_block';
export interface FeishuElement {
    tag: FeishuElementType;
    text?: string;
    href?: string;
    user_id?: string;
    language?: string;
    code?: string;
}
export interface FeishuRichText {
    elements: FeishuElement[];
}
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
export interface BridgeConfig {
    appId: string;
    appSecret: string;
    port?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
