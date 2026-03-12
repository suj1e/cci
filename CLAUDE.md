# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CCI (Claude CLI Feishu Bridge) enables remote control of a local Claude CLI through Feishu messaging. It consists of two packages:

- **bridge** (`claude-feishu-bridge`) - Feishu bot integration server
- **cli-client** (`fclaude`) - PTY wrapper for Claude CLI with advanced output filtering

## Architecture

```
Feishu Bot <--WebSocket Long Poll--> Bridge Server <--WebSocket--> CLI Client (PTY) --> Claude CLI
```

Message flow:
1. User sends message to Feishu bot
2. Bridge receives via Feishu WebSocket long connection
3. Bridge forwards to connected CLI client
4. CLI client writes to PTY (Claude CLI)
5. PTY output is filtered and streamed back
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

# Start bridge service (foreground)
cd packages/bridge && node dist/cli.js start

# Start bridge service (daemon)
cd packages/bridge && node dist/cli.js start -d

# Start CLI client (requires running bridge)
cd packages/cli-client && node dist/cli.js

# View bridge logs
cd packages/bridge && node dist/cli.js logs -f
```

## Key Files

### Bridge Package

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry point with start/stop/config/logs commands |
| `src/server/bridge.ts` | Core message routing, stream accumulation, notification handling |
| `src/server/feishuClient.ts` | Feishu WebSocket/API client |
| `src/server/localServer.ts` | Local WebSocket server for CLI client |
| `src/utils/outputFormatter.ts` | ANSI cleaning, Feishu card/post formatting |
| `src/protocol/messageConverter.ts` | Markdown to Feishu format conversion |
| `src/config/config.ts` | Config file management (~/.feishu-bridge/config.yaml) |
| `src/types.ts` | Bridge message types and Feishu API types |

### CLI Client Package

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry point |
| `src/client.ts` | PTY wrapper, WebSocket connection, data flow setup |
| `src/filter/PtyOutputFilter.ts` | Main filter class orchestrating all filtering |
| `src/filter/VirtualTerminal.ts` | Virtual terminal emulator for cursor handling |
| `src/filter/InputTracker.ts` | Track user input for echo detection |
| `src/filter/AnsiParser.ts` | Parse ANSI escape sequences |
| `src/filter/ClaudeUiDetector.ts` | Detect and filter Claude CLI UI elements |
| `src/types.ts` | Client message types and options |

## Message Types

### Bridge Message Types (packages/bridge/src/types.ts)

| Type | Direction | Description |
|------|-----------|-------------|
| `user_message` | Feishu → CLI | User message from Feishu |
| `stream_chunk` | CLI → Feishu | Streaming output chunk |
| `stream_end` | CLI → Feishu | End of stream marker |
| `cli_response` | CLI → Feishu | Complete response |
| `ping/pong` | Bidirectional | Heartbeat |

### CLI Client Message Types (packages/cli-client/src/types.ts)

Extended message types including: `thinking_start`, `thinking_end`, `tool_call`, `tool_result`, `prompt_*`, `error_*`, etc.

## Output Filtering System

The CLI client uses a multi-layer filtering approach:

### PtyOutputFilter (Main Orchestrator)
1. Accumulates data for handling split ANSI sequences
2. Detects and filters input echo using InputTracker
3. Parses ANSI sequences using AnsiParser
4. Writes to VirtualTerminal for cursor handling
5. Extracts incremental content (new lines only)
6. Filters UI elements using ClaudeUiDetector
7. Final cleanup (control chars, excessive blank lines)

### ClaudeUiDetector (UI Element Filter)
Filters terminal UI artifacts:
- **Spinner characters**: ✢✶✻⠁⠂⠃... (100+ chars)
- **Box drawing chars**: ╭╮╰╯─│┌┐...
- **Block elements**: █▉▊▋▌▍▎▏░▒▓...
- **Prompt patterns**: `Claude>`, `Thinking...`, `Generating...`
- **Keybinding hints**: `[Ctrl+C]`, `[Ctrl+D]`

## Feishu Message Formatting

The `OutputFormatter` class (bridge) handles:

1. **ANSI/control character stripping** - All terminal escape sequences
2. **Claude CLI prefix removal** - `Claude>`, `Thinking...`, etc.
3. **Smart content splitting** - Long content split by paragraph/sentence (1800 char limit)
4. **Format selection**:
   - Card format (`lark_md` tag): Code blocks, tables, long content
   - Post format (`md` tag): Short plain text
5. **Title beautification** - `#` → 📌, `##` → ✨

## Stream Accumulation

Bridge accumulates content before sending to Feishu:
- **Threshold**: 200 characters
- **Timeout**: 500ms
- Content is buffered until either threshold is met

## Configuration

Bridge config stored at `~/.feishu-bridge/config.yaml`:
```yaml
appId: YOUR_APP_ID
appSecret: YOUR_APP_SECRET
port: 8989
logLevel: info
notifyUserIds:
  - ou_xxx  # Feishu user open_id for notifications
notifyOnStartup: true
notifyOnConnection: true
notifyOnDisconnection: true
```

## Important Patterns

- **Bidirectional operation**: Local stdin is preserved, allowing simultaneous local and remote operation
- **Input echo filtering**: CLI client filters local/remote input echo from PTY output
- **Incremental sending**: Only new lines are sent to avoid duplicate content
- **Graceful degradation**: Card format falls back to Post format, Post format falls back to plain text
- **Daemon mode**: Bridge can run as background process with PID file tracking

## Testing

```bash
# Run bridge tests
cd packages/bridge && pnpm test

# Health check
curl http://localhost:8989/health
```
