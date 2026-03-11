import type { BridgeConfig } from '../types';
interface BridgeOptions {
    config: BridgeConfig;
}
export declare class FeishuBridge {
    private config;
    private localServer;
    private feishuClient;
    private currentUserId;
    private streamBuffer;
    private isStreaming;
    private logger;
    private version;
    constructor(options: BridgeOptions);
    private loadVersion;
    start(): Promise<void>;
    stop(): Promise<void>;
    private handleCliConnect;
    private handleCliDisconnect;
    private handleFeishuConnected;
    private handleFeishuDisconnected;
    private handleCliMessage;
    private handleFeishuMessage;
    private handleCliResponse;
    private handleStreamChunk;
    private handleStreamEnd;
    private parseFeishuMessage;
}
export {};
