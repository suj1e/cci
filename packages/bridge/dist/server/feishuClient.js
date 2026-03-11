"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuClient = void 0;
const node_sdk_1 = require("@larksuiteoapi/node-sdk");
const logger_1 = require("../logger");
class FeishuClient {
    client;
    wsClient;
    eventDispatcher;
    options;
    isConnected = false;
    retryCount = 0;
    maxRetries = 5;
    reconnectTimer = null;
    logger = logger_1.Logger.getInstance();
    constructor(options) {
        this.options = options;
        this.client = new node_sdk_1.Client({
            appId: options.appId,
            appSecret: options.appSecret,
            disableTokenCache: false
        });
        this.eventDispatcher = new node_sdk_1.EventDispatcher({
            encryptKey: '',
        });
        this.wsClient = new node_sdk_1.WSClient({
            appId: options.appId,
            appSecret: options.appSecret,
            autoReconnect: true
        });
    }
    async connect() {
        try {
            this.logger.info('Connecting to Feishu WebSocket...');
            this.eventDispatcher.register({
                'im.message.receive_v1': async (data) => {
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
        }
        catch (error) {
            this.logger.error('Feishu connection failed:', error);
            this.isConnected = false;
            this.retryCount++;
            if (this.retryCount <= this.maxRetries) {
                this.scheduleReconnect();
            }
            throw error;
        }
    }
    disconnect() {
        this.isConnected = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        try {
            this.wsClient.close();
        }
        catch (error) {
            this.logger.error('Error closing Feishu WebSocket:', error);
        }
        if (this.options.onDisconnected) {
            this.options.onDisconnected();
        }
    }
    async sendMessage(userId, content) {
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
            }
            else {
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
        }
        catch (error) {
            this.logger.error('Failed to send message to Feishu:', error);
            throw error;
        }
    }
    isClientConnected() {
        return this.isConnected;
    }
    scheduleReconnect() {
        const delay = Math.min(this.retryCount * 5000, 30000);
        this.logger.warn(`Reconnecting in ${delay / 1000} seconds...`);
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch((error) => {
                this.logger.error('Reconnect failed:', error);
            });
        }, delay);
    }
}
exports.FeishuClient = FeishuClient;
