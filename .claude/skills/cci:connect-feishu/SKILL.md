---
name: cci:connect-feishu
description: Connect to Feishu bridge for Claude Code integration. Detects existing bridge processes, starts new bridge if needed, and enables bidirectional message forwarding between Feishu and Claude CLI. Trigger with /connect-feishu or phrases like "connect feishu", "start feishu bridge".
license: MIT
compatibility: Requires Feishu bridge service running on localhost:8989.
metadata:
  author: cci
  version: "1.0"
  generatedBy: "1.1.1"
---

# Connect-Feishu - Feishu Bridge Connector

Establish bidirectional message forwarding between Feishu robot and Claude CLI session.

## Quick Start

```
/connect-feishu
```

Or simply say:
```
连接飞书
启动飞书桥接
```

## Core Features

### 1. Bridge Service Detection
- Automatically detect running Feishu bridge service on port 8989
- If service not running, prompt to start it first with `feishu-bridge start`
- Display service status and connection information

### 2. Establish WebSocket Connection
- Connect to bridge service WebSocket endpoint at `ws://localhost:8989/cli`
- Enable bidirectional message forwarding:
  - Feishu messages → Forward to Claude CLI as user input
  - Claude CLI output → Forward to Feishu chat in real-time

### 3. Streaming Response Support
- Support real-time streaming response from Claude CLI to Feishu
- Automatically convert markdown, code blocks, and formatted text to Feishu rich text format

### 4. Disconnect Command
Register `/disconnect-feishu` command for graceful shutdown:
- Close WebSocket connection
- Stop message forwarding
- Restore normal CLI operation

## Workflow

### Step 1: Check Bridge Service Status
```
## Feishu Bridge Status Check

Checking for Feishu bridge service on localhost:8989...

✅ Bridge service is running
✅ Connection established
📡 Message forwarding enabled
```

### Step 2: Start Bridge (if not running)
```
⚠️  Feishu bridge service not found. Please start it first:
```bash
feishu-bridge start
```
```

### Step 3: Connection Confirmation
```
✅ Successfully connected to Feishu bridge!
Now you can chat with Claude directly in Feishu.
All messages will be synchronized between Feishu and this CLI session.

Use /disconnect-feishu to stop forwarding.
```

## Related Commands
- `/disconnect-feishu` - Disconnect from Feishu bridge and stop message forwarding
