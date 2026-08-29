// client/src/lib/agentStream.ts
// Shared by recommendationsSlice AND issueFinderSlice. Extended with:
//  - `question_required` event/state, mirroring how `auth_required` already
//    pauses the stream.
//  - Optional POST body support in consumeAgentStream (the repo recommender
//    stream takes no body; the issue finder needs to send selectedRepository /
//    the answer being submitted).

// ---------- Types ----------

export type StepEvent =
  | { type: "turn_start"; turnId: string }
  | { type: "reasoning_delta"; id: string; delta: string }
  | { type: "reasoning_done"; id: string; content: string }
  | {
      type: "tool_call_delta";
      messageId: string;
      index: number;
      id?: string;
      name?: string;
      argsDelta?: string;
    }
  | {
      type: "tool_call_done";
      messageId: string;
      toolCalls: NormalizedToolCall[];
    }
  | { type: "tool_result"; toolCallId: string; content: string }
  | {
      type: "thread_start";
      threadId: string;
      parentToolCallId: string;
      agentName: string;
      agentInput: string;
    }
  | { type: "thread_end"; threadId: string }
  | { type: "text_delta"; id: string; delta: string }
  | {
      type: "auth_required";
      mcpServers: { id: string; name: string; authUrl: string }[];
    }
  | {
      type: "question_required";
      toolCallId: string;
      question: string;
      options: string[];
    }
  | {
      type: "turn_done";
      status: "done" | "cancelled" | "error";
      requiredActions?: unknown;
    }
  | { type: "error"; message: string };

export interface AuthUrl {
  id: string;
  name: string;
  authUrl: string;
}

export interface PendingQuestion {
  toolCallId: string;
  question: string;
  options: string[];
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: unknown;
  toolInfo?: { type: string; name?: string; serverName?: string };
  meaning?: { label: string; description: string };
}

// ---------- Step tree shape ----------

export type StepNode =
  | { kind: "reasoning"; id: string; content: string; done: boolean }
  | {
      kind: "tool_call";
      id: string;
      name: string;
      args: unknown;
      status: "running" | "done";
      result?: string;
    }
  | {
      kind: "thread";
      threadId: string;
      agentName: string;
      agentInput: string;
      parentToolCallId: string;
      steps: StepNode[];
      done: boolean;
      authUrls: AuthUrl[];
    };

export interface StepState {
  steps: StepNode[];
  status:
    | "idle"
    | "connecting"
    | "running"
    | "auth_required"
    | "question_required"
    | "succeeded"
    | "failed";
  error: string | null;
  authUrls: AuthUrl[];
  pendingQuestion: PendingQuestion | null;
}

/**
 * Folds a single StepEvent into StepState.
 */
export function applyEvent(prev: StepState, e: StepEvent): StepState {
  const steps = [...prev.steps];
  const findToolCall = (id: string) =>
    steps.find(
      (s): s is Extract<StepNode, { kind: "tool_call" }> =>
        s.kind === "tool_call" && s.id === id,
    );

  switch (e.type) {
    case "reasoning_delta": {
      let node = steps.find(
        (s): s is Extract<StepNode, { kind: "reasoning" }> =>
          s.kind === "reasoning" && s.id === e.id,
      );
      if (!node) {
        node = { kind: "reasoning", id: e.id, content: "", done: false };
        steps.push(node);
      }
      node.content += e.delta;
      return { ...prev, steps };
    }
    case "reasoning_done": {
      const node = steps.find(
        (s): s is Extract<StepNode, { kind: "reasoning" }> =>
          s.kind === "reasoning" && s.id === e.id,
      );
      if (node) {
        node.content = e.content;
        node.done = true;
      } else {
        steps.push({
          kind: "reasoning",
          id: e.id,
          content: e.content,
          done: true,
        });
      }
      return { ...prev, steps };
    }
    case "tool_call_done":
      for (const tc of e.toolCalls) {
        steps.push({
          kind: "tool_call",
          id: tc.id,
          name: tc.name,
          args: tc.arguments,
          status: "running",
        });
      }
      return { ...prev, steps };
    case "tool_result": {
      const node = findToolCall(e.toolCallId);
      if (node) {
        node.status = "done";
        node.result = e.content;
      }
      return { ...prev, steps };
    }
    case "thread_start":
      steps.push({
        kind: "thread",
        threadId: e.threadId,
        agentName: e.agentName,
        agentInput: e.agentInput,
        parentToolCallId: e.parentToolCallId,
        steps: [],
        done: false,
        authUrls: [],
      });
      return { ...prev, steps };
    case "thread_end": {
      const node = steps.find(
        (s): s is Extract<StepNode, { kind: "thread" }> =>
          s.kind === "thread" && s.threadId === e.threadId,
      );
      if (node) node.done = true;
      return { ...prev, steps };
    }
    case "auth_required":
      return {
        ...prev,
        status: "auth_required",
        authUrls: e.mcpServers,
        pendingQuestion: null,
      };
    case "question_required": {
      // The ask_user_question tool call is already rendered as a running
      // tool_call step — mark it done now that we know its "result" is
      // pending on the user, so it doesn't look stuck.
      const node = steps.find(
        (s): s is Extract<StepNode, { kind: "tool_call" }> =>
          s.kind === "tool_call" &&
          s.name === "ask_user_question" &&
          s.status === "running",
      );
      if (node) node.status = "done";
      return {
        ...prev,
        steps,
        status: "question_required",
        pendingQuestion: {
          toolCallId: e.toolCallId,
          question: e.question,
          options: e.options,
        },
      };
    }
    case "turn_done":
      return {
        ...prev,
        status: e.status === "error" ? "failed" : "succeeded",
        pendingQuestion: null,
      };
    case "error":
      return { ...prev, status: "failed", error: e.message };
    default:
      return prev;
  }
}

