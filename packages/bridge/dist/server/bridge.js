"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuBridge = void 0;
const localServer_1 = require("./localServer");
const feishuClient_1 = require("./feishuClient");
const messageConverter_1 = require("../protocol/messageConverter");
const logger_1 = require("../logger");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class FeishuBridge {
    config;
    localServer;
    feishuClient;
    currentUserId = null;
    streamBuffer = [];
    isStreaming = false;
    logger = logger_1.Logger.getInstance();
    version;
    constructor(options) {
        this.config = options.config;
        this.version = this.loadVersion();
        this.localServer = new localServer_1.LocalServer({
            port: this.config.port || 8989,
            onMessageFromCli: this.handleCliMessage.bind(this),
            onCliConnect: this.handleCliConnect.bind(this),
            onCliDisconnect: this.handleCliDisconnect.bind(this)
        });
        this.feishuClient = new feishuClient_1.FeishuClient({
            appId: this.config.appId,
            appSecret: this.config.appSecret,
            onMessageFromFeishu: this.handleFeishuMessage.bind(this),
            onConnected: this.handleFeishuConnected.bind(this),
            onDisconnected: this.handleFeishuDisconnected.bind(this)
        });
    }
    loadVersion() {
        try {
            const pkgPath = path_1.default.resolve(__dirname, '../../package.json');
            const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf-8'));
            return pkg.version || '1.0.0';
        }
        catch {
            return '1.0.0';
        }
    }
    async start() {
        this.logger.info(`Feishu Bridge v${this.version}`);
        this.logger.info('');
        try {
            await this.localServer.start();
            this.logger.info('Local server started');
        }
        catch (error) {
            this.logger.error('Failed to start local server:', error);
            throw error;
        }
        try {
            await this.feishuClient.connect();
            this.logger.info('Feishu client connected');
        }
        catch (error) {
            this.logger.error('Failed to connect to Feishu:', error);
        }
        this.logger.info('Feishu Bridge Service is running');
    }
    async stop() {
        this.logger.info('Stopping Feishu Bridge Service...');
        await this.localServer.stop();
        this.feishuClient.disconnect();
        this.logger.info('Feishu Bridge Service stopped');
    }
    handleCliConnect() {
        this.logger.info('CLI connected - message forwarding active');
    }
    handleCliDisconnect() {
        this.logger.info('CLI disconnected - message forwarding stopped');
    }
    handleFeishuConnected() {
        this.logger.info('Feishu connected');
    }
    handleFeishuDisconnected() {
        this.logger.info('Feishu disconnected');
    }
    handleCliMessage(message) {
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
    handleFeishuMessage(data) {
        this.logger.debug('Received message from Feishu');
        const message = this.parseFeishuMessage(data);
        if (!message) {
            return;
        }
        this.currentUserId = message.userId;
        if (this.localServer.hasCliConnection()) {
            const bridgeMessage = {
                id: messageConverter_1.MessageConverter.generateId(),
                type: 'user_message',
                content: message.content,
                userId: message.userId,
                timestamp: Date.now()
            };
            this.localServer.sendToCli(bridgeMessage);
            this.logger.debug('Message forwarded to CLI');
        }
        else {
            this.logger.warn('No CLI connection, cannot forward Feishu message');
            this.feishuClient.sendMessage(message.userId, 'Sorry, Claude CLI is not connected yet. Please run `/connect-feishu` in the CLI first.').catch((error) => {
                this.logger.error('Failed to send notification to Feishu:', error);
            });
        }
    }
    handleCliResponse(content) {
        if (!this.currentUserId) {
            this.logger.warn('No user ID to send response to');
            return;
        }
        this.logger.debug('Sending response to Feishu user:', this.currentUserId);
        const feishuPost = messageConverter_1.MessageConverter.markdownToFeishuPost(content);
        this.feishuClient.sendMessage(this.currentUserId, feishuPost)
            .catch((error) => {
            this.logger.error('Failed to send message to Feishu:', error);
        });
    }
    handleStreamChunk(content) {
        this.isStreaming = true;
        this.streamBuffer.push(content);
    }
    handleStreamEnd() {
        const fullContent = messageConverter_1.MessageConverter.mergeStreamChunks(this.streamBuffer);
        if (this.currentUserId) {
            const feishuPost = messageConverter_1.MessageConverter.markdownToFeishuPost(fullContent);
            this.feishuClient.sendMessage(this.currentUserId, feishuPost)
                .catch((error) => {
                this.logger.error('Failed to send message to Feishu:', error);
            });
        }
        this.streamBuffer = [];
        this.isStreaming = false;
    }
    parseFeishuMessage(data) {
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
            }
            else if (sender?.open_id) {
                userId = sender.open_id;
            }
            else if (event?.open_id) {
                userId = event.open_id;
            }
            else {
                this.logger.error('Cannot find user ID in message');
                return null;
            }
            // 获取消息内容
            let messageContent = '';
            if (message.content) {
                messageContent = message.content;
            }
            else if (event.content) {
                messageContent = event.content;
            }
            else {
                this.logger.error('Cannot find message content');
                return null;
            }
            let content = '';
            try {
                const parsed = JSON.parse(messageContent);
                content = parsed.text || messageContent;
            }
            catch {
                content = messageContent;
            }
            this.logger.info(`Received Feishu message from ${userId}: ${content}`);
            return { userId, content };
        }
        catch (error) {
            this.logger.error('Failed to parse Feishu message:', error);
            return null;
        }
    }
}
exports.FeishuBridge = FeishuBridge;
