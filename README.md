# CCI - Claude CLI 飞书桥

通过飞书远程操控本地 Claude CLI，随时随地使用 Claude Code 进行开发。

## 功能特性

- **远程操控** - 在飞书中发送消息，本地 Claude CLI 执行并实时返回结果
- **流式响应** - 内容累积发送，体验流畅
- **交互卡片** - 确认、权限、多选等交互通过飞书卡片按钮完成
- **多媒体支持** - 支持发送图片和文件给 Claude 分析
- **精美格式** - 飞书 Schema 2.0 卡片，完美渲染 Markdown、代码块、表格
- **智能过滤** - 过滤终端 UI 元素（spinner、框架等），只保留实质内容
- **双向操作** - 启动后可在本地终端和飞书中同时操作 Claude CLI
- **Diff 预览** - 代码变更以 diff 格式高亮展示

## 架构

```
┌────────────┐    WebSocket     ┌────────────┐    WebSocket     ┌────────────┐
│  飞书机器人  │ ◄──────────────► │   Bridge   │ ◄──────────────► │ CLI Client │
│            │   长连接          │   Server   │                  │   (PTY)    │
└────────────┘                  └────────────┘                  └─────┬──────┘
                                                                       │
                                                                       ▼
                                                                ┌────────────┐
                                                                │ Claude CLI │
                                                                └────────────┘
```

**消息流程：**
1. 用户在飞书发送消息给机器人
2. Bridge 通过飞书 WebSocket 长连接接收消息
3. Bridge 转发给已连接的 CLI Client
4. CLI Client 写入 PTY（Claude CLI）
5. PTY 输出经过语义解析和过滤后流式返回
6. Bridge 格式化为飞书卡片并发送

## 快速开始

### 1. 安装

```bash
git clone https://github.com/suj1e/cci.git
cd cci
pnpm install
pnpm build
```

### 2. 配置飞书应用

在 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用：

1. 创建应用，获取 `App ID` 和 `App Secret`
2. 开启**机器人**功能
3. 订阅事件：`im.message.receive_v1`
4. 配置**使用长连接接收事件**
5. 添加卡片消息回调权限

### 3. 配置 Bridge

```bash
feishu-bridge config --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
```

配置文件位于 `~/.feishu-bridge/config.yaml`

### 4. 启动服务

```bash
# 终端 1: 启动 Bridge（守护进程模式）
feishu-bridge start -d

# 终端 2: 启动 CLI Client
fclaude
```

现在可以在飞书中与机器人对话了！

## 命令参考

### Bridge 服务

```bash
feishu-bridge start [-d]      # 启动服务（-d 后台运行）
feishu-bridge stop            # 停止服务
feishu-bridge restart [-d]    # 重启服务
feishu-bridge status          # 查看状态
feishu-bridge config          # 配置凭证
feishu-bridge logs [-f]       # 查看日志（-f 实时跟踪）
```

### CLI 客户端

```bash
fclaude                       # 启动客户端
fclaude --help                # 查看帮助
fclaude --dangerously-skip-permissions  # 透传参数给 claude
```

### 健康检查

```bash
curl http://localhost:8989/health
# {"status":"ok","hasCliConnection":true}
```

## 配置说明

配置文件：`~/.feishu-bridge/config.yaml`

```yaml
appId: YOUR_APP_ID
appSecret: YOUR_APP_SECRET
port: 8989
logLevel: info
notifyUserIds:           # 接收通知的用户 open_id
  - ou_xxx
notifyOnStartup: true    # 服务启动时通知
notifyOnConnection: true # CLI 连接时通知
notifyOnDisconnection: true # CLI 断开时通知
```

## 项目结构

