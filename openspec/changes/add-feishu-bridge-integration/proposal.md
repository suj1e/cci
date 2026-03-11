## Why

解决 Claude CLI 只能在终端使用的限制，通过飞书机器人桥接实现随时随地通过飞书访问 Claude CLI 会话，获得和终端完全一致的开发体验，支持远程操控本地开发环境，无需打开终端即可完成代码阅读、修改、命令执行等操作。

## What Changes

- 新增全局可安装的 `claude-feishu-bridge` 服务，通过 WebSocket 连接飞书机器人
- 新增两个 CCI 套件技能：`/connect-feishu` 和 `/disconnect-feishu`，用于打通 Claude CLI 会话和桥接服务
- 实现实时消息路由，支持流式响应输出，飞书消息格式自动适配（markdown、代码块等）
- 支持配置文件存储飞书应用凭证，无需每次启动重复输入参数
- 优先实现单会话模式，满足个人使用场景

## Capabilities

### New Capabilities
- `feishu-bridge-server`: 独立桥接服务，支持全局安装、启动/停止、配置文件读取、飞书 WebSocket 连接、消息转发
- `feishu-cli-integration`: Claude CLI 飞书集成技能，支持一键连接/断开桥接服务，会话消息双向路由
- `feishu-message-protocol`: 飞书消息协议适配，支持 markdown、代码块、流式响应格式转换

### Modified Capabilities
- 无现有能力修改

## Impact

- 新增依赖：飞书官方 Node.js SDK (@larksuiteoapi/node-sdk)
- 新增系统服务：桥接服务默认在本地端口 8989 运行
- 新增配置文件：`~/.feishu-bridge/config.yaml` 存储敏感配置
- 不影响现有功能，完全向后兼容
