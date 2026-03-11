## Context

当前 Claude CLI 只能在本地终端使用，无法在移动端或其他设备访问。本设计实现飞书机器人桥接，将 Claude CLI 会话能力通过飞书开放给用户，实现随时随地访问。

项目使用 TypeScript 开发，pnpm 作为包管理器，采用 monorepo 结构，桥接服务独立发布，CLI 技能集成到现有 CCI 套件中。

## Goals / Non-Goals

**Goals:**
- 实现飞书机器人 WebSocket 长连接，实时接收用户消息
- 实现本地 WebSocket 服务，供 Claude CLI 连接
- 实现消息双向路由和格式转换
- 提供全局可安装的 CLI 工具，一键启动服务
- 提供 Claude CLI 技能，一键连接/断开服务
- 支持配置文件存储敏感信息
- 优先支持单会话模式，满足个人使用需求

**Non-Goals:**
- 多会话支持（后续迭代考虑）
- 群聊消息支持（优先单聊）
- 复杂权限控制（个人使用场景不需要）
- 公网暴露服务（所有连接均在本地完成）

## Decisions

1. **技术栈选择**：使用 TypeScript + Node.js 开发桥接服务，飞书官方 Node.js SDK (@larksuiteoapi/node-sdk) 实现 WebSocket 连接，原生 http/ws 模块实现本地服务，依赖最少，性能最优。
2. **通信协议**：桥接服务和 CLI 之间使用 WebSocket 协议，消息格式采用 JSON，包含消息类型、内容、会话ID等字段，实现简单，实时性好。
3. **配置存储**：配置文件存储在用户目录 `~/.feishu-bridge/config.yaml`，yaml 格式易读易编辑，支持注释。
4. **技能实现**：`/connect-feishu` 和 `/disconnect-feishu` 技能集成到 CCI 套件下，使用现有 Skill 框架实现，无需额外修改核心代码。

## Risks / Trade-offs

- **风险**：飞书 WebSocket 连接不稳定 →  mitigation：实现自动重连机制，最大重试 5 次，失败后提示用户检查网络和配置。
- **风险**：敏感信息（app-secret）泄露 → mitigation：配置文件权限设置为 600，仅用户本人可读，不在日志中输出敏感信息。
- **风险**：消息路由混乱 → mitigation：单会话模式下同一时间只允许一个 CLI 连接，消息队列按顺序处理，避免乱序。
- **权衡**：优先实现单会话模式 → 牺牲多用户能力，换取实现简单、稳定可靠，满足个人使用核心需求。
