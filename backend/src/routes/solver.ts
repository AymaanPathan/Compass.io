import { Router, Request, Response } from "express";
import { agentClient, SOLVER_AGENT_NAME } from "../services/agentClient";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS !== "false";

const router = Router();

interface SolverInput {
  matchedRepository: {
    name: string;
    url: string;
    description: string;
    whyItMatches: string;
  };

  issue: {
    title: string;
    url: string;
  };

  explanation: {
    whatIsHappening: string;
    whyItMatters: string;
    howToThinkAboutFixingIt: string;
    thingsToKeepInMind: string[];
  };

  solveApproach: {
    summary: string;
    steps: string[];
    risks: string[];
    testingNotes: string;
    testCommand: string;
  };

  relevantFiles: {
    path: string;
    url: string;
    whyRelevant: string;
    keySymbols: string[];
  }[];
}

type SolverResult =
  | {
      status: "success";

      issue?: {
        title: string;
        url: string;
      };

      implementation?: {
        summary: string;
        filesChanged: {
          path: string;
          change: string;
        }[];
      };

      validation?: {
        testsRun: {
          command: string;
          result: string;
        }[];
        testSummary: string;
        diffCheck: string;
      };

      finalDiff?: {
        filesChanged: number;
        insertions: number;
        deletions: number;
      };
    }
  | {
      status: "blocked";
      reason?: string;
    }
  | {
      status: "failed";
    };

function isValidSolverInput(input: any): input is SolverInput {
  return Boolean(
    input?.matchedRepository &&
    input?.issue &&
    input?.explanation &&
    input?.solveApproach &&
    input?.relevantFiles,
  );
}

function isIterationLimitError(error: any): boolean {
  return String(error?.message || error || "")
    .toLowerCase()
    .includes("iteration limit");
}

function extractOutputText(content: any): string {
  if (!content) return "";

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;

        if (typeof item?.text === "string") {
          return item.text;
        }

        if (typeof item?.content === "string") {
          return item.content;
        }

        return "";
      })
      .join("");
  }

  if (typeof content?.text === "string") {
    return content.text;
  }

  return "";
}

function parseSolverResult(text: string): SolverResult {
  try {
    const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "");

    return JSON.parse(cleaned) as SolverResult;
  } catch {
    console.error("[solver route] Failed to parse agent output as JSON:", text);

    return {
      status: "failed",
    };
  }
}

// The message sent on the FIRST turn of a session.
function buildInitialMessage(input: SolverInput): string {
  return JSON.stringify(input);
}

// The message sent on RETRY turns within the same session.
function buildResumeMessage(
  reason: "rate_limited" | "cancelled" | "retryable",
): string {
  const why =
    reason === "rate_limited"
      ? "The previous turn was interrupted by a provider rate limit (429), not by anything wrong with your plan or progress."
      : reason === "cancelled"
        ? "The previous turn was cancelled or abandoned by the runtime, likely because a tool call took too long. This is not a reason to restart the task."
        : "The previous turn ended because of a transient runtime or provider issue, not because your plan or implementation was wrong.";

  return [
    why,
    "Continue the SAME task from where you left off in this session.",
    "Do not restart discovery.",
    "Do not re-clone the repository if /repo already contains it.",
    "Do not repeat successful commands.",
    "Do not repeat commands that already failed because of the sandbox environment.",
    "If an edit was already applied, inspect its current state before editing again.",
    "Resume directly from the next incomplete step: PREPARE, READ, IMPLEMENT, TEST, or VALIDATE.",
    "Do not re-derive the solution.",
  ].join(" ");
}

// ------------------------------------------------------------
// SSE payload shapes sent to the frontend
// ------------------------------------------------------------

type SolverStreamEvent =
  | {
      type: "log";
      ts: number;
      level: "info" | "warn" | "error";
      message: string;
    }
  | {
      type: "step";
      ts: number;
      stepId: string;
      label: string;
      status: "running" | "done" | "error";
      detail?: string;
    }
  | {
      type: "reasoning";
      ts: number;
      text: string;
    }
  | {
      type: "waiting";
      ts: number;
      reason: "rate_limited" | "retryable" | "cancelled";
      waitMs: number;
      attempt: number;
      maxAttempts: number;
    }
  | {
      type: "result";
      ts: number;
      result: SolverResult & {
        raw?: string;
      };
    }
  | {
      type: "fatal";
      ts: number;
      error: string;
    };

function sendEvent(res: Response, payload: SolverStreamEvent): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// ------------------------------------------------------------
// Tool labels
// ------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  exec: "Running shell command",
  read_file: "Reading file",
  write_file: "Writing file",
  list_directory: "Listing directory",
  git_clone: "Clone repository",
  git_diff: "Checking diff",
};

