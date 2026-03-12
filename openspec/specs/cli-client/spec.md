## ADDED Requirements

### Requirement: fclaude 命令启动

系统 SHALL 提供 `fclaude` 命令，启动带飞书同步的 Claude CLI 会话。

#### Scenario: 正常启动
- **WHEN** 用户运行 `fclaude`
- **AND** feishu-bridge 服务正在运行
- **THEN** 系统自动连接到 bridge
- **AND** 启动 Claude CLI 会话
- **AND** 显示连接成功信息

#### Scenario: bridge 未运行
- **WHEN** 用户运行 `fclaude`
- **AND** feishu-bridge 服务未运行
- **THEN** 系统显示错误信息 "请先启动 feishu-bridge"
- **AND** 退出并返回非零状态码

### Requirement: 参数透传

系统 SHALL 将未识别的命令行参数透传给 Claude CLI。

#### Scenario: 使用 --continue
- **WHEN** 用户运行 `fclaude --continue`
- **THEN** `--continue` 参数被传递给 Claude CLI
- **AND** 继续上次会话

#### Scenario: 使用 --print
- **WHEN** 用户运行 `fclaude --print "hello"`
- **THEN** 参数被传递给 Claude CLI
- **AND** 正常执行

### Requirement: 双向消息同步

系统 SHALL 实现 Claude CLI 与飞书的双向实时消息同步。

#### Scenario: 飞书消息转发到 CLI
- **WHEN** 飞书用户发送消息
- **AND** fclaude 会话正在进行
- **THEN** 消息通过 WebSocket 接收
- **AND** 消息被注入到 PTY
- **AND** Claude 处理该消息

#### Scenario: CLI 输出转发到飞书
- **WHEN** Claude 产生输出
- **THEN** 输出被 PTY 捕获
- **AND** 输出显示在本地终端
- **AND** 输出通过 WebSocket 发送到 bridge

### Requirement: 会话退出处理

系统 SHALL 在退出时正确清理资源。

#### Scenario: 用户主动退出
- **WHEN** 用户在 fclaude 会话中按 Ctrl+D 或输入 /exit
- **THEN** PTY 进程终止
- **AND** WebSocket 连接关闭
- **AND** bridge 收到断开通知

#### Scenario: bridge 连接断开
- **WHEN** WebSocket 连接意外断开
- **THEN** 系统显示断开通知
- **AND** Claude CLI 继续运行（仅本地模式）

### Requirement: 单会话模式

系统 SHALL 支持单会话模式，同一时间只允许一个 fclaude 连接。

#### Scenario: 尝试启动第二个会话
- **WHEN** 已有一个 fclaude 会话连接到 bridge
- **AND** 用户尝试启动第二个 fclaude
- **THEN** bridge 拒绝新连接
- **AND** 显示错误信息 "已有活跃会话"
