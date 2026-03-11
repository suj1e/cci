"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalServer = void 0;
const http_1 = __importDefault(require("http"));
const ws_1 = __importStar(require("ws"));
const messageConverter_1 = require("../protocol/messageConverter");
const logger_1 = require("../logger");
class LocalServer {
    server;
    wss;
    cliConnection = null;
    options;
    isRunning = false;
    logger = logger_1.Logger.getInstance();
    constructor(options) {
        this.options = options;
        this.server = http_1.default.createServer(this.handleHttpRequest.bind(this));
        this.wss = new ws_1.WebSocketServer({ server: this.server, path: '/cli' });
    }
    getPort() {
        const address = this.server.address();
        if (address && typeof address === 'object') {
            return address.port;
        }
        return this.options.port;
    }
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server.listen(this.options.port, () => {
                    this.isRunning = true;
                    this.logger.info(`Local server listening on port ${this.options.port}`);
                    this.setupWebSocketHandlers();
                    resolve();
                });
                this.server.on('error', (error) => {
                    this.logger.error('Local server error:', error);
                    reject(error);
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            if (this.cliConnection) {
                this.cliConnection.close();
                this.cliConnection = null;
            }
            this.wss.close((error) => {
                if (error) {
                    this.logger.error('Error closing WebSocket server:', error);
                }
            });
            this.server.close((error) => {
                this.isRunning = false;
                if (error) {
                    this.logger.error('Error closing HTTP server:', error);
                    reject(error);
                }
                else {
                    this.logger.info('Local server stopped');
                    resolve();
                }
            });
        });
    }
    sendToCli(message) {
        if (this.cliConnection && this.cliConnection.readyState === ws_1.default.OPEN) {
            this.cliConnection.send(JSON.stringify(message));
        }
        else {
            this.logger.warn('No CLI connection available, message not sent');
        }
    }
    hasCliConnection() {
        return this.cliConnection !== null && this.cliConnection.readyState === ws_1.default.OPEN;
    }
    handleHttpRequest(req, res) {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({
                status: 'ok',
                hasCliConnection: this.hasCliConnection()
            }));
        }
        else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    }
    setupWebSocketHandlers() {
        this.wss.on('connection', (ws) => {
            this.logger.info('New CLI connection attempt');
            if (this.cliConnection && this.cliConnection.readyState === ws_1.default.OPEN) {
                this.logger.warn('Rejecting new CLI connection - session already exists');
                ws.close(1008, 'Session already exists');
                return;
            }
            this.cliConnection = ws;
            this.logger.info('CLI connected successfully');
            if (this.options.onCliConnect) {
                this.options.onCliConnect();
            }
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleCliMessage(message);
                }
                catch (error) {
                    this.logger.error('Failed to parse message from CLI:', error);
                }
            });
            ws.on('close', () => {
                this.logger.info('CLI disconnected');
                this.cliConnection = null;
                if (this.options.onCliDisconnect) {
                    this.options.onCliDisconnect();
                }
            });
            ws.on('error', (error) => {
                this.logger.error('CLI connection error:', error);
            });
        });
    }
    handleCliMessage(message) {
        switch (message.type) {
            case 'ping':
                this.sendToCli({
                    type: 'pong',
                    id: messageConverter_1.MessageConverter.generateId(),
                    timestamp: Date.now()
                });
                break;
            case 'cli_response':
            case 'stream_chunk':
            case 'stream_end':
                if (this.options.onMessageFromCli) {
                    this.options.onMessageFromCli(message);
                }
                break;
            default:
                this.logger.debug('Received unknown message type:', message.type);
        }
    }
}
exports.LocalServer = LocalServer;
