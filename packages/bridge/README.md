# Feishu Bridge Service

A bridge service that connects Claude CLI to Feishu (飞书) for remote access and messaging.

## Features

- **WebSocket communication**: Real-time bidirectional communication between Feishu and Claude CLI
- **Markdown conversion**: Convert CLI markdown output to Feishu rich text with syntax highlighting
- **Streaming support**: Handle streaming responses from Claude with chunk processing
- **Single session management**: Ensure only one CLI connection at a time
- **Auto-reconnection**: Automatic reconnection for Feishu WebSocket
- **Configuration file support**: YAML configuration file for sensitive information

## Installation

```bash
# Global install
pnpm add -g claude-feishu-bridge
```

## Configuration

Before starting the bridge service, you need to create a configuration file:

```bash
feishu-bridge config
```

This will create a `~/.feishu-bridge/config.yaml` file with the following content:

```yaml
appId: 'your-app-id'
appSecret: 'your-app-secret'
port: 8989
logLevel: info
```

You need to replace `your-app-id` and `your-app-secret` with your actual Feishu app credentials.

## Usage

### Start the bridge service

```bash
feishu-bridge start
```

The service will start on port 8989 (default) and listen for connections from Claude CLI.

### Check status

```bash
feishu-bridge status
```

### Stop the service

Press `Ctrl+C` in the terminal where the service is running.

## Claude CLI Integration

The bridge service integrates with Claude CLI through the following skills:

1. **cci:connect-feishu**: Connect to the bridge service
2. **cci:disconnect-feishu**: Disconnect from the bridge service

### Connect from Claude CLI

```
/cci:connect-feishu
```

This will connect to the local bridge service and start message forwarding.

### Disconnect from Claude CLI

```
/cci:disconnect-feishu
```

This will disconnect and restore normal terminal behavior.

## Architecture

```
┌─────────┐      WebSocket      ┌──────────────┐      WebSocket      ┌──────┐
│  Feishu │ ◄─────────────────► │ Bridge       │ ◄─────────────────► │ CLI  │
│  User   │    (Feishu API)     │ Service      │    (localhost:8989) │      │
└─────────┘                     └──────────────┘                     └──────┘
```

## Development

```bash
# Clone repository
cd /path/to/repo

# Install dependencies
pnpm install

# Build packages
pnpm build

# Run in development mode
pnpm dev:bridge
```

## License

MIT
