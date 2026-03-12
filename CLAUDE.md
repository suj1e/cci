# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CCI (Claude CLI Feishu Bridge) enables remote control of a local Claude CLI through Feishu messaging. It consists of two packages:

- **bridge** (`claude-feishu-bridge`) - Feishu bot integration server
- **cli-client** (`fclaude`) - PTY wrapper for Claude CLI with semantic event extraction

## Architecture

```
Feishu Bot <--WebSocket Long Poll--> Bridge Server <--WebSocket--> CLI Client (PTY) --> Claude CLI
```

Message flow:
1. User sends message to Feishu bot
2. Bridge receives via Feishu WebSocket long connection
3. Bridge forwards to connected CLI client
4. CLI client writes to PTY (Claude CLI)
5. PTY output is parsed for semantic events and filtered
6. Bridge formats as Feishu cards and sends

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

# Run tests
cd packages/bridge && pnpm test
```

## Key Files

### Bridge Package

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry point with start/stop/config/logs commands |
| `src/server/bridge.ts` | Core message routing, state machine, card management |
| `src/server/feishuClient.ts` | Feishu WebSocket/API client, card callbacks |
| `src/server/localServer.ts` | Local WebSocket server for CLI client |
| `src/utils/outputFormatter.ts` | ANSI cleaning, Feishu card templates, content splitting |
| `src/protocol/messageConverter.ts` | Markdown to Feishu format conversion |
| `src/config/config.ts` | Config file management (~/.feishu-bridge/config.yaml) |
| `src/types.ts` | Strongly typed message interfaces |

### CLI Client Package

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry point, argument passthrough to claude |
| `src/client.ts` | PTY wrapper, WebSocket connection, data flow setup |
| `src/filter/PtyOutputFilter.ts` | Main filter orchestrating all filtering layers |
| `src/filter/VirtualTerminal.ts` | Virtual terminal emulator for cursor handling |
| `src/filter/InputTracker.ts` | Track user input for echo detection |
| `src/filter/AnsiParser.ts` | Parse ANSI escape sequences |
| `src/filter/ClaudeUiDetector.ts` | Extract semantic events from Claude CLI output |
| `src/types.ts` | Client message types |

## Message Types (packages/bridge/src/types.ts)

Strongly typed interfaces extending `BaseMessage` with `type`, `id`, `timestamp`:

| Category | Types | Description |
|----------|-------|-------------|
| Basic | `user_message`, `cli_response`, `stream_chunk`, `stream_end`, `ping`, `pong` | Core communication |
| Thinking | `thinking_start`, `thinking_end`, `text_start` | Claude's thinking phase |
| Tools | `tool_call`, `tool_result` | Tool execution tracking |
| Prompts | `ask_user`, `prompt_confirm`, `prompt_permission`, `prompt_choice`, `prompt_plan` | Interactive prompts |
| Status | `skill_loading`, `mcp_loading`, `compacting`, `subagent_start`, `subagent_stop` | System state events |
| Hooks | `hook_blocked`, `hook_warning`, `notification` | Hook events |
| Errors | `error_api`, `error_tool` | Error handling |
| Other | `command_echo`, `context_info`, `diff_content` | Additional events |

## State Machine (bridge.ts)

```
idle → thinking → tool_calling → [prompt?] → streaming → idle
```

- **Phase tracking**: Maintains current response phase for proper card updates
- **Status card**: Single card patched throughout response lifecycle
- **Tool records**: Tracks tool calls with emoji, description, status, and results
- **Patch throttling**: 500ms throttle on card updates
- **Flush debouncing**: 600ms debounce on streaming content

## Semantic Event Detection (ClaudeUiDetector)

Extracts structured events from PTY output:

### Tool Detection Patterns
- Bash, Grep, Glob, LS, Read, Edit, MultiEdit, Write
- WebSearch, WebFetch, TodoRead, TodoWrite
- NotebookRead, NotebookEdit, Agent, Task, Skill
- ExitPlanMode, Sleep, LSP, MCP tools (`mcp__server__method`)

### Other Events
- **Thinking**: `Thinking...`, `Brewing...`, `(thinking)`, etc.
- **Prompts**: y/n confirmations, permission requests, multi-choice, plan approval
- **Status**: Skill loading, MCP server connections, compacting, subagent start/stop
- **Hooks**: Blocked/warning notifications
- **Errors**: API errors (rate limit, context full), tool errors
- **Noise**: Spinner chars, box drawing, block elements, UI hints

## Feishu Card Formatting (outputFormatter.ts)

### Schema 2.0 Cards
- Header with title and color template (blue/green/red/yellow/orange/grey)
- Body with markdown, hr, collapsible_panel, action elements
- Interactive buttons with callback behaviors

### Card Templates
- `buildThinkingCard()` - Thinking indicator
- `buildToolCard()` - Tool calls with collapsible results
- `buildPromptConfirmCard()` - y/n confirmation with buttons
- `buildPromptPermissionCard()` - Permission request with Allow/Deny
- `buildPromptChoiceCard()` - Multi-choice with option buttons
- `buildPromptPlanCard()` - Plan approval with steps
- `buildErrorCard()`, `buildApiErrorCard()` - Error displays
- `buildDiffCard()` - Code diff preview

### Content Splitting
- Max card length: 3000 characters
- Split by paragraphs, preserve code blocks

## Configuration (~/.feishu-bridge/config.yaml)

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

- **Bidirectional operation**: Local stdin preserved for simultaneous local/remote use
- **Input echo filtering**: CLI client filters local/remote input echo from PTY output
- **Incremental sending**: Only new lines sent to avoid duplicates
- **State machine**: Bridge tracks phase for proper card updates
- **Strong typing**: Use specific interfaces (e.g., `ToolCallMessage`) not generic `BridgeMessage`
- **Graceful degradation**: Card format falls back to Post format
- **Daemon mode**: Bridge runs as background process with PID file tracking
- **Button callbacks**: Interactive prompts mapped to PTY input via action callbacks

## Action Callback Mapping (bridge.ts)

```typescript
const ACTION_MAP = {
  confirm:    { y: 'y\r', n: 'n\r' },
  permission: { '1': '1\r', '2': '2\r', '3': '3\r' },
  choice:     { '1': '1\r', '2': '1\r', ... },
  plan:       { y: 'y\r', n: 'n\r' },
};
```

## Testing

```bash
# Run bridge tests
cd packages/bridge && pnpm test

# Health check
curl http://localhost:8989/health
```
