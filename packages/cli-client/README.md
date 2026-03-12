# fclaude

CLI client for Feishu-Claude bridge with PTY wrapper.

## Installation

```bash
# In cci project root
pnpm install

# Build
pnpm --filter fclaude build

# Global link
pnpm --filter fclaude link --global
```

## Usage

```bash
# Start new session
fclaude

# Continue last session
fclaude --continue

# Pass any claude arguments
fclaude --print "hello"
```

## Requirements

- Node.js >= 18
- feishu-bridge service running on localhost:8989

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Feishu    │◀───▶│feishu-bridge│◀───▶│  fclaude    │
│   App       │ WS  │  :8989      │ WS  │  (PTY)      │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   claude    │
                                        │   CLI       │
                                        └─────────────┘
```

## Features

- **Auto-connect**: Automatically connects to feishu-bridge on startup
- **Bidirectional sync**: Messages flow both ways in real-time
- **PTY wrapper**: Full terminal support (colors, cursor, etc.)
- **Argument passthrough**: All claude arguments work transparently
