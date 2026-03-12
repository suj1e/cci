# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CCI (Claude CLI Feishu Bridge) enables remote control of a local Claude CLI through Feishu (飞书) messaging. It consists of two packages that communicate via WebSocket:

- **bridge** - Feishu bot integration server
- **cli-client** (fclaude) - PTY wrapper for Claude CLI

## Architecture

```
Feishu Bot <--WebSocket--> Bridge Server <--WebSocket--> CLI Client (PTY) --> Claude CLI
```

Message flow:
1. User sends message to Feishu bot
2. Bridge receives via Feishu WebSocket long connection
3. Bridge forwards to connected CLI client
4. CLI client writes to PTY (Claude CLI)
5. PTY output streams back through the chain
6. Bridge formats and sends to Feishu

## Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build specific package
cd packages/bridge && pnpm build
cd packages/cli-client && pnpm build

# Start bridge service (for testing)
cd packages/bridge && node dist/cli.js start

# Start CLI client (requires running bridge)
cd packages/cli-client && node dist/cli.js
```

## Key Files

- `packages/bridge/src/server/bridge.ts` - Core message routing logic, stream accumulation
- `packages/bridge/src/server/feishuClient.ts` - Feishu WebSocket/API client
- `packages/bridge/src/server/localServer.ts` - Local WebSocket server for CLI client
- `packages/bridge/src/utils/outputFormatter.ts` - ANSI cleaning, Feishu card formatting
- `packages/cli-client/src/client.ts` - PTY wrapper, input echo filtering

## Message Types (packages/bridge/src/types.ts)

- `user_message` - From Feishu to CLI
- `stream_chunk` - CLI output chunks
- `stream_end` - End of CLI response
- `ping/pong` - Heartbeat

## Feishu Message Formatting

The `OutputFormatter` class handles:

1. **ANSI/control character stripping** - Terminal escape sequences, backspace, etc.
2. **Claude CLI prefix removal** - `Claude>`, `Thinking...`, `Generating...`
3. **Smart content splitting** - Long content split by paragraph/sentence (1800 char limit)
4. **Card vs Post format selection** - Code blocks/tables/long content use interactive cards
5. **Title emoji beautification** - `#` → 📌, `##` → ✨

Card format uses `lark_md` tag for Markdown rendering. Post format uses `md` tag.

## Configuration

Bridge config stored at `~/.feishu-bridge/config.yaml`:
```yaml
appId: YOUR_APP_ID
appSecret: YOUR_APP_SECRET
port: 8989
logLevel: info
notifyUserIds:
  - ou_xxx  # Feishu user open_id for notifications
```

## Important Patterns

- **Stream accumulation**: Content accumulates until 200 chars or 500ms timeout before sending to Feishu
- **Input echo filtering**: CLI client filters local input echo from PTY output
- **Multiple cards**: Long messages automatically split into multiple numbered cards (1/3, 2/3, etc.)
