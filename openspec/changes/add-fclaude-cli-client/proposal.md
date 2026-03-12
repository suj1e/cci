## Why

用户希望在飞书和 CLI 两边都能使用 Claude，实现双向实时同步。当前 feishu-bridge 已提供中间桥接服务，但缺少 CLI 端的客户端连接器。用户需要一种简单的方式启动带飞书同步的 Claude 会话。

## What Changes

- 新增 `fclaude` 命令 - PTY 包装器，自动连接 feishu-bridge
- 启动时自动建立 WebSocket 连接到 `ws://localhost:8989/cli`
- 支持 `--continue` 参数继续上次会话
- 双向同步：
  - 飞书消息 → 注入 PTY → Claude 处理
  - Claude 输出 → WebSocket → 飞书显示
- 退出即断开连接

## Capabilities

### New Capabilities

- `cli-client`: fclaude 命令行工具，PTY 包装器实现 Claude CLI 与飞书 bridge 的双向通信

### Modified Capabilities

无

## Impact

- **新增包**: `packages/cli-client/`
- **依赖**: `node-pty` (PTY 支持), `ws` (WebSocket 客户端)
- **命令**: `fclaude` 全局命令
- **配合**: 需要运行 `feishu-bridge` 服务
