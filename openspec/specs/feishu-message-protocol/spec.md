# Feishu Message Protocol

## Requirements

### Requirement: Feishu message format conversion
桥接服务 SHALL 实现消息格式转换，支持 markdown、代码块等格式在飞书和 CLI 之间正确显示。

#### Scenario: Markdown format support
- **WHEN** CLI 输出 markdown 格式内容
- **THEN** 桥接服务自动转换为飞书支持的富文本格式，正确显示标题、列表、链接等
#### Scenario: Code block format support
- **WHEN** CLI 输出代码块
- **THEN** 桥接服务自动转换为飞书代码块格式，保留语法高亮和格式

### Requirement: Streaming response support
桥接服务 SHALL 支持流式响应，将 CLI 的实时输出分片同步到飞书。

#### Scenario: Real-time streaming output
- **WHEN** CLI 生成流式响应
- **THEN** 桥接服务逐片将内容发送到飞书，用户可以实时看到响应生成过程
- **WHEN** 流式响应结束
- **THEN** 发送结束标记，飞书显示完整响应内容

### Requirement: Command support
桥接服务 SHALL 正确转发 CLI 命令，支持所有 Claude CLI 内置命令和技能调用。

#### Scenario: Command execution
- **WHEN** 用户在飞书发送 CLI 命令（如 `/opsx:ff`, `/tasks` 等）
- **THEN** 命令完整转发到 CLI 执行
- **THEN** 执行结果完整返回给飞书用户
