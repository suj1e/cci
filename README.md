# CCI - Claude CLI 飞书桥

通过飞书远程操控本地 Claude CLI，随时随地使用 Claude Code 进行开发。

## 功能特性

- **远程操控** - 在飞书中发送消息，本地 Claude CLI 执行并实时返回结果
- **流式响应** - 内容累积发送（200字符/500ms），体验流畅
- **精美格式** - OpenClaw 风格卡片消息，完美渲染 Markdown、代码块、表格
- **智能过滤** - 过滤终端 UI 元素（spinner、框架等），只保留实质内容
- **双向操作** - 启动后可在本地终端和飞书中同时操作 Claude CLI

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
5. PTY 输出经过过滤后流式返回
6. Bridge 格式化后发送到飞书

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
│   │       │   ├── bridge.ts      # 核心消息路由
│   │       │   ├── feishuClient.ts # 飞书 WebSocket 客户端
│   │       │   └── localServer.ts # 本地 WebSocket 服务
│   │       ├── protocol/          # 消息协议转换
│   │       ├── utils/
│   │       │   └── outputFormatter.ts # 输出格式化
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
│               └── ClaudeUiDetector.ts   # UI 元素检测
│
├── package.json
└── pnpm-workspace.yaml
```

## 核心模块

### 输出过滤器 (cli-client/filter)

CLI Client 使用多层过滤机制清理 PTY 输出：

1. **VirtualTerminal** - 虚拟终端模拟器，处理光标移动、文本覆盖等
2. **InputTracker** - 输入追踪，检测并过滤本地输入回显
3. **AnsiParser** - ANSI 转义序列解析
4. **ClaudeUiDetector** - 检测并过滤 Claude CLI 的 UI 元素：
   - Spinner 动画字符
   - 终端框架制表符
   - 快捷键提示
   - 状态提示符

### 输出格式化 (bridge/utils)

OutputFormatter 负责将清理后的内容转换为飞书格式：

- **ANSI 清理** - 移除所有终端转义序列
- **Markdown 美化** - 标题添加 emoji（# → 📌，## → ✨）
- **智能拆分** - 超长内容按段落/句子拆分为多张卡片
- **格式选择** - 代码块/表格/长内容使用卡片格式，短文本使用 Post 格式

### 消息协议

WebSocket 消息类型（`BridgeMessage`）：

| 类型 | 方向 | 说明 |
|------|------|------|
| `user_message` | Bridge → CLI | 用户消息 |
| `stream_chunk` | CLI → Bridge | 流式输出块 |
| `stream_end` | CLI → Bridge | 流结束标记 |
| `ping/pong` | 双向 | 心跳 |

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

## License

MIT