function labelForTool(name: string, args: string): string {
  if (TOOL_LABELS[name]) {
    return TOOL_LABELS[name];
  }

  const lower = `${name} ${args}`.toLowerCase();

  if (lower.includes("clone")) {
    return "Clone repository";
  }

  if (lower.includes("diff")) {
    return "Checking diff";
  }

  if (lower.includes("test")) {
    return "Running tests";
  }

  if (lower.includes("read")) {
    return "Reading file";
  }

  if (lower.includes("write") || lower.includes("edit")) {
    return "Writing file";
  }

  return `Tool: ${name}`;
}

// ------------------------------------------------------------
// Run one TrueForge turn
// ------------------------------------------------------------

async function runTurnStreamed(
  sessionId: string,
  content: string,
  res: Response,
  toolCallLabels: Map<string, string>,
): Promise<string> {
  let finalText = "";

  const stream = await agentClient.sessions.createTurnStream(sessionId, {
    input: [
      {
        type: "user.message",
        content,
      },
    ],
  });

  for await (const event of stream) {
    const ts = Date.now();

    if (DEBUG_AGENT_EVENTS) {
      console.log(
        `[solver agent event] ${event?.type}`,
        JSON.stringify(event).slice(0, 500),
      );
    }

    switch (event?.type) {
      case "turn.created": {
        sendEvent(res, {
          type: "log",
          ts,
          level: "info",
          message: "Turn started",
        });

        break;
      }

      case "thread.created": {
        const name = event.agentInfo?.name ?? event.title ?? event.threadId;

        sendEvent(res, {
          type: "log",
          ts,
          level: "info",
          message: `Sub-agent thread started: ${name}`,
        });

        break;
      }

      case "sandbox.created": {
        sendEvent(res, {
          type: "step",
          ts,
          stepId: `sandbox-${event.sandboxId}`,
          label: "Sandbox created",
          status: "done",
          detail: event.sandboxId,
        });

        console.log(`[solver agent] sandbox created: ${event.sandboxId}`);

        break;
      }

      case "model.message.delta": {
        if (event.reasoningContent) {
          sendEvent(res, {
            type: "reasoning",
            ts,
            text: event.reasoningContent,
          });
        }

        const chunk = extractOutputText(event.content);

        if (chunk) {
          finalText += chunk;
        }

        if (Array.isArray(event.toolCalls)) {
          for (const call of event.toolCalls) {
            if (
              call.id &&
              call.function?.name &&
              !toolCallLabels.has(call.id)
            ) {
              const label = labelForTool(
                call.function.name,
                call.function?.arguments ?? "",
              );

              toolCallLabels.set(call.id, label);

              sendEvent(res, {
                type: "step",
                ts,
                stepId: call.id,
                label,
                status: "running",
              });

              console.log(
                `[solver agent] tool call started: ${call.function.name} (${call.id})`,
              );
            }
          }
        }

        break;
      }

      case "model.message": {
        const outputText = extractOutputText(event.content);

        if (outputText) {
          finalText = finalText || outputText;
        }

        if (event.reasoningContent) {
          sendEvent(res, {
            type: "reasoning",
            ts,
            text: event.reasoningContent,
          });
        }

        if (Array.isArray(event.toolCalls)) {
          for (const call of event.toolCalls) {
            const label = labelForTool(
              call.function.name,
              call.function.arguments,
            );

            toolCallLabels.set(call.id, label);

            sendEvent(res, {
              type: "step",
              ts,
              stepId: call.id,
              label,
              status: "running",
            });

            console.log(
              `[solver agent] tool call: ${call.function.name} args=${call.function.arguments?.slice(
                0,
                200,
              )}`,
            );
          }
        }

        break;
      }

      case "tool.response": {
        const label = toolCallLabels.get(event.toolCallId) ?? "Tool call";

        const detail = String(event.content ?? "").slice(0, 300);

        sendEvent(res, {
          type: "step",
          ts,
          stepId: event.toolCallId,
          label,
          status: "done",
          detail,
        });

        console.log(
          `[solver agent] tool response for ${event.toolCallId}: ${detail}`,
        );

        break;
      }

      case "tool.approval_required":
      case "tool.response_required": {
        const message = `Agent is waiting on ${
          event.type === "tool.approval_required"
            ? "tool approval"
            : "a tool response"
        } — no human-in-the-loop handler is wired up on this route, so this will stall until timeout.`;

        sendEvent(res, {
          type: "log",
          ts,
          level: "warn",
          message,
        });

        console.warn(`[solver agent] ${event.type} — unhandled`);

        break;
      }

      case "mcp.auth_required": {
        sendEvent(res, {
          type: "log",
          ts,
          level: "warn",
          message: "MCP server requires authentication",
        });

        break;
      }

      case "turn.done": {
        console.log("[solver agent] turn status:", event.state?.status);

        if (event.state?.status === "done") {
          const outputText = extractOutputText(event.state.output?.content);

          if (outputText) {
            finalText = outputText;
          }

          sendEvent(res, {
            type: "log",
            ts,
            level: "info",
            message: "Turn completed",
          });
        }

        if (event.state?.status === "error") {
          const message = event.state.message || "Agent turn failed";

          sendEvent(res, {
            type: "log",
            ts,
            level: "error",
            message,
          });

          throw new Error(message);
        }

        if (event.state?.status === "cancelled") {
          sendEvent(res, {
            type: "log",
            ts,
            level: "warn",
            message: "Turn was cancelled",
          });

          throw new Error("Agent turn cancelled");
        }

        break;
      }

      default: {
        if (DEBUG_AGENT_EVENTS) {
          console.log(`[solver agent] unhandled event type: ${event?.type}`);
        }
      }
    }
  }

  return finalText.trim();
}

