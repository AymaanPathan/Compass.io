/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StepEvent, AuthUrl } from "../utils/agentEvents";

export type { AuthUrl } from "../utils/agentEvents";

export type AgentStreamResult<T> =
  | { kind: "done"; data: T; raw: string }
  | { kind: "auth_required"; authUrls: AuthUrl[] }
  | { kind: "error"; message: string };

export interface AgentStreamHandlers {
  onPhase?: (phase: string) => void;
  onEvent?: (event: StepEvent) => void;
  onAuthRequired?: (authUrls: AuthUrl[]) => void;
}

const getToken = () => localStorage.getItem("accessToken");

/**
 * Opens a POST'd SSE stream at `url`, forwards every parsed StepEvent to
 * `handlers.onEvent` live (drives the step tree UI), and separately
 * accumulates text_delta chunks to resolve the final parsed payload once
 * `turn_done` arrives.
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
