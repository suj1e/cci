import type { BridgeMessage } from '../types';
interface LocalServerOptions {
    port: number;
    onMessageFromCli?: (message: BridgeMessage) => void;
    onCliConnect?: () => void;
    onCliDisconnect?: () => void;
}
export declare class LocalServer {
    private server;
    private wss;
    private cliConnection;
    private options;
    private isRunning;
    private logger;
    constructor(options: LocalServerOptions);
    getPort(): number;
    start(): Promise<void>;
    stop(): Promise<void>;
    sendToCli(message: BridgeMessage): void;
    hasCliConnection(): boolean;
    private handleHttpRequest;
    private setupWebSocketHandlers;
    private handleCliMessage;
}
export {};