```
cci/
├── packages/
│   ├── bridge/                    # 飞书桥接服务
│   │   └── src/
│   │       ├── cli.ts             # CLI 入口
│   │       ├── config/            # 配置管理
│   │       ├── server/
│   │       │   ├── bridge.ts      # 核心消息路由 + 状态机
│   │       │   ├── feishuClient.ts # 飞书 WebSocket/API 客户端
│   │       │   └── localServer.ts # 本地 WebSocket 服务
│   │       ├── protocol/          # 消息协议转换
│   │       ├── utils/
│   │       │   └── outputFormatter.ts # 输出格式化 + 卡片模板
│   │       └── types.ts           # 类型定义
│   │
│   └── cli-client/                # CLI 客户端
│       └── src/
│           ├── cli.ts             # CLI 入口
│           ├── client.ts          # PTY 包装 + WebSocket
│           ├── types.ts           # 类型定义
│           └── filter/            # 输出过滤模块
│               ├── PtyOutputFilter.ts    # 过滤器主类
│               ├── VirtualTerminal.ts    # 虚拟终端模拟
│               ├── InputTracker.ts       # 输入追踪
│               ├── AnsiParser.ts         # ANSI 解析
│               └── ClaudeUiDetector.ts   # 语义事件检测
│
├── package.json
└── pnpm-workspace.yaml
```

## 核心模块

### 语义事件检测 (cli-client/filter/ClaudeUiDetector)

从 PTY 输出中提取语义事件：

- **工具调用**: Bash, Grep, Glob, Read, Edit, Write, WebSearch, Agent 等 20+ 工具
- **思考状态**: Thinking, Brewing, Puzzling 等
- **交互提示**: y/n 确认、权限请求、多选、计划审批
- **系统状态**: Skill 加载、MCP 服务器连接、对话压缩、子代理启动/停止
- **Hook 事件**: 拦截、警告通知
- **错误处理**: API 限流、上下文满、工具错误
- **噪声过滤**: Spinner 字符、终端框架、快捷键提示

### 输出格式化 (bridge/utils/outputFormatter)

将清理后的内容转换为飞书 Schema 2.0 卡片：

- **文本清理**: 移除 ANSI 转义序列和控制字符
- **智能拆分**: 超长内容按段落拆分为多张卡片（3000 字符限制）
- **格式选择**: 代码块/表格/长内容使用卡片格式，短文本使用 Post 格式
- **交互按钮**: 确认、权限、多选等提供可点击按钮

### 状态机 (bridge/server/bridge.ts)

Bridge 维护响应状态机：`idle → thinking → tool_calling → [prompt?] → streaming → idle`

- **实时状态卡片**: 显示当前思考/工具调用进度
- **Patch 节流**: 500ms 节流更新卡片
- **流式防抖**: 600ms 防抖发送内容

## 消息类型

| 类别 | 类型 | 说明 |
|------|------|------|
| 基础 | `user_message`, `cli_response`, `stream_chunk`, `stream_end`, `ping`, `pong` | 核心通信 |
| 思考 | `thinking_start`, `thinking_end`, `text_start` | Claude 思考阶段 |
| 工具 | `tool_call`, `tool_result` | 工具执行追踪 |
| 交互 | `ask_user`, `prompt_confirm`, `prompt_permission`, `prompt_choice`, `prompt_plan` | 交互提示 |
| 状态 | `skill_loading`, `mcp_loading`, `compacting`, `subagent_start`, `subagent_stop` | 系统状态 |
| Hook | `hook_blocked`, `hook_warning`, `notification` | Hook 事件 |
| 错误 | `error_api`, `error_tool` | 错误处理 |
| 其他 | `command_echo`, `context_info`, `diff_content` | 其他事件 |

## 技术栈

- **TypeScript** - 类型安全
- **Node.js** (>=18) - 运行环境
- **@larksuiteoapi/node-sdk** - 飞书官方 SDK
- **node-pty** - PTY 终端模拟
- **WebSocket (ws)** - 实时通信
- **commander** - CLI 框架

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 开发模式（监听）
pnpm dev:bridge
```

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 服务无法启动 | 检查端口 8989 是否被占用 |
| CLI 无法连接 | 确保 Bridge 服务正在运行 |
| 飞书无响应 | 检查应用权限、事件订阅配置 |
| 消息格式异常 | 查看日志 `feishu-bridge logs -f` |
| 按钮无响应 | 检查卡片回调权限配置 |

## License

MIT
