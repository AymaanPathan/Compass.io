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
  // The agent called ask_user_question and the turn is paused until we
  // submit an answer for this specific toolCallId. `threadId` is required
  // to resume correctly — the documented `user.tool_response` input item
  // needs { threadId, toolCallId, content }.
  | {
      type: "question_required";
      toolCallId: string;
      threadId: string;
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
  threadId: string;
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

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
//
// All logs from this module are prefixed `[agentStream:<label>:<runId>]` and
// timestamped so a specific run's logs can be grep'd out even if several
// overlap in the terminal. Big fields (tool arguments, reasoning text) are
// truncated with a "+N chars" suffix rather than dropped, so you can still
// see shape/size without flooding the terminal.
//
// Set AGENT_STREAM_LOG_LEVEL=verbose to also log individual reasoning/text
// deltas (very chatty, off by default — the done/summary logs are enough
// for most debugging).

const VERBOSE = process.env.AGENT_STREAM_LOG_LEVEL === "verbose";

function ts() {
  return new Date().toISOString().split("T")[1].replace("Z", "");
}

function log(label: string, ...args: any[]) {
  console.log(`[agentStream:${label}] ${ts()}`, ...args);
}

function warn(label: string, ...args: any[]) {
  console.warn(`[agentStream:${label}] ${ts()} \u26A0`, ...args);
}

function trunc(value: unknown, max = 600): string {
  let str: string;
  try {
    str = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    str = String(value);
  }
  if (str === undefined) return "undefined";
  if (str.length <= max) return str;
  return `${str.slice(0, max)}\u2026[+${str.length - max} chars]`;
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
 * Direct index of every tool call seen on this stream, keyed by the tool
 * call's OWN id (e.g. "chatcmpl-tool-...").
 *
 * WHY THIS EXISTS: `requiredActions[].toolCalls[].sourceEventId` is
 * documented as pointing at the `model.message` event that carries the
 * tool call, but in practice some models emit reasoning and the tool call
 * as two SEPARATE `model.message` events in the same turn, each with its
 * own id — and `sourceEventId` can point at the reasoning-only event,
 * whose `toolCalls` array is empty. Looking the ref up by `sourceEventId`
 * then searching inside THAT event's toolCalls silently fails in that case.
 *
 * Instead, every time a `model.message` event arrives with toolCalls, we
 * index each call directly by its own `id`. `requiredActions[].toolCalls[].id`
 * is the SAME id, so this lookup is reliable regardless of which event
 * sourceEventId happens to point at.
 */
interface IndexedToolCall {
  call: any;
  threadId: string;
}

/**
 * Accumulator for a tool call being streamed piecemeal across many
 * `model.message.delta` events. Confirmed via logging (see agentStream
 * history) that this SDK/model NEVER emits a completed `model.message`
 * with a populated `toolCalls` array — the ONLY place tool call data
 * appears is inside `model.message.delta.toolCalls`, OpenAI-style:
 *
 *   delta 1: { toolCalls: [{ index: 0, id: "chatcmpl-tool-...",
 *                             type: "function",
 *                             toolInfo: {...},
 *                             function: { name: "ask_user_question", arguments: "" } }] }
 *   delta 2..N: { toolCalls: [{ index: 0, function: { arguments: "<fragment>" } }] }
 *   final delta: { finishReason: "tool_calls", usage: {...} }   // no toolCalls field
 *
 * `id`/`name`/`toolInfo` only arrive on the FIRST fragment; every
 * subsequent fragment only carries `index` + a partial `arguments` chunk
 * that must be string-concatenated. `finishReason: "tool_calls"` (no
 * `toolCalls` field) is the signal that accumulation for this message is
 * complete and safe to parse/index.
 */
interface ToolCallBuffer {
  id?: string;
  name?: string;
  toolInfo?: any;
  threadId: string;
  argsBuffer: string;
  flushed: boolean;
}

function extractPendingQuestion(
  label: string,
  requiredActions: any,
  toolCallIndex: Map<string, IndexedToolCall>,
  // kept only as a fallback for debug logging / legacy resolution if the
  // direct index somehow misses an entry
  eventIndex: Map<string, any>,
): PendingQuestion | null {
  if (!requiredActions) {
    log(
      label,
      "extractPendingQuestion: requiredActions is falsy, nothing to resolve",
    );
    return null;
  }

  const groups = Array.isArray(requiredActions)
    ? requiredActions
    : [requiredActions];

  log(
    label,
    `extractPendingQuestion: ${groups.length} group(s):`,
    trunc(groups, 1200),
  );

  for (const [gi, group] of groups.entries()) {
    const groupType = group?.type;
    log(label, `  group[${gi}] type=${groupType}`);

    // Only ask_user_question pauses resolve to a question; approvals and
    // other client-side tool responses are handled elsewhere (or ignored
    // here, since this agent config has no gated tools).
    if (
      groupType !== "tool.response_required" &&
      groupType !== "tool.approval_required"
    ) {
      log(label, `  group[${gi}] skipped — not a response/approval group`);
      continue;
    }

    const groupThreadId = group?.threadId ?? group?.thread_id ?? "main";
    const toolCalls = group?.toolCalls ?? group?.tool_calls ?? [];
    log(
      label,
      `  group[${gi}] threadId=${groupThreadId} toolCalls=${toolCalls.length}`,
    );

    for (const [ri, ref] of toolCalls.entries()) {
      const refId = ref?.id;
      const sourceEventId = ref?.sourceEventId ?? ref?.source_event_id;
      log(label, `    ref[${ri}] id=${refId} sourceEventId=${sourceEventId}`);

      if (!refId) {
        warn(label, `    ref[${ri}] missing id entirely:`, trunc(ref));
        continue;
      }

      // Primary path: direct toolCallId -> call index.
      const indexed = toolCallIndex.get(refId);
      let call: any = indexed?.call;
      let threadId = indexed?.threadId ?? groupThreadId;

      if (call) {
        log(
          label,
          `    ref[${ri}] resolved via toolCallIndex \u2192 name=${call.name ?? call.function?.name}`,
        );
      }

      // Fallback path: old sourceEventId -> event -> toolCalls[] lookup.
      if (!call && sourceEventId) {
        const sourceEvent = eventIndex.get(sourceEventId);
        const toolCallsOnMessage =
          sourceEvent?.toolCalls ?? sourceEvent?.tool_calls ?? [];
        call = toolCallsOnMessage.find((tc: any) => tc.id === refId);

        if (call) {
          log(
            label,
            `    ref[${ri}] resolved via sourceEventId fallback \u2192 name=${call.name ?? call.function?.name}`,
          );
        } else {
          warn(
            label,
            `    ref[${ri}] toolCallIndex miss AND sourceEventId fallback miss. ` +
              `sourceEvent found=${Boolean(sourceEvent)} its toolCalls=${trunc(toolCallsOnMessage)}. ` +
              `toolCallIndex currently has ${toolCallIndex.size} key(s): ${JSON.stringify([...toolCallIndex.keys()])}`,
          );
          continue;
        }
      }

      if (!call) {
        warn(
          label,
          `    ref[${ri}] unresolved — no toolCallIndex entry, no sourceEventId given`,
        );
        continue;
      }

      const toolName = call.name ?? call.function?.name ?? call.toolInfo?.name;
      log(label, `    ref[${ri}] toolName=${toolName}`);

      if (toolName !== "ask_user_question") {
        log(
          label,
          `    ref[${ri}] not ask_user_question — ignoring for question resolution`,
        );
        continue;
      }

      let args: any = {};
      try {
        const raw = call.arguments ?? call.function?.arguments;
        args = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
      } catch (e) {
        warn(
          label,
          `    ref[${ri}] failed to parse arguments:`,
          call.arguments ?? call.function?.arguments,
          e,
        );
        args = {};
      }

      log(label, `    ref[${ri}] resolved question:`, trunc(args));

      return {
        toolCallId: refId,
        threadId,
        question: args.question ?? "",
        options: Array.isArray(args.options) ? args.options : [],
      };
    }
  }

  warn(label, "extractPendingQuestion: exhausted all groups, resolved nothing");
  return null;
}

/**
 * Builds the `input` array to resume a paused turn after the user answered
 * a question, per the documented `user.tool_response` input item:
 *   { type: "user.tool_response", threadId, toolCallId, content }
 * `content` is the free-form answer text, NOT JSON-wrapped.
 */
export function buildAnswerInput(
  threadId: string,
  toolCallId: string,
  answer: string,
) {
  return [
    {
      type: "user.tool_response",
      threadId,
      toolCallId,
      content: answer,
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
  const runId = Math.random().toString(36).slice(2, 8);
  const runLabel = `${label}:${runId}`;

  log(runLabel, `=== streamAgentTurn START sessionId=${sessionId} ===`);
  log(runLabel, "input:", trunc(input, 2000));

  // Id-keyed index of every non-delta event seen on this stream — kept as a
  // fallback for extractPendingQuestion.
  const eventIndex = new Map<string, any>();

  // Direct toolCallId -> { call, threadId } index. Primary lookup path for
  // extractPendingQuestion. Populated by flushing toolCallBuffers below,
  // NOT from a completed model.message (that never arrives — see
  // ToolCallBuffer docstring).
  const toolCallIndex = new Map<string, IndexedToolCall>();

  // messageId:index -> accumulator for in-progress streamed tool calls.
  const toolCallBuffers = new Map<string, ToolCallBuffer>();

  // Running counters so the final summary log tells the whole story even if
  // you don't want to scroll through every line.
  let eventCount = 0;
  let reasoningCharsTotal = 0;
  let textCharsTotal = 0;
  let toolCallsSeenTotal = 0;
  let modelMessageCount = 0;

  try {
    log(runLabel, "calling trueforge.sessions.createTurnStream...");
    const stream = await trueforge.sessions.createTurnStream(sessionId, {
      input,
    } as any);
    log(runLabel, "stream opened, awaiting events");

    for await (const event of stream as unknown as AsyncIterable<TurnStreamingEvent>) {
      eventCount++;
      const evAny = event as any;

      if (evAny?.id && evAny.type !== "model.message.delta") {
        eventIndex.set(evAny.id, evAny);
      }

      // Per-event trace. Deltas are summarized (char count only) unless
      // VERBOSE is on, since a single turn can emit hundreds of them.
      if (event.type === "model.message.delta") {
        if (VERBOSE) {
          const tcSummary = Array.isArray(evAny.toolCalls)
            ? evAny.toolCalls
                .map(
                  (tc: any) =>
                    `idx${tc.index}:${trunc(tc.function?.arguments ?? "", 40)}`,
                )
                .join(",")
            : undefined;
          log(
            runLabel,
            `#${eventCount} model.message.delta id=${evAny.id} reasoningLen=${
              evAny.reasoningContent?.length ?? 0
            } contentLen=${typeof evAny.content === "string" ? evAny.content.length : 0}` +
              (tcSummary ? ` toolCallFrags=[${tcSummary}]` : "") +
              (evAny.finishReason ? ` finishReason=${evAny.finishReason}` : ""),
          );
        }
      } else {
        log(
          runLabel,
          `#${eventCount} ${event.type}`,
          trunc(event, event.type === "model.message" ? 2000 : 1200),
        );
      }

      switch (event.type) {
        case "turn.created":
          log(runLabel, `turn created: turnId=${event.turnId}`);
          sse(res, { type: "turn_start", turnId: event.turnId });
          break;

        case "model.message.delta": {
          if (event.reasoningContent) {
            reasoningCharsTotal += event.reasoningContent.length;
            sse(res, {
              type: "reasoning_delta",
              id: event.id,
              delta: event.reasoningContent,
            });
          }
          if (typeof event.content === "string") {
            textCharsTotal += event.content.length;
            sse(res, {
              type: "text_delta",
              id: event.id,
              delta: event.content,
            });
          }

          // Tool call streamed piecemeal — see ToolCallBuffer docstring.
          // Accumulate every fragment into the buffer keyed by
          // `${messageId}:${index}`. id/name/toolInfo only arrive on the
          // FIRST fragment for a given index; every later fragment only
          // has `index` + a partial `arguments` string to append.
          if (Array.isArray(evAny.toolCalls)) {
            for (const tc of evAny.toolCalls) {
              if (typeof tc?.index !== "number") {
                warn(
                  runLabel,
                  "tool call delta fragment missing index, skipping:",
                  trunc(tc),
                );
                continue;
              }
              const key = `${event.id}:${tc.index}`;
              let buf = toolCallBuffers.get(key);
              if (!buf) {
                buf = {
                  threadId: (event as any).threadId ?? "main",
                  argsBuffer: "",
                  flushed: false,
                };
                toolCallBuffers.set(key, buf);
                log(runLabel, `tool call buffer opened: ${key}`);
              }
              if (tc.id) buf.id = tc.id;
              if (tc.function?.name) buf.name = tc.function.name;
              if (tc.toolInfo) buf.toolInfo = tc.toolInfo;
              if (typeof tc.function?.arguments === "string") {
                buf.argsBuffer += tc.function.arguments;
              }
            }
          }

          // finishReason with no toolCalls field is the completion signal
          // for this message — every buffer opened under this event.id is
          // now fully accumulated and safe to finalize into toolCallIndex.
          if (evAny.finishReason && !Array.isArray(evAny.toolCalls)) {
            log(
              runLabel,
              `model.message.delta finishReason=${evAny.finishReason} for id=${event.id} — flushing tool call buffers`,
            );
            for (const [key, buf] of toolCallBuffers.entries()) {
              if (!key.startsWith(`${event.id}:`) || buf.flushed || !buf.id)
                continue;

              buf.flushed = true;
              toolCallsSeenTotal += 1;

              const call = {
                id: buf.id,
                name: buf.name,
                function: { name: buf.name, arguments: buf.argsBuffer },
                toolInfo: buf.toolInfo,
              };
              toolCallIndex.set(buf.id, { call, threadId: buf.threadId });
              log(
                runLabel,
                `  \u2192 finalized toolCallIndex[${buf.id}] = ${buf.name} args=${trunc(buf.argsBuffer, 300)}`,
              );

              let parsedArgs: unknown = {};
              try {
                parsedArgs = JSON.parse(buf.argsBuffer || "{}");
              } catch (e) {
                warn(
                  runLabel,
                  `  \u2192 failed to JSON.parse accumulated arguments for ${buf.id}:`,
                  buf.argsBuffer,
                  e,
                );
              }

              const normalized: NormalizedToolCall = {
                id: buf.id,
                name: buf.name ?? "tool",
                arguments: parsedArgs,
                toolInfo: buf.toolInfo,
                meaning: buf.name ? toolMeanings[buf.name] : undefined,
              };
              sse(res, {
                type: "tool_call_done",
                messageId: event.id,
                toolCalls: [normalized],
              });
            }
          }
          break;
        }

        case "model.message": {
          modelMessageCount++;
          log(
            runLabel,
            `model.message #${modelMessageCount}: id=${event.id} threadId=${
              (event as any).threadId ?? "main"
            } hasReasoning=${Boolean(event.reasoningContent)} toolCallCount=${
              Array.isArray(event.toolCalls) ? event.toolCalls.length : 0
            }`,
          );

          if (event.reasoningContent) {
            sse(res, {
              type: "reasoning_done",
              id: event.id,
              content: event.reasoningContent,
            });
          }
          if (Array.isArray(event.toolCalls) && event.toolCalls.length) {
            toolCallsSeenTotal += event.toolCalls.length;

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

            log(
              runLabel,
              `model.message #${modelMessageCount} toolCalls:`,
              normalized.map((n) => ({
                id: n.id,
                name: n.name,
                args: trunc(n.arguments, 300),
              })),
            );

            // Populate the direct toolCallId -> call index. This is what
            // lets extractPendingQuestion resolve a requiredActions ref
            // even when sourceEventId points at a different (e.g.
            // reasoning-only) model.message event.
            const messageThreadId = (event as any).threadId ?? "main";
            for (const tc of event.toolCalls as any[]) {
              if (tc?.id) {
                toolCallIndex.set(tc.id, {
                  call: tc,
                  threadId: messageThreadId,
                });
                log(
                  runLabel,
                  `  \u2192 indexed toolCallIndex[${tc.id}] = ${
                    tc.name ?? tc.function?.name ?? tc.toolInfo?.name
                  } (thread=${messageThreadId})`,
                );
              } else {
                warn(
                  runLabel,
                  "  \u2192 toolCall missing id, cannot index:",
                  trunc(tc),
                );
              }
            }

            sse(res, {
              type: "tool_call_done",
              messageId: event.id,
              toolCalls: normalized,
            });
          } else if (!event.reasoningContent) {
            // Expected/benign: this SDK emits `model.message` as an
            // "id assigned" announcement BEFORE any content streams in —
            // reasoning and tool calls both arrive later via
            // `model.message.delta`, not on this event. Not a warning.
            log(
              runLabel,
              `model.message #${modelMessageCount} is an id-assignment placeholder (no content yet, as expected)`,
            );
          }
          break;
        }

        case "tool.response":
          log(
            runLabel,
            `tool.response toolCallId=${event.toolCallId} content=${trunc(event.content, 400)}`,
          );
          sse(res, {
            type: "tool_result",
            toolCallId: event.toolCallId,
            content: event.content,
          });
          break;

        // Discrete pause events — emitted mid-stream, ahead of turn.done,
        // per the documented protocol. Handle them here so a question is
        // surfaced the moment it happens rather than waiting for turn.done.
        case "tool.response_required":
        case "tool.approval_required": {
          log(runLabel, `${event.type} fired — attempting resolution`);
          const pending = extractPendingQuestion(
            runLabel,
            [event as any],
            toolCallIndex,
            eventIndex,
          );
          if (pending) {
            log(runLabel, "\u2705 resolved pending question:", pending);
            sse(res, {
              type: "question_required",
              toolCallId: pending.toolCallId,
              threadId: pending.threadId,
              question: pending.question,
              options: pending.options,
            });
            if (hooks.onQuestionRequired) {
              await hooks.onQuestionRequired(pending);
            }
            log(runLabel, `=== streamAgentTurn PAUSED (question_required) ===`);
            return; // pause here, exactly like auth_required
          }
          warn(
            runLabel,
            `${event.type} fired but no ask_user_question could be resolved from it — full event dump:`,
            JSON.stringify(event),
          );
          break;
        }

        case "thread.created":
          log(
            runLabel,
            `thread.created threadId=${event.threadId} agent=${event.agentInfo?.name}`,
          );
          sse(res, {
            type: "thread_start",
            threadId: event.threadId,
            parentToolCallId: (event.parent as any)?.toolCallId,
            agentName: event.agentInfo?.name,
            agentInput: (event.agentInfo as any)?.input,
          });
          break;

        case "thread.done":
          log(runLabel, `thread.done threadId=${(event as any).threadId}`);
          sse(res, { type: "thread_end", threadId: (event as any).threadId });
          break;

        case "mcp.auth_required":
          log(runLabel, "mcp.auth_required:", trunc(event.mcpServers));
          sse(res, {
            type: "auth_required",
            mcpServers: (event.mcpServers as any[]).map((s) => ({
              id: s.id,
              name: s.name,
              authUrl: s.authUrl,
            })),
          });
          await hooks.onAuthRequired();
          log(runLabel, `=== streamAgentTurn PAUSED (auth_required) ===`);
          return;

        case "turn.done": {
          const state = event.state as any;
          const status = state?.status ?? "done";

          log(
            runLabel,
            `turn.done status=${status} requiredActions=${trunc(
              state?.requiredActions ?? null,
              1000,
            )} output=${trunc(state?.output, 500)}`,
          );
          log(
            runLabel,
            `run summary: events=${eventCount} modelMessages=${modelMessageCount} toolCallsSeen=${toolCallsSeenTotal} reasoningChars=${reasoningCharsTotal} textChars=${textCharsTotal}`,
          );

          if (status === "cancelled" || status === "error") {
            warn(
              runLabel,
              `turn ended with status=${status}, full state:`,
              trunc(state, 2000),
            );
            sse(res, {
              type: "turn_done",
              status,
              requiredActions: state?.requiredActions,
            });
            break;
          }

          // status is "done" here — but per the documented protocol that
          // does NOT mean the turn actually finished. Always check
          // requiredActions regardless of status.
          const pending = extractPendingQuestion(
            runLabel,
            state?.requiredActions,
            toolCallIndex,
            eventIndex,
          );
          if (pending) {
            log(
              runLabel,
              "\u2705 resolved pending question from turn.done:",
              pending,
            );
            sse(res, {
              type: "question_required",
              toolCallId: pending.toolCallId,
              threadId: pending.threadId,
              question: pending.question,
              options: pending.options,
            });
            if (hooks.onQuestionRequired) {
              await hooks.onQuestionRequired(pending);
            }
            log(
              runLabel,
              `=== streamAgentTurn PAUSED (question_required via turn.done) ===`,
            );
            return; // pause here, exactly like auth_required
          }

          if (
            !state?.requiredActions &&
            textCharsTotal === 0 &&
            toolCallsSeenTotal === 0
          ) {
            warn(
              runLabel,
              "turn.done with status=done, NO requiredActions, NO tool calls seen, and NO text output. " +
                "The model produced only reasoning (or nothing) and never called a tool or emitted final text. " +
                "This usually means the model ended its turn without following the 'call ask_user_question first' " +
                "instruction — a prompt/model issue, not a stream-plumbing issue.",
            );
          } else if (!state?.requiredActions && toolCallsSeenTotal > 0) {
            warn(
              runLabel,
              `turn.done with status=done and NO requiredActions, but ${toolCallsSeenTotal} tool call(s) WERE seen this run. ` +
                "Check the tool.response/model.message logs above to see what those calls were — if one was " +
                "ask_user_question and it got a tool.response instead of pausing, the model may have answered its " +
                "own question, or the tool executed instead of pausing for user input.",
            );
          }

          sse(res, {
            type: "turn_done",
            status,
            requiredActions: state?.requiredActions,
          });
          log(runLabel, `=== streamAgentTurn DONE (status=${status}) ===`);
          break;
        }

        default:
          warn(
            runLabel,
            `unhandled event type: ${(event as any)?.type}`,
            trunc(event, 1200),
          );
          break;
      }
    }

    log(
      runLabel,
      `stream closed without a terminal turn.done/pause. Final counts: events=${eventCount} modelMessages=${modelMessageCount} toolCallsSeen=${toolCallsSeenTotal}`,
    );
  } catch (error: any) {
    warn(
      runLabel,
      "=== streamAgentTurn THREW ===",
      error?.message,
      error?.stack,
    );
    sse(res, {
      type: "error",
      message: error?.message ?? "Agent stream failed",
    });
    await hooks.onError(error?.message ?? "Agent stream failed");
  }
}