// ---------- SSE fetch/parse ----------

export type AgentStreamResult<T> =
  | { kind: "done"; data: T; raw: string }
  | { kind: "auth_required"; authUrls: AuthUrl[] }
  | { kind: "question_required"; question: PendingQuestion }
  | { kind: "error"; message: string };

export interface AgentStreamHandlers {
  onPhase?: (phase: string) => void;
  onEvent?: (event: StepEvent) => void;
  onAuthRequired?: (authUrls: AuthUrl[]) => void;
  onQuestionRequired?: (question: PendingQuestion) => void;
}

const getToken = () => localStorage.getItem("accessToken");

/**
 * Opens a POST'd SSE stream at `url` and dispatches parsed StepEvents to
 * `handlers.onEvent` live. Separately accumulates text_delta chunks so the
 * caller gets the final parsed JSON payload once turn_done arrives.
 *
 * `body`, when provided, is JSON-stringified and sent as the POST body
 * (used to pass selectedRepository / question answers).
 */
export async function consumeAgentStream<T>(
  url: string,
  handlers: AgentStreamHandlers = {},
  body?: unknown,
): Promise<AgentStreamResult<T>> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok || !res.body) {
    let message = "Couldn't reach the agent. Please try again.";
    try {
      const err = await res.json();
      message = err?.error ?? message;
    } catch {
      /* response wasn't JSON (likely never opened SSE) */
    }
    return { kind: "error", message };
  }

  handlers.onPhase?.("connecting");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawBuffer = "";
  let result: AgentStreamResult<T> | null = null;

  const handleEvent = (event: StepEvent) => {
    handlers.onEvent?.(event);

    switch (event.type) {
      case "text_delta":
        rawBuffer += event.delta;
        break;

      case "auth_required":
        handlers.onAuthRequired?.(event.mcpServers);
        result = { kind: "auth_required", authUrls: event.mcpServers };
        break;

      case "question_required": {
        const question: PendingQuestion = {
          toolCallId: event.toolCallId,
          question: event.question,
          options: event.options,
        };
        handlers.onQuestionRequired?.(question);
        result = { kind: "question_required", question };
        break;
      }

      case "turn_done":
        if (event.status === "error") {
          result = { kind: "error", message: "Agent turn ended in error." };
        } else if (!result) {
          try {
            const data = JSON.parse(rawBuffer) as T;
            result = { kind: "done", data, raw: rawBuffer };
          } catch {
            result = {
              kind: "error",
              message: "Agent finished but returned malformed output.",
            };
          }
        }
        break;

      case "error":
        result = { kind: "error", message: event.message };
        break;

      default:
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue; // skip heartbeats/comments
      try {
        handleEvent(JSON.parse(line.slice(5).trim()) as StepEvent);
      } catch {
        console.error("Failed to parse SSE frame:", line);
      }
    }
  }

  return (
    result ?? {
      kind: "error",
      message: "Connection ended before the agent finished.",
    }
  );
}
