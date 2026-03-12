# Feishu CLI Integration

## Requirements

### Requirement: Connect Feishu skill
Claude CLI SHALL 提供 `/connect-feishu` 技能，用于一键连接本地运行的桥接服务。

#### Scenario: Connect to bridge service
- **WHEN** 用户在 Claude CLI 输入 `/connect-feishu`
- **THEN** 自动检测本地 8989 端口是否有桥接服务运行
- **WHEN** 桥接服务存在且可连接
- **THEN** 建立 WebSocket 连接，提示连接成功
- **WHEN** 桥接服务不存在
- **THEN** 提示用户先启动桥接服务

### Requirement: Disconnect Feishu skill
Claude CLI SHALL 提供 `/disconnect-feishu` 技能，用于断开与桥接服务的连接。

#### Scenario: Disconnect from bridge service
- **WHEN** 用户输入 `/disconnect-feishu`
- **THEN** 关闭与桥接服务的 WebSocket 连接
- **THEN** 停止消息转发，恢复终端正常输入输出模式

### Requirement: Message bidirectional routing
连接建立后，Claude CLI SHALL 实现消息双向路由。

#### Scenario: Receive Feishu message as input
- **WHEN** 桥接服务转发飞书用户消息到 CLI
- **THEN** CLI 将该消息作为用户输入处理，自动触发响应
#### Scenario: Send CLI output to Feishu
- **WHEN** CLI 生成输出内容（包括流式响应、工具调用结果等）
- **THEN** 自动将所有输出内容转发到桥接服务
