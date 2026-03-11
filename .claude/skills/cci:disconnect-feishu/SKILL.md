---
name: cci:disconnect-feishu
description: Disconnect from Feishu bridge service, stop message forwarding, and clean up resources. Trigger with /disconnect-feishu or phrases like "disconnect feishu", "stop feishu bridge".
license: MIT
compatibility: Requires active connection to Feishu bridge service.
metadata:
  author: cci
  version: "1.0"
  generatedBy: "1.1.1"
---

# Disconnect-Feishu - Feishu Bridge Disconnector

Gracefully disconnect from Feishu bridge service and stop message forwarding.

## Quick Start

```
/disconnect-feishu
```

Or simply say:
```
断开飞书连接
停止飞书桥接
```

## Core Features

### 1. Close WebSocket Connection
- Gracefully close the WebSocket connection to bridge service
- Stop all message forwarding between Feishu and Claude CLI

### 2. Restore Normal CLI Operation
- Restore standard CLI input/output behavior
- Stop intercepting CLI output for Feishu forwarding

### 3. Clean Up Resources
- Release all connection resources
- Clear session state

## Workflow

### Step 1: Disconnect Confirmation
```
## Disconnecting from Feishu bridge...

✅ WebSocket connection closed
✅ Message forwarding stopped
✅ Normal CLI operation restored
```

### Step 2: If No Active Connection
```
⚠️  No active Feishu bridge connection found.
```

## Related Commands
- `/connect-feishu` - Connect to Feishu bridge service and enable message forwarding
