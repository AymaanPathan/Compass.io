import { Response } from "express";
import {
  isEventDelta,
  mergeEventDelta,
  TrueForgeApi,
} from "@truefoundry/trueforge-sdk";
import { trueforge } from "./agentClient";
import { parseAgentJson } from "../utils/agentResponseToJson";

export interface ToolMeaning {
  label: string;
  description: string;
}

export function sendEvent(res: Response, event: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** Opens an SSE response and keeps proxies from closing the idle connection. */
export function openSse(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  return setInterval(() => res.write(": ping\n\n"), 15000);
}

function preview(value: unknown, max = 500): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

/**
 * Streams one TrueForge turn to the browser as SSE, translating raw turn
 * events into a small UI vocabulary shared by every agent in the pipeline:
 *
 *   phase | tool_call | tool_result | text_delta | auth_required | done | error
 *
 * `toolMeanings` maps an MCP tool name to what the UI should say while it
 * runs. `validate`, if given, is run against the parsed JSON output before
 * `done` is emitted — a failed validation is surfaced as `error` instead, so
 * bad agent output never reaches the client as if it were a real result.
 */
export interface StreamAgentTurnHooks {
  /** Fired when the turn pauses on mcp.auth_required, before the SSE event is sent. */
  onAuthRequired?: () => unknown;
  /** Fired whenever the stream ends by sending an `error` frame to the client. */
  onError?: (message: string) => unknown;
}

export async function streamAgentTurn<T>(
  res: Response,
  sessionId: string,
  input: TrueForgeApi.TurnInputItem[],
  label: string,
  toolMeanings: Record<string, ToolMeaning>,
  validate?: (data: unknown) => data is T,
  hooks: StreamAgentTurnHooks = {},
) {
  const events = new Map<string, TrueForgeApi.TurnStreamingEvent>();
  const toolNames = new Map<string, string>();
  const startedAt = Date.now();
  let eventCount = 0;

  const toolMeaning = (name: string): ToolMeaning =>
    toolMeanings[name] ?? { label: name, description: "Gathering evidence" };

  console.log(
    `\n[stream:${label}] ── opening turn stream session=${sessionId}`,
  );

  const stream = await trueforge.sessions.createTurnStream(sessionId, {
    input,
  });

  for await (const { data: event } of stream.withMetadata()) {
    eventCount++;

    if (isEventDelta(event)) {
      const base = events.get(event.id);
      if (base) mergeEventDelta(base, event);
    } else {
      events.set(event.id, event);
    }

    switch (event.type) {
      case "turn.created":
        sendEvent(res, { type: "phase", phase: "started" });
        break;

      case "model.message.delta": {
        const delta = (event as any).content;
        if (delta) sendEvent(res, { type: "text_delta", delta });
        break;
      }

      case "model.message": {
        const toolCalls = (event as any).toolCalls as
          | { id: string; function: { name: string } }[]
          | undefined;
        for (const call of toolCalls ?? []) {
          if (toolNames.has(call.id)) continue; // announce once
          toolNames.set(call.id, call.function.name);
          console.log(`[stream:${label}] tool.call tool=${call.function.name}`);
          sendEvent(res, {
            type: "tool_call",
            tool: call.function.name,
            ...toolMeaning(call.function.name),
          });
        }
        break;
      }

      case "tool.response": {
        const toolCallId = (event as any).toolCallId as string;
        const name = toolNames.get(toolCallId) ?? "unknown";
        console.log(`[stream:${label}] tool.response tool=${name}`);
        sendEvent(res, {
          type: "tool_result",
          tool: name,
          label: toolMeaning(name).label,
        });
        break;
      }

      case "mcp.auth_required": {
        const mcpServers = (event as any).mcpServers as
          | { name: string; authUrl: string }[]
          | undefined;
        console.warn(
          `[stream:${label}] mcp.auth_required servers=${mcpServers?.map((s) => s.name).join(", ")}`,
        );
        await hooks.onAuthRequired?.();
        sendEvent(res, { type: "auth_required", authUrls: mcpServers ?? [] });
        break;
      }

      case "turn.done": {
        const state = (event as any).state;
        const duration = Date.now() - startedAt;
        console.log(
          `[stream:${label}] turn.done status=${state?.status} duration=${duration}ms events=${eventCount}`,
        );

        if (state.status === "done" && state.output) {
          const text = state.output.content ?? "";
          const parsed = parseAgentJson<T>(text);

          if (parsed && (!validate || validate(parsed))) {
            sendEvent(res, { type: "done", data: parsed, raw: text });
          } else {
            const message =
              "The agent returned an unexpected result. Please try again.";
            console.error(
              `[stream:${label}] invalid output:`,
              preview(text, 800),
            );
            await hooks.onError?.(message);
            sendEvent(res, { type: "error", message, raw: text });
          }
        } else if (state.status === "cancelled") {
          const message = `Turn cancelled: ${state.reason}`;
          await hooks.onError?.(message);
          sendEvent(res, { type: "error", message });
        } else if (state.status === "error") {
          console.error(`[stream:${label}] turn errored:`, state.message);
          await hooks.onError?.(state.message);
          sendEvent(res, { type: "error", message: state.message });
        }
        console.log(`[stream:${label}] ── stream closed\n`);
        break;
      }

      default:
        break;
    }
  }
}