// ------------------------------------------------------------
// Run solver agent
// ------------------------------------------------------------

async function runSolverAgentStreamed(
  input: SolverInput,
  res: Response,
): Promise<SolverResult & { raw?: string }> {
  // Create exactly one session per request.
  //
  // Retries create new turns in this same session, allowing the
  // agent to retain the repository state and previous progress.
  const sessionResponse = await agentClient.sessions.create({
    agent: {
      name: SOLVER_AGENT_NAME,
    },
  });

  const session = sessionResponse.data;

  console.log(`[solver agent] session created: ${session.id}`);

  sendEvent(res, {
    type: "log",
    ts: Date.now(),
    level: "info",
    message: `Session created (${session.id})`,
  });

  const toolCallLabels = new Map<string, string>();

  let isFirstAttempt = true;

  let lastRetryReason: "rate_limited" | "cancelled" | "retryable" = "retryable";

  const finalText = await withAgentRetry(
    async () => {
      const content = isFirstAttempt
        ? buildInitialMessage(input)
        : buildResumeMessage(lastRetryReason);

      isFirstAttempt = false;

      return runTurnStreamed(session.id, content, res, toolCallLabels);
    },
    {
      // Keep retries bounded.
      //
      // The solver should not keep an SSE request alive for an
      // extremely long time because of provider rate limits or
      // repeated runtime cancellations.
      maxAttempts: 10,

      maxRateLimitAttempts: 10,

      maxCancelledAttempts: 10,

      onWait: (info) => {
        lastRetryReason = info.kind;

        const ts = Date.now();

        const message =
          info.kind === "rate_limited"
            ? `Provider rate limited the request — waiting ${Math.round(
                info.waitMs / 1000,
              )}s before retry ${info.attempt}/${info.maxAttempts} (same session, new turn)`
            : info.kind === "cancelled"
              ? `Turn cancelled — waiting ${Math.round(
                  info.waitMs / 1000,
                )}s before retry ${info.attempt}/${info.maxAttempts} (same session, new turn)`
              : `Transient error — waiting ${Math.round(
                  info.waitMs / 1000,
                )}s before retry ${info.attempt}/${info.maxAttempts} (same session, new turn)`;

        console.warn(`[solver agent] ${message}`);

        sendEvent(res, {
          type: "waiting",
          ts,
          reason: info.kind,
          waitMs: info.waitMs,
          attempt: info.attempt,
          maxAttempts: info.maxAttempts,
        });
      },
    },
  );

  return {
    ...parseSolverResult(finalText),
    raw: finalText,
  };
}

// ------------------------------------------------------------
// POST /api/solver/run
// ------------------------------------------------------------

router.post("/run", async (req: Request, res: Response) => {
  const input = req.body as Partial<SolverInput>;

  if (!isValidSolverInput(input)) {
    return res.status(400).json({
      error:
        "Missing required fields: matchedRepository, issue, explanation, solveApproach, relevantFiles",
    });
  }

  res.setHeader("Content-Type", "text/event-stream");

  res.setHeader("Cache-Control", "no-cache, no-transform");

  res.setHeader("Connection", "keep-alive");

  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
  });

  try {
    const result = await runSolverAgentStreamed(input as SolverInput, res);

    console.log(
      "[solver agent] final output length:",
      (result.raw ?? "").length,
    );

    sendEvent(res, {
      type: "result",
      ts: Date.now(),
      result,
    });
  } catch (error: any) {
    if (isIterationLimitError(error)) {
      console.warn(
        "[solver route] Agent hit iteration limit — returning blocked",
      );

      sendEvent(res, {
        type: "result",
        ts: Date.now(),
        result: {
          status: "blocked",
          reason: "iteration_limit",
        },
      });
    } else {
      console.error(
        "[solver route] Unhandled error running solver agent:",
        error.response?.data || error.message || error,
      );

      sendEvent(res, {
        type: "fatal",
        ts: Date.now(),
        error: error.message || "Solver agent execution failed",
      });
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

export default router;
