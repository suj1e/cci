## Context

当前架构：
- `feishu-bridge` 服务运行在 `localhost:8989`，提供 WebSocket 端点 `/cli`
- 飞书用户消息通过 bridge 转发，但缺少 CLI 端客户端连接
- 需要一个 PTY 包装器来拦截 Claude CLI 的 I/O 并与 bridge 双向同步

约束：
- 单会话模式（一个机器人，一个 CLI 连接）
- 使用 Node.js + TypeScript
- 使用 `node-pty` 处理伪终端
- 使用 `ws` 作为 WebSocket 客户端

## Goals / Non-Goals

**Goals:**
- 实现 `fclaude` 命令，包装 Claude CLI
- 自动连接 feishu-bridge（无需手动 connect/disconnect）
- 支持 `--continue` 参数
- 双向实时同步

**Non-Goals:**
- 多会话支持
- `--model` 参数支持（透传给 claude 即可，不需要单独处理）
- 连接状态动态切换（启动即连接，退出即断开）

## Decisions

### 1. 项目结构

**决定**: 新建 `packages/cli-client/` 作为独立包

**理由**:
- 与 `packages/bridge/` 职责分离
- 可独立发布和安装
- 便于单独测试

### 2. PTY vs 直接 stdin/stdout

**决定**: 使用 `node-pty` 创建伪终端

**理由**:
- PTY 能正确处理交互式程序（如 claude CLI）
- 保持终端特性（颜色、光标位置等）
- 直接 stdin/stdout 无法处理全屏 TUI 应用

**备选方案**:
- `child_process.spawn` + stdin/stdout pipe：无法处理交互式 UI
- 包装 shell 脚本：功能受限，难以精细控制

### 3. 消息注入方式

**决定**: 通过 `pty.write()` 注入飞书消息

**理由**:
- PTY 的 write 方法模拟用户输入
- Claude CLI 会将其当作正常用户输入处理
- 简单可靠

### 4. 输出拦截

**决定**: 监听 `pty.onData()` 事件

**理由**:
- 获取所有 Claude 输出（包括 ANSI 转义序列）
- 同时写入本地 stdout 和发送到 bridge
- 实时流式传输

### 5. 参数透传

**决定**: 未识别的参数直接透传给 `claude` 命令

**理由**:
- 保持与 claude CLI 的兼容性
- 用户可以使用 `--continue`、`--print` 等所有 claude 参数
- 减少维护负担

## Risks / Trade-offs

### Risk: node-pty 原生模块编译
→ **Mitigation**: 在 package.json 中明确 Node.js 版本要求，提供预编译指南

### Risk: ANSI 转义序列在飞书中显示异常
→ **Mitigation**: bridge 端已有 `MessageConverter.markdownToFeishuPost()` 处理，发送前可剥离 ANSI

### Risk: 网络延迟导致消息顺序混乱
→ **Mitigation**: 使用消息 ID 和时间戳，bridge 端已支持

### Trade-off: 单会话限制
→ 可接受，符合当前需求（一个机器人）

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         fclaude                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │   stdin     │────▶│             │────▶│   PTY       │      │
│   │  (用户输入) │     │  fclaude    │     │  (claude)   │      │
│   └─────────────┘     │   main()    │     └──────┬──────┘      │
│                       │             │            │              │
│   ┌─────────────┐     │  ┌───────┐  │            │              │
│   │  WebSocket  │◀────┼──│  WS   │◀─┼────────────┘              │
│   │  Client     │     │  │ Client│  │    onData → stdout        │
│   └──────┬──────┘     │  └───────┘  │                + WS send  │
│          │            └─────────────┘                            │
│          │                                                       │
│          ▼                                                       │
│   ws://localhost:8989/cli                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
packages/cli-client/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 入口
│   ├── cli.ts            # 命令行参数解析
│   ├── client.ts         # 主逻辑：PTY + WebSocket
│   └── types.ts          # 类型定义
└── dist/
    └── ...
```
