#!/usr/bin/env node
import { Command } from 'commander';
import { FeishuCliClient } from './client';

const program = new Command();

program
  .name('fclaude')
  .description('Claude CLI with Feishu bridge integration')
  .version('1.0.0')
  .allowUnknownOption(true) // 允许未知选项透传给 claude
  .argument('[args...]', 'Arguments to pass to claude')
  .action(async (args: string[]) => {
    const client = new FeishuCliClient({
      claudeArgs: args || [],
    });

    // 处理退出信号
    process.on('SIGINT', async () => {
      console.log('\n正在退出...');
      await client.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await client.stop();
      process.exit(0);
    });

    try {
      await client.start();
    } catch (error) {
      console.error('❌ 启动失败:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
