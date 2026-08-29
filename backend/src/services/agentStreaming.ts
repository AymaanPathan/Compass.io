import { Response } from "express";
import { trueforge } from "./agentClient";
import type { StepEvent, NormalizedToolCall } from "../utils/agentEvents";

import { TurnStreamingEvent } from "truefoundry-gateway-sdk/agents";

export interface ToolMeaning {
  label: string;
  description: string;
}

function sse(res: Response, event: StepEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function openSse(res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();
  return setInterval(() => res.write(":hb\n\n"), 15000);
}

export async function streamAgentTurn<T>(
  res: Response,
  sessionId: string,
  input: any[],
  label: string,
  toolMeanings: Record<string, ToolMeaning>,
  _unused: undefined,
  hooks: {
    onAuthRequired: () => Promise<void>;
    onError: (message: string) => Promise<void>;
  },
): Promise<void> {
  try {
    // HttpResponsePromise resolves directly to the value — no `.data` wrapper.
    const stream = await trueforge.sessions.createTurnStream(sessionId, {
      input,
    } as any);

    for await (const event of stream as unknown as AsyncIterable<TurnStreamingEvent>) {
      switch (event.type) {
        case "turn.created":
          sse(res, { type: "turn_start", turnId: event.turnId });
          break;

        case "model.message.delta": {
          // Confirmed flat shape — no nested `.delta` object.
          if (event.reasoningContent) {
            sse(res, {
              type: "reasoning_delta",
              id: event.id,
              delta: event.reasoningContent,
            });
          }
          if (typeof event.content === "string") {
            sse(res, {
              type: "text_delta",
              id: event.id,
              delta: event.content,
            });
          }
          break;
        }

        case "model.message": {
          if (event.reasoningContent) {
            sse(res, {
              type: "reasoning_done",
              id: event.id,
              content: event.reasoningContent,
            });
          }
          if (Array.isArray(event.toolCalls) && event.toolCalls.length) {
            const normalized: NormalizedToolCall[] = event.toolCalls.map(
              (tc: any) => {
                let args: unknown = tc.function?.arguments;
                try {
                  args = JSON.parse(tc.function?.arguments ?? "{}");
                } catch {}
                const name = tc.function?.name ?? tc.toolInfo?.name ?? "tool";
                return {
                  id: tc.id,
                  name,
                  arguments: args,
                  toolInfo: tc.toolInfo,
                  meaning: toolMeanings[name],
                };
              },
            );
            sse(res, {
              type: "tool_call_done",
              messageId: event.id,
              toolCalls: normalized,
            });
          }
          break;
        }

        case "tool.response":
          // Confirmed: content is already a plain string.
          sse(res, {
            type: "tool_result",
            toolCallId: event.toolCallId,
            content: event.content,
          });
          break;

        case "thread.created":
          // ASSUMPTION pending confirmation: AgentParent = { threadId, toolCallId }
          sse(res, {
            type: "thread_start",
            threadId: event.threadId,
            parentToolCallId: (event.parent as any)?.toolCallId,
            agentName: event.agentInfo?.name,
            agentInput: (event.agentInfo as any)?.input,
          });
          break;

        case "thread.done":
          // ASSUMPTION pending confirmation: threadId comes from BaseThreadDoneEvent
          sse(res, { type: "thread_end", threadId: (event as any).threadId });
          break;

        case "mcp.auth_required":
          // ASSUMPTION pending confirmation: McpServerAuthInfo = { id, name, authUrl }
          sse(res, {
            type: "auth_required",
            mcpServers: (event.mcpServers as any[]).map((s) => ({
              id: s.id,
              name: s.name,
              authUrl: s.authUrl,
            })),
          });
          await hooks.onAuthRequired();
          return;

        case "turn.done": {
          // ASSUMPTION pending confirmation: TurnDoneEventState = { status, requiredActions }
          const state = event.state as any;
          sse(res, {
            type: "turn_done",
            status: state?.status ?? "done",
            requiredActions: state?.requiredActions,
          });
          break;
        }

        default:
          break;
      }
    }
  } catch (error: any) {
    console.error(`[${label}]`, error);
    sse(res, {
      type: "error",
      message: error?.message ?? "Agent stream failed",
    });
    await hooks.onError(error?.message ?? "Agent stream failed");
  }
}
