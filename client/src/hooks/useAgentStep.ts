// hooks/useAgentSteps.ts
import { useCallback, useRef, useState } from "react";
import type { StepEvent, AuthUrl } from "../utils/agentEvents";

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

// Renamed from `State` -> `StepState` and exported, so the Redux slice can
// use the identical shape instead of redeclaring it.
export interface StepState {
  steps: StepNode[];
  status:
    | "idle"
    | "connecting"
    | "running"
    | "auth_required"
    | "succeeded"
    | "failed";
  error: string | null;
  authUrls: { id: string; name: string; authUrl: string }[];
}

const initial: StepState = {
  steps: [],
  status: "idle",
  error: null,
  authUrls: [],
};

export function useAgentSteps() {
  const [state, setState] = useState<StepState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (url: string, token: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...initial, status: "connecting" });

    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pending: StepEvent[] = [];
    let scheduled = false;

    const flush = () => {
      scheduled = false;
      const batch = pending;
      pending = [];
      setState((prev) => batch.reduce(applyEvent, prev));
    };
    const queue = (e: StepEvent) => {
      pending.push(e);
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    };

    setState((s) => ({ ...s, status: "running" }));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        try {
          queue(JSON.parse(line.slice(5).trim()));
        } catch {
          console.error("Failed to parse event:", line);
        }
      }
    }
  }, []);

  return { ...state, run, stop: () => abortRef.current?.abort() };
}

// Exported so non-hook consumers (e.g. a Redux slice) can reuse the exact
// same event-folding logic instead of reimplementing it.
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
      } else
        steps.push({
          kind: "reasoning",
          id: e.id,
          content: e.content,
          done: true,
        });
      return { ...prev, steps };
    }
    case "tool_call_done":
      for (const tc of e.toolCalls)
        steps.push({
          kind: "tool_call",
          id: tc.id,
          name: tc.name,
          args: tc.arguments,
          status: "running",
        });
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
      return { ...prev, status: "auth_required", authUrls: e.mcpServers };
    case "turn_done":
      return { ...prev, status: e.status === "error" ? "failed" : "succeeded" };
    case "error":
      return { ...prev, status: "failed", error: e.message };
    default:
      return prev;
  }
}
