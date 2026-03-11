import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { MessageConverter } from '../protocol/messageConverter';
import { Logger } from '../logger';
import type { BridgeMessage } from '../types';

interface LocalServerOptions {
  port: number;
  onMessageFromCli?: (message: BridgeMessage) => void;
  onCliConnect?: () => void;
  onCliDisconnect?: () => void;
}

export class LocalServer {
  private server: http.Server;
  private wss: WebSocketServer;
  private cliConnection: WebSocket | null = null;
  private options: LocalServerOptions;
  private isRunning = false;
  private logger = Logger.getInstance();

  constructor(options: LocalServerOptions) {
    this.options = options;
    this.server = http.createServer(this.handleHttpRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.server, path: '/cli' });
  }

  getPort(): number {
    const address = this.server.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    return this.options.port;
  }

  start(): Promise<void> {
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
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): Promise<void> {
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
        } else {
          this.logger.info('Local server stopped');
          resolve();
        }
      });
    });
  }

  sendToCli(message: BridgeMessage): void {
    if (this.cliConnection && this.cliConnection.readyState === WebSocket.OPEN) {
      this.cliConnection.send(JSON.stringify(message));
    } else {
      this.logger.warn('No CLI connection available, message not sent');
    }
  }

  hasCliConnection(): boolean {
    return this.cliConnection !== null && this.cliConnection.readyState === WebSocket.OPEN;
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');
    
    if (req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        hasCliConnection: this.hasCliConnection()
      }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws) => {
      this.logger.info('New CLI connection attempt');

      if (this.cliConnection && this.cliConnection.readyState === WebSocket.OPEN) {
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
          const message = JSON.parse(data.toString()) as BridgeMessage;
          this.handleCliMessage(message);
        } catch (error) {
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

  private handleCliMessage(message: BridgeMessage): void {
    switch (message.type) {
      case 'ping':
        this.sendToCli({
          type: 'pong',
          id: MessageConverter.generateId(),
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
