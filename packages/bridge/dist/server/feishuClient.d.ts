interface FeishuClientOptions {
    appId: string;
    appSecret: string;
    onMessageFromFeishu?: (message: any) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
}
export declare class FeishuClient {
    private client;
    private wsClient;
    private eventDispatcher;
    private options;
    private isConnected;
    private retryCount;
    private maxRetries;
    private reconnectTimer;
    private logger;
    constructor(options: FeishuClientOptions);
    connect(): Promise<void>;
    disconnect(): void;
    sendMessage(userId: string, content: any): Promise<void>;
    isClientConnected(): boolean;
    private scheduleReconnect;
}
export {};
