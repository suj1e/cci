# Feishu Bridge Server

## Requirements

### Requirement: Global installable bridge service
桥接服务 SHALL 支持通过 pnpm/npm 全局安装，安装后可通过 `feishu-bridge` 命令全局调用。

#### Scenario: Install and run bridge
- **WHEN** 用户执行 `pnpm add -g claude-feishu-bridge`
- **THEN** 系统全局安装 `feishu-bridge` 命令
- **WHEN** 用户执行 `feishu-bridge --version`
- **THEN** 输出当前安装的版本号

### Requirement: Configuration file support
桥接服务 SHALL 自动读取 `~/.feishu-bridge/config.yaml` 配置文件，支持存储 app-id、app-secret、监听端口等配置。

#### Scenario: Read configuration from file
- **WHEN** 配置文件存在且包含 `appId`、`appSecret` 字段
- **THEN** 启动服务时不需要额外传入参数，自动读取配置
- **WHEN** 配置文件不存在或字段缺失
- **THEN** 启动时提示用户配置或通过命令行参数传入

### Requirement: Feishu WebSocket connection
桥接服务 SHALL 通过飞书官方 WebSocket 接口连接飞书机器人，实时接收单聊消息。

#### Scenario: Connect to Feishu WebSocket
- **WHEN** 用户执行 `feishu-bridge start` 且配置正确
- **THEN** 服务成功连接飞书 WebSocket 服务
- **WHEN** 连接断开
- **THEN** 服务自动重试重连，最多重试 5 次

### Requirement: Local API server
桥接服务 SHALL 在本地启动 API 服务（默认端口 8989），提供 WebSocket 接口供 Claude CLI 连接。

#### Scenario: CLI connection
- **WHEN** Claude CLI 发起 WebSocket 连接到 `ws://localhost:8989/cli`
- **THEN** 桥接服务接受连接，建立双向通信通道
- **WHEN** 已有 CLI 连接时新的连接请求到达
- **THEN** 拒绝新连接，提示已有会话连接

### Requirement: Message routing
桥接服务 SHALL 实现飞书和 CLI 之间的消息双向路由转发。

#### Scenario: Forward Feishu message to CLI
- **WHEN** 桥接服务收到飞书单聊消息
- **THEN** 自动将消息内容转发给已连接的 CLI
#### Scenario: Forward CLI response to Feishu
- **WHEN** 桥接服务收到 CLI 输出的消息
- **THEN** 自动将消息发送到对应的飞书聊天会话
