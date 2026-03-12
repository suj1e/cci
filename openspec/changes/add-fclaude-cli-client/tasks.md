## 1. 项目初始化

- [x] 1.1 创建 `packages/cli-client/` 目录结构
- [x] 1.2 配置 `package.json`（name: fclaude, bin, dependencies）
- [x] 1.3 配置 `tsconfig.json`
- [x] 1.4 在根 `pnpm-workspace.yaml` 中添加包（如需要）

## 2. 核心实现

- [x] 2.1 实现 `src/types.ts` - 定义消息类型和配置接口
- [x] 2.2 实现 `src/client.ts` - FeishuCliClient 类
  - [x] 2.2.1 PTY 创建和管理（node-pty）
  - [x] 2.2.2 WebSocket 客户端连接
  - [x] 2.2.3 双向数据流处理
  - [x] 2.2.4 优雅退出处理
- [x] 2.3 实现 `src/cli.ts` - 命令行参数解析（commander）
- [x] 2.4 实现 `src/index.ts` - 入口导出

## 3. 集成测试

- [x] 3.1 测试 bridge 未运行时的错误处理
- [x] 3.2 测试正常启动和连接
- [x] 3.3 测试 `--continue` 参数透传
- [ ] 3.4 测试飞书消息注入（需要实际飞书环境）
- [ ] 3.5 测试 CLI 输出转发（需要实际飞书环境）
- [x] 3.6 测试退出和资源清理

## 4. 文档和发布

- [x] 4.1 添加 README.md（使用说明）
- [x] 4.2 构建测试：`pnpm build`
- [x] 4.3 本地链接测试：`npm link`
- [x] 4.4 验证 `fclaude` 命令可用
