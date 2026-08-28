/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AuthUrl {
  name: string;
  authUrl: string;
}

export type AgentActivityEvent =
  | {
      id: string;
      type: "tool_call";
      tool: string;
      label: string;
      description: string;
    }
  | { id: string; type: "tool_result"; tool: string; label: string };

export type AgentStreamResult<T> =
  | { kind: "done"; data: T; raw: string }
  | { kind: "auth_required"; authUrls: AuthUrl[] }
  | { kind: "error"; message: string };

export interface AgentStreamHandlers {
  onPhase?: (phase: string) => void;
  onActivity?: (event: AgentActivityEvent) => void;
  onTextDelta?: (delta: string) => void;
  onAuthRequired?: (authUrls: AuthUrl[]) => void;
}

const getToken = () => localStorage.getItem("accessToken");

/**
 * Opens a POST'd SSE stream at `url` and dispatches parsed frames to
 * `handlers` as they arrive, live. Resolves once the stream ends with the
 * terminal outcome (done / auth_required / error) so a thunk can persist
 * or react to it.
 */
export async function consumeAgentStream<T>(
  url: string,
  handlers: AgentStreamHandlers = {},
): Promise<AgentStreamResult<T>> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok || !res.body) {
    return {
      kind: "error",
      message: "Couldn't reach the agent. Please try again.",
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AgentStreamResult<T> | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!frame.startsWith("data: ")) continue; // skip heartbeats/comments

      const event = JSON.parse(frame.slice(6));

      switch (event.type) {
        case "phase":
          handlers.onPhase?.(event.phase);
          break;
        case "tool_call":
          handlers.onActivity?.({
            id: `tool_call-${event.tool}-${Date.now()}`,
            type: "tool_call",
            tool: event.tool,
            label: event.label,
            description: event.description,
          });
          break;
        case "tool_result":
          handlers.onActivity?.({
            id: `tool_result-${event.tool}-${Date.now()}`,
            type: "tool_result",
            tool: event.tool,
            label: event.label,
          });
          break;
        case "text_delta":
          handlers.onTextDelta?.(event.delta);
          break;
        case "auth_required":
          handlers.onAuthRequired?.(event.authUrls);
          result = { kind: "auth_required", authUrls: event.authUrls };
          break;
        case "done":
          result = { kind: "done", data: event.data, raw: event.raw };
          break;
        case "error":
          result = { kind: "error", message: event.message };
          break;
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
