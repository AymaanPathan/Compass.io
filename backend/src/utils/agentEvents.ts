export type StepEvent =
  | { type: "turn_start"; turnId: string }
  | { type: "reasoning_delta"; id: string; delta: string }
  | { type: "reasoning_done"; id: string; content: string }
  | { type: "tool_call_delta"; messageId: string; index: number; id?: string; name?: string; argsDelta?: string }
  | { type: "tool_call_done"; messageId: string; toolCalls: NormalizedToolCall[] }
  | { type: "tool_result"; toolCallId: string; content: string }
  | { type: "thread_start"; threadId: string; parentToolCallId: string; agentName: string; agentInput: string }
  | { type: "thread_end"; threadId: string }
  | { type: "text_delta"; id: string; delta: string }
  | { type: "auth_required"; mcpServers: { id: string; name: string; authUrl: string }[] }
  | { type: "turn_done"; status: "done" | "cancelled" | "error"; requiredActions?: unknown }
  | { type: "error"; message: string };

export interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: unknown;
  toolInfo?: { type: string; name?: string; serverName?: string };
  meaning?: { label: string; description: string };
}

export interface AuthUrl {
  id: string;
  name: string;
  authUrl: string;
}
