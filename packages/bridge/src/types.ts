// 桥接服务类型定义

export interface FeishuWebSocketEvent {
  header: {
    event_id: string;
    token: string;
    create_time: string;
    event_type: string;
    tenant_key: string;
    app_id: string;
  };
  event: {
    sender: {
      sender_id: { union_id: string; user_id: string; open_id: string };
      sender_type: string;
      tenant_key: string;
    };
    message: {
      message_id: string;
      root_id?: string;
      parent_id?: string;
      create_time: string;
      chat_id: string;
      chat_type: string;
      message_type: string;
      content: string;
      mentions?: Array<{
        key: string;
        id: { union_id: string; user_id: string; open_id: string };
        name: string;
        tenant_key: string;
      }>;
    };
  };
}

// ── 消息类型 ──────────────────────────────────────────────────────────────────

export type MessageType =
  // 原有（保留不动）
  | 'user_message'
  | 'cli_response'
  | 'stream_chunk'
  | 'stream_end'
  | 'ping'
  | 'pong'
  // 思考阶段
  | 'thinking_start'
  | 'thinking_end'
  // 工具调用
  | 'tool_call'
  | 'tool_result'
  // 文字输出
  | 'text_start'
  // 交互 prompt
  | 'ask_user'
  | 'prompt_confirm'
  | 'prompt_permission'
  | 'prompt_choice'
  | 'prompt_plan'
  // 状态
  | 'skill_loading'
  | 'mcp_loading'
  | 'compacting'
  | 'subagent_start'
  | 'subagent_stop'
  // Hook
  | 'hook_blocked'
  | 'hook_warning'
  | 'notification'
  // 错误
  | 'error_api'
  | 'error_tool'
  // 其他
  | 'command_echo'
  | 'context_info'
  | 'diff_content';

// ── 基础消息 ──────────────────────────────────────────────────────────────────

export interface BaseMessage {
  type: MessageType;
  id: string;
  timestamp: number;
}

// ── 原有消息（保留） ──────────────────────────────────────────────────────────

export interface UserMessage extends BaseMessage {
  type: 'user_message';
  content: string;
  userId: string;
}

export interface CliResponse extends BaseMessage {
  type: 'cli_response';
  content: string;
  conversationId?: string;
}

export interface StreamChunk extends BaseMessage {
  type: 'stream_chunk';
  content: string;
  conversationId?: string;
}

export interface StreamEnd extends BaseMessage {
  type: 'stream_end';
  conversationId?: string;
}

export interface PingMessage extends BaseMessage { type: 'ping' }
export interface PongMessage extends BaseMessage { type: 'pong' }

// ── 新增消息 ──────────────────────────────────────────────────────────────────

export interface ThinkingStartMessage extends BaseMessage { type: 'thinking_start' }
export interface ThinkingEndMessage extends BaseMessage { type: 'thinking_end' }
export interface TextStartMessage extends BaseMessage { type: 'text_start' }

export interface ToolCallMessage extends BaseMessage {
  type: 'tool_call';
  toolName: string;
  toolDesc: string;
  toolStatus: 'running' | 'done';
  toolEmoji?: string;
}

export interface ToolResultMessage extends BaseMessage {
  type: 'tool_result';
  toolName: string;
  content: string;
  truncated: boolean;
}

export interface AskUserMessage extends BaseMessage {
  type: 'ask_user';
  question: string;
}

export interface PromptConfirmMessage extends BaseMessage {
  type: 'prompt_confirm';
  message: string;
}

export interface PromptPermissionMessage extends BaseMessage {
  type: 'prompt_permission';
  tool: string;
  target: string;
}

export interface PromptChoiceMessage extends BaseMessage {
  type: 'prompt_choice';
  message: string;
  options: string[];
}

export interface PromptPlanMessage extends BaseMessage {
  type: 'prompt_plan';
  steps: string[];
}

export interface SkillLoadingMessage extends BaseMessage {
  type: 'skill_loading';
  skillName: string;
  loaded?: number;
  total?: number;
}

export interface McpLoadingMessage extends BaseMessage {
  type: 'mcp_loading';
  serverName: string;
  done: boolean;
}

export interface CompactingMessage extends BaseMessage {
  type: 'compacting';
  auto: boolean;
}

export interface SubagentStartMessage extends BaseMessage {
  type: 'subagent_start';
  agentType: string;
  desc: string;
}

export interface SubagentStopMessage extends BaseMessage {
  type: 'subagent_stop';
  agentType: string;
  summary: string;
}

export interface HookBlockedMessage extends BaseMessage {
  type: 'hook_blocked';
  hookName: string;
  reason: string;
}

export interface HookWarningMessage extends BaseMessage {
  type: 'hook_warning';
  hookName: string;
  message: string;
}

export interface NotificationMessage extends BaseMessage {
  type: 'notification';
  message: string;
}

export interface ApiErrorMessage extends BaseMessage {
  type: 'error_api';
  errorType: 'rate_limit' | 'context_full' | 'other';
  message: string;
}

export interface ToolErrorMessage extends BaseMessage {
  type: 'error_tool';
  toolName: string;
  message: string;
}

export interface CommandEchoMessage extends BaseMessage {
  type: 'command_echo';
  command: string;
}

export interface ContextInfoMessage extends BaseMessage {
  type: 'context_info';
  tokens: number;
  breakdown: Record<string, number>;
}

export interface DiffContentMessage extends BaseMessage {
  type: 'diff_content';
  content: string;
  fileName?: string;
}

// ── 联合类型 ──────────────────────────────────────────────────────────────────

export type BridgeMessage =
  | UserMessage | CliResponse | StreamChunk | StreamEnd | PingMessage | PongMessage
  | ThinkingStartMessage | ThinkingEndMessage | TextStartMessage
  | ToolCallMessage | ToolResultMessage
  | AskUserMessage
  | PromptConfirmMessage | PromptPermissionMessage | PromptChoiceMessage | PromptPlanMessage
  | SkillLoadingMessage | McpLoadingMessage | CompactingMessage
  | SubagentStartMessage | SubagentStopMessage
  | HookBlockedMessage | HookWarningMessage | NotificationMessage
  | ApiErrorMessage | ToolErrorMessage
  | CommandEchoMessage | ContextInfoMessage | DiffContentMessage;

// ── 飞书消息结构（保留原有） ───────────────────────────────────────────────────

export type FeishuElementType = 'text' | 'a' | 'at' | 'image' | 'code_block' | 'hr' | 'md_block';

export interface FeishuElement {
  tag: FeishuElementType;
  text?: string;
  href?: string;
  user_id?: string;
  language?: string;
  code?: string;
}

export interface FeishuRichText {
  elements: FeishuElement[];
}

export interface BridgeConfig {
  appId: string;
  appSecret: string;
  port?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  notifyUserIds?: string[];
  notifyOnStartup?: boolean;
  notifyOnConnection?: boolean;
  notifyOnDisconnection?: boolean;
}