export type BridgeMessageType =
  | 'user_message' | 'stream_chunk' | 'stream_end' | 'cli_response' | 'ping' | 'pong'
  | 'thinking_start' | 'thinking_end' | 'text_start'
  | 'tool_call' | 'tool_result'
  | 'ask_user'
  | 'prompt_confirm' | 'prompt_permission' | 'prompt_choice' | 'prompt_plan'
  | 'skill_loading' | 'mcp_loading' | 'compacting'
  | 'subagent_start' | 'subagent_stop'
  | 'hook_blocked' | 'hook_warning' | 'notification'
  | 'error_api' | 'error_tool'
  | 'command_echo' | 'context_info' | 'diff_content';

export interface BridgeMessage {
  type: BridgeMessageType;
  id: string;
  timestamp: number;
  content?: string;
  userId?: string;
  // tool_call
  toolName?: string;
  toolDesc?: string;
  toolStatus?: 'running' | 'done';
  // tool_result
  truncated?: boolean;
  // prompt
  question?: string;
  message?: string;
  options?: string[];
  steps?: string[];
  tool?: string;
  target?: string;
  // skill/mcp
  skillName?: string;
  serverName?: string;
  loaded?: number;
  total?: number;
  done?: boolean;
  // compacting/subagent
  auto?: boolean;
  agentType?: string;
  desc?: string;
  summary?: string;
  // hook/error
  hookName?: string;
  errorType?: 'rate_limit' | 'context_full' | 'other';
  // other
  command?: string;
  tokens?: number;
  breakdown?: Record<string, number>;
  fileName?: string;
}

export interface ClientOptions {
  bridgeUrl?: string;
  claudeArgs?: string[];
  bridgeHttpUrl?: string;
}

export type ClientState = 'disconnected' | 'connecting' | 'connected' | 'error';
