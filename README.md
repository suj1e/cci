# Claude CLI Feishu Bridge (飞书桥接服务)

将 Claude CLI 的强大功能引入飞书，实现通过飞书机器人访问本地开发环境的能力。

## 什么是飞书桥接服务？

这是一个双向通信桥梁，允许：

- 在飞书中发送消息到本地运行的 Claude CLI
- 在飞书中直接接收 Claude CLI 的输出
- 支持实时消息转发和流式响应显示
- 提供命令执行和开发任务完成能力

## 架构图

```
飞书 → 飞书 WebSocket → 桥接服务 → 本地 WebSocket → Claude CLI
飞书 ← 飞书 API ← 桥接服务 ← 本地 WebSocket ← Claude CLI
```

## 技术栈

- **TypeScript** - 类型安全的现代开发
- **Node.js** - 服务器端运行环境
- **飞书官方 SDK** (@larksuiteoapi/node-sdk) - 飞书 API 集成
- **WebSocket** - 实时双向通信
- **Marked** - Markdown 解析和转换

## 安装

### 全局安装 (推荐)

```bash
npm install -g @claude-cli/feishu-bridge
```

### 本地开发安装

```bash
cd packages/bridge
npm install
npm run build
npm link
```

## 配置

### 1. 飞书应用创建

在 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用：

1. 进入**企业自建应用** → **创建应用**
2. 填写应用基本信息（应用名称、描述）
3. 在**凭证与基础信息**页面获取 `App ID` 和 `App Secret`
4. 在**应用功能** → **机器人**中开启机器人功能
5. 在**事件与回调**中订阅 `im.message.receive_v1` 事件

### 2. 配置文件设置

创建或更新配置文件：

```bash
feishu-bridge config --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
```

配置文件将存储在 `~/.feishu-bridge/config.yaml` 中，内容格式：

```yaml
appId: YOUR_APP_ID
appSecret: YOUR_APP_SECRET
port: 8989
logLevel: info
```

### 验证配置

```bash
feishu-bridge status
```

## 使用方法

### 1. 启动桥接服务

```bash
feishu-bridge start
```

### 2. 在 Claude CLI 中连接

在 Claude CLI 终端中运行：

```
/connect-feishu
```

### 3. 在飞书中与机器人对话

现在，你可以直接在飞书中与机器人对话，发送消息和命令。

## 可用命令

### 服务管理

```bash
# 启动服务
feishu-bridge start

# 停止服务
feishu-bridge stop

# 查看服务状态
feishu-bridge status

# 配置应用凭证
feishu-bridge config --app-id <ID> --app-secret <SECRET>
```

### 健康检查

访问 `http://localhost:8989/health` 进行健康检查，返回：

```json
{"status":"ok","hasCliConnection":true}
```

## 功能特性

### 1. 实时消息转发

- **飞书 → Claude CLI**：直接转发用户消息
- **Claude CLI → 飞书**：返回处理结果和输出
- **输入回显过滤**：本地 CLI 输入不会发送到飞书

### 2. 流式响应支持

- 支持 Claude CLI 的流式响应
- **内容累积发送**：200 字符或 500ms 超时后发送，避免逐字发送
- 智能消息分块

### 3. 飞书消息格式化

参考 OpenClaw 实现，提供优质的消息显示效果：

- **卡片消息**：使用 `lark_md` 标签，完美支持 Markdown 渲染
- **Post 消息**：使用 `md` 标签，支持基础 Markdown
- **智能选择**：代码块、表格、长内容自动使用卡片格式
- **标题美化**：自动添加 Emoji 图标
- **列表优化**：无序列表使用 `•` 符号
- **分割线**：美化消息结构
- **允许转发**：卡片消息支持转发功能

### 4. 会话管理

- 单会话模式（当前支持）
- 用户隔离：消息发送给对应的 CLI 用户

### 5. 自动重连机制

网络断开时自动重连，确保通信稳定性。

## 安全考虑

### 1. 配置安全

- 配置文件权限设置为 600（仅用户本人可读取）
- 敏感信息不记录到日志中
- 支持通过环境变量配置（高级用户）

### 2. 通信安全

- 所有通信均在本地进行，不通过公网
- 使用 WebSocket 进行数据传输
- 简单的会话验证机制

## 故障排除

### 常见问题

1. **服务无法启动**
   - 检查端口是否被占用（默认 8989）
   - 验证配置文件的完整性

2. **CLI 无法连接**
   - 确保服务正在运行 (`feishu-bridge status`)
   - 检查防火墙或安全软件设置

3. **飞书消息不响应**
   - 确认应用已安装到飞书群组
   - 检查应用权限配置
   - 查看服务日志 (`feishu-bridge logs`)

## 开发指南

### 项目结构

```
packages/bridge/
├── src/
│   ├── cli.ts              # CLI 入口文件
│   ├── config/             # 配置管理
│   ├── protocol/           # 消息转换和协议处理
│   ├── server/             # 服务器核心逻辑
│   │   ├── bridge.ts       # 桥接主逻辑
│   │   ├── feishuClient.ts # 飞书客户端
│   │   └── localServer.ts  # 本地 WebSocket 服务器
│   ├── utils/              # 工具函数
│   │   └── outputFormatter.ts  # 输出格式化（ANSI 清理、飞书格式转换）
│   └── types.ts            # 类型定义
├── dist/                   # 编译输出目录
└── package.json

packages/cli-client/
├── src/
│   └── client.ts           # CLI 客户端（PTY 包装、WebSocket 连接）
└── dist/
```

### 构建和测试

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 运行测试
npm run test

# 开发模式（监听文件更改）
npm run dev
```

### 代码风格

- 使用 TypeScript 严格类型检查
- 遵循 ESLint 规则
- 文档化公共接口
- 编写单元测试

## 更新日志

### v1.1.0 (2025-03-12)

- **OpenClaw 风格卡片消息**：使用 `lark_md` 标签，完美渲染 Markdown
- **内容累积发送**：200 字符/500ms 阈值，避免逐字发送
- **输入回显过滤**：本地 CLI 输入不会发送到飞书
- **OutputFormatter 工具**：统一处理 ANSI 清理和格式转换
- **标题 Emoji 美化**：自动为标题添加图标
- **智能消息格式选择**：代码块/表格/长内容自动使用卡片格式

### v1.0.0 (2024-03-11)

- 初始版本
- 支持基本的消息转发
- 流式响应支持
- 代码块高亮
- 飞书消息格式转换

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

[ISC License](./LICENSE)

