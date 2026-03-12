# CCI - Claude CLI Feishu Bridge

将 Claude CLI 的强大能力带入飞书，通过飞书机器人远程操控本地开发环境。

## 功能亮点

- **远程操控** - 在飞书中发送消息，本地 Claude CLI 执行并返回结果
- **流式响应** - 实时流式输出，支持长内容智能分块
- **精美格式** - OpenClaw 风格卡片消息，完美渲染 Markdown、代码块、表格
- **本地可操作** - 启动后仍可在本地终端直接操作 Claude CLI
- **输入过滤** - 本地输入不会发送到飞书，避免干扰

## 架构

```
┌─────────┐    WebSocket    ┌─────────┐    WebSocket    ┌─────────┐
│  飞书   │ ◄──────────────► │  Bridge │ ◄──────────────► │ Claude  │
│  机器人 │                 │  Server │                 │   CLI   │
└─────────┘                 └─────────┘                 └─────────┘
```

## 快速开始

### 1. 安装

```bash
# 克隆项目
git clone https://github.com/suj1e/cci.git
cd cci

# 安装依赖
pnpm install

# 构建
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
cd packages/bridge
node dist/cli.js config --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
```

配置文件存储于 `~/.feishu-bridge/config.yaml`

### 4. 启动服务

```bash
# 终端 1: 启动 Bridge
cd packages/bridge
node dist/cli.js start
```

### 5. 启动 CLI 客户端

```bash
# 终端 2: 启动 CLI 客户端（会自动启动 Claude CLI）
cd packages/cli-client
node dist/cli.js
```

现在可以在飞书中与机器人对话了！

## 命令参考

### Bridge 服务

```bash
feishu-bridge start     # 启动服务
feishu-bridge stop      # 停止服务
feishu-bridge status    # 查看状态
feishu-bridge config    # 配置凭证
feishu-bridge logs      # 查看日志
```

### CLI 客户端 (fclaude)

```bash
fclaude                 # 启动客户端，连接到默认 Bridge
fclaude --help          # 查看帮助
```

### 健康检查

```bash
curl http://localhost:8989/health
# {"status":"ok","hasCliConnection":true}
```

## 消息格式化

参考 OpenClaw 实现，提供优质的消息显示效果：

| 特性 | 说明 |
|------|------|
| **卡片消息** | 使用 `lark_md` 标签，完美渲染 Markdown |
| **Post 消息** | 使用 `md` 标签，支持基础 Markdown |
| **智能选择** | 代码块/表格/长内容自动使用卡片格式 |
| **内容拆分** | 超长内容自动按段落/句子拆分为多张卡片 |
| **标题美化** | 自动添加 Emoji 图标 (📌✨💡) |
| **列表优化** | 无序列表使用 `•` 符号 |
| **分割线** | 美化消息结构 |
| **ANSI 清理** | 完善的终端控制字符清理 |

## 项目结构

```
cci/
├── packages/
│   ├── bridge/                 # 飞书桥接服务
│   │   ├── src/
│   │   │   ├── cli.ts          # CLI 入口
│   │   │   ├── config/         # 配置管理
│   │   │   ├── server/         # 核心逻辑
│   │   │   │   ├── bridge.ts       # 消息桥接
│   │   │   │   ├── feishuClient.ts # 飞书客户端
│   │   │   │   └── localServer.ts  # 本地服务
│   │   │   ├── utils/
│   │   │   │   └── outputFormatter.ts # 输出格式化
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   └── cli-client/             # CLI 客户端
│       ├── src/
│       │   └── client.ts       # PTY 包装 + WebSocket
│       └── package.json
│
├── openspec/                   # OpenSpec 规范
├── package.json
└── pnpm-workspace.yaml
```

## 技术栈

- **TypeScript** - 类型安全
- **Node.js** - 运行环境
- **@larksuiteoapi/node-sdk** - 飞书官方 SDK
- **node-pty** - PTY 终端模拟
- **WebSocket** - 实时通信

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
| 消息格式乱码 | 已自动清理 ANSI，如仍有问题请反馈 |

## 更新日志

### v1.1.0 (2025-03-12)

- OpenClaw 风格卡片消息格式
- 内容累积发送 (200字符/500ms)
- 输入回显过滤
- 智能内容拆分
- 完善 ANSI 清理

### v1.0.0 (2024-03-11)

- 初始版本
- 基本消息转发
- 流式响应支持

## License

MIT
