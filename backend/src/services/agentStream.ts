import { Response } from "express";
import { trueforge } from "./agentClient";
import { TurnStreamingEvent } from "truefoundry-gateway-sdk/agents";

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
  // NEW: the agent called ask_user_question and the turn is paused until we
  // submit an answer for this specific toolCallId.
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

export interface ToolMeaning {
  label: string;
  description: string;
}

// ---------- SSE plumbing ----------

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

/**
 * ⚠️ VERIFY against the real SDK: this assumes that when the model calls the
 * built-in `ask_user_question` tool (enabled via manifest.config.askUserQuestions),
 * the turn ends in a non-terminal state (e.g. "requires_action") and
 * `event.state.requiredActions` looks like an OpenAI-Assistants-style
 * submit_tool_outputs payload:
 *
 *   {
 *     type: "submit_tool_outputs",
 *     toolCalls: [{ id: "call_123", name: "ask_user_question", arguments: "{...}" }]
 *   }
 *
 * If your SDK's actual shape differs, only this function needs to change —
 * everything downstream (routes, frontend) just consumes the normalized
 * PendingQuestion it returns.
 */
function extractPendingQuestion(requiredActions: any): PendingQuestion | null {
  if (!requiredActions) return null;

  const toolCalls =
    requiredActions.toolCalls ?? requiredActions.tool_calls ?? [];

  for (const tc of toolCalls) {
    const name = tc.name ?? tc.function?.name;
    if (name !== "ask_user_question") continue;

    let args: any = {};
    try {
      const raw = tc.arguments ?? tc.function?.arguments;
      args = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
    } catch {
      args = {};
    }

    return {
      toolCallId: tc.id,
      question: args.question ?? "",
      options: Array.isArray(args.options) ? args.options : [],
    };
  }

  return null;
}

/**
 * Builds the `input` array to resume a paused turn after the user answered
 * a question. ⚠️ VERIFY the exact input item shape the SDK expects for
 * submitting a tool result — this mirrors the `tool.response` event shape
 * (toolCallId + string content) since that's the only tool-result-shaped
 * contract visible elsewhere in this codebase.
 */
export function buildAnswerInput(toolCallId: string, answer: string) {
  return [
    {
      type: "tool_result",
      toolCallId,
      content: JSON.stringify({ answer }),
    },
  ];
}

export async function streamAgentTurn<T = unknown>(
  res: Response,
  sessionId: string,
  input: any[],
  label: string,
  toolMeanings: Record<string, ToolMeaning>,
  resultValidator: ((value: unknown) => value is T) | undefined,
  hooks: {
    onAuthRequired: () => Promise<void>;
    onQuestionRequired?: (question: PendingQuestion) => Promise<void>;
    onError: (message: string) => Promise<void>;
  },
): Promise<void> {
  try {
    const stream = await trueforge.sessions.createTurnStream(sessionId, {
      input,
    } as any);

    for await (const event of stream as unknown as AsyncIterable<TurnStreamingEvent>) {
      switch (event.type) {
        case "turn.created":
          sse(res, { type: "turn_start", turnId: event.turnId });
          break;

        case "model.message.delta": {
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
          sse(res, {
            type: "tool_result",
            toolCallId: event.toolCallId,
            content: event.content,
          });
          break;

        case "thread.created":
          sse(res, {
            type: "thread_start",
            threadId: event.threadId,
            parentToolCallId: (event.parent as any)?.toolCallId,
            agentName: event.agentInfo?.name,
            agentInput: (event.agentInfo as any)?.input,
          });
          break;

        case "thread.done":
          sse(res, { type: "thread_end", threadId: (event as any).threadId });
          break;

        case "mcp.auth_required":
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
          const state = event.state as any;
          const status = state?.status ?? "done";

          // Turn paused because the agent is waiting on ask_user_question.
          if (
            status !== "done" &&
            status !== "cancelled" &&
            status !== "error"
          ) {
            const pending = extractPendingQuestion(state?.requiredActions);
            if (pending) {
              sse(res, {
                type: "question_required",
                toolCallId: pending.toolCallId,
                question: pending.question,
                options: pending.options,
              });
              if (hooks.onQuestionRequired) {
                await hooks.onQuestionRequired(pending);
              }
              return; // pause here, exactly like auth_required
            }
          }

          sse(res, {
            type: "turn_done",
            status,
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
