import { agentClient } from "./agentClient";

interface RunAgentOptions {
  agentName: string;
  prompt: string;
  label: string;
}

interface ResumeAgentOptions {
  sessionId: string;
  label: string;
}

export interface AgentAuthRequiredResult {
  status: "auth_required";
  sessionId: string;
  authUrls: { name: string; authUrl: string }[];
}

export interface AgentDoneResult {
  status: "done";
  sessionId: string;
  text: string;
}

export type AgentRunResult = AgentDoneResult | AgentAuthRequiredResult;

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item: any) => {
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

  if (
    content &&
    typeof content === "object" &&
    "text" in content &&
    typeof (content as any).text === "string"
  ) {
    return (content as any).text;
  }

  return "";
}

function preview(value: unknown, max = 500): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}...`;
}

/**
 * Consumes a turn stream to completion. Shared by runAgent (new session)
 * and resumeAgent (existing session, empty input after auth).
 */
async function consumeStream(
  sessionId: string,
  label: string,
  startedAt: number,
  stream: Awaited<ReturnType<typeof agentClient.sessions.createTurnStream>>,
): Promise<AgentRunResult> {
  let eventCount = 0;

  // Track state across deltas so a failed/truncated turn still leaves us
  // something useful to log instead of just the last 120-char fragment.
  let accumulatedOutput = "";
  let lastFinishReason: string | undefined;
  const toolCallLog: string[] = [];

  for await (const { data: event } of stream.withMetadata()) {
    eventCount++;

    switch (event.type) {
      case "turn.created":
        console.log(`[agent:${label}] turn.created`, `turnId=${event.turnId}`);
        break;

      case "mcp.initialize":
        console.log(
          `[agent:${label}] mcp.initialize`,
          `servers=${event.mcpServers.map((server) => server.name).join(", ")}`,
        );
        break;

      case "model.message":
        console.log(`[agent:${label}] model.message`, `id=${event.id}`);
        break;

      case "model.message.delta":
        if (event.toolCalls?.length) {
          for (const toolCall of event.toolCalls) {
            const toolInfo = (toolCall as any).toolInfo;
            const args =
              (toolCall as any).arguments ??
              (toolCall as any).input ??
              undefined;

            if (toolInfo?.type === "mcp") {
              const line = `tool=${toolInfo.name} server=${toolInfo.serverName}${
                args ? ` args=${preview(args, 200)}` : ""
              }`;
              toolCallLog.push(line);
              console.log(`[agent:${label}] tool.call`, line);
            } else if (toolInfo) {
              const line = `tool=${toolInfo.name} type=${toolInfo.type}${
                args ? ` args=${preview(args, 200)}` : ""
              }`;
              toolCallLog.push(line);
              console.log(`[agent:${label}] tool.call`, line);
            } else {
              // No toolInfo at all — this is the case that was previously
              // silent, e.g. the model calling a tool not in enableTools.
              const raw = preview(toolCall, 300);
              toolCallLog.push(`unrecognized tool.call raw=${raw}`);
              console.warn(
                `[agent:${label}] tool.call (unrecognized/rejected)`,
                raw,
              );
            }
          }
        }

        if (event.content) {
          accumulatedOutput += event.content;
          console.log(
            `[agent:${label}] model.output.delta`,
            preview(event.content, 120),
          );
        }

        if (event.finishReason) {
          lastFinishReason = event.finishReason;
          console.log(
            `[agent:${label}] model.finish`,
            `reason=${event.finishReason}`,
          );
        }

        break;

      case "tool.response":
        console.log(
          `[agent:${label}] tool.response`,
          `toolCallId=${event.toolCallId}`,
          `content=${preview(event.content)}`,
        );
        break;

      case "tool.response_required":
        console.log(`[agent:${label}] tool.response_required`);
        break;

      case "tool.approval_required":
        console.log(`[agent:${label}] tool.approval_required`);
        break;

      case "mcp.auth_required": {
        console.warn(`[agent:${label}] mcp.auth_required`, event.mcpServers);

        const authUrls = event.mcpServers.map((server) => ({
          name: server.name,
          authUrl: server.authUrl,
        }));

        console.log(
          `[agent:${label}] pausing for auth`,
          `session=${sessionId}`,
          `servers=${authUrls.map((s) => s.name).join(", ")}`,
        );

        return {
          status: "auth_required",
          sessionId,
          authUrls,
        };
      }

      case "sandbox.created":
        console.log(`[agent:${label}] sandbox.created`);
        break;

      case "thread.created":
        console.log(
          `[agent:${label}] thread.created`,
          `threadId=${event.threadId}`,
        );
        break;

      case "turn.done": {
        const status = event.state.status;

        console.log(`[agent:${label}] turn.done`, `status=${status}`);

        if (status !== "done") {
          const duration = Date.now() - startedAt;

          console.error(
            `[agent:${label}] TURN FAILED`,
            `duration=${duration}ms`,
          );
          console.error(
            `[agent:${label}] lastFinishReason=${lastFinishReason ?? "unknown"}`,
          );
          console.error(
            `[agent:${label}] toolCalls=${toolCallLog.length ? toolCallLog.join(" | ") : "none"}`,
          );
          console.error(
            `[agent:${label}] accumulatedOutput(${accumulatedOutput.length} chars)=`,
            preview(accumulatedOutput, 1500),
          );
          console.log(`[agent:${label}] ─────────────────────────────\n`);

          throw new Error(
            `Agent turn ended with status: ${status} (finishReason=${
              lastFinishReason ?? "unknown"
            })`,
          );
        }

        const output = event.state.output;

        if (!output) {
          throw new Error("Agent completed without output");
        }

        const text = extractTextContent(output.content);

        if (!text.trim()) {
          throw new Error("Agent completed with empty output");
        }

        const duration = Date.now() - startedAt;

        console.log(
          `[agent:${label}] completed`,
          `events=${eventCount}`,
          `duration=${duration}ms`,
        );

        console.log(`[agent:${label}] output=${preview(text, 1000)}`);

        console.log(`[agent:${label}] ─────────────────────────────\n`);

        return { status: "done", sessionId, text };
      }

      default:
        console.log(`[agent:${label}] event=${event.type}`);
    }
  }

  throw new Error("Agent stream ended without turn.done");
}

export async function runAgent({
  agentName,
  prompt,
  label,
}: RunAgentOptions): Promise<AgentRunResult> {
  const startedAt = Date.now();

  console.log(`\n[agent:${label}] ─────────────────────────────`);
  console.log(`[agent:${label}] starting`);
  console.log(`[agent:${label}] agent=${agentName}`);
  console.log(`[agent:${label}] prompt=${prompt}`);

  try {
    console.log(`[agent:${label}] creating session...`);

    const { data: session } = await agentClient.sessions.create({
      agent: {
        name: agentName,
      },
    });

    console.log(`[agent:${label}] session created: ${session.id}`);
    console.log(`[agent:${label}] creating turn...`);

    const stream = await agentClient.sessions.createTurnStream(session.id, {
      input: [
        {
          type: "user.message",
          content: prompt,
        },
      ],
    });

    console.log(`[agent:${label}] turn stream opened`);

    return await consumeStream(session.id, label, startedAt, stream);
  } catch (error: any) {
    const duration = Date.now() - startedAt;

    console.error(`[agent:${label}] FAILED`, `duration=${duration}ms`);

    console.error(
      `[agent:${label}] error=`,
      error?.response?.data || error?.message || error,
    );

    throw error;
  }
}

/**
 * Resumes a session that previously paused on mcp.auth_required, after the
 * user has completed the OAuth flow for the listed server(s). Per TrueForge
 * docs, the resuming turn must NOT include a user.message — input is empty
 * so the agent continues the interrupted work.
 */
export async function resumeAgent({
  sessionId,
  label,
}: ResumeAgentOptions): Promise<AgentRunResult> {
  const startedAt = Date.now();

  console.log(`\n[agent:${label}] ─────────────────────────────`);
  console.log(`[agent:${label}] resuming session=${sessionId}`);

  try {
    const stream = await agentClient.sessions.createTurnStream(sessionId, {});

    console.log(`[agent:${label}] resume stream opened`);

    return await consumeStream(sessionId, label, startedAt, stream);
  } catch (error: any) {
    const duration = Date.now() - startedAt;

    console.error(`[agent:${label}] RESUME FAILED`, `duration=${duration}ms`);

    console.error(
      `[agent:${label}] error=`,
      error?.response?.data || error?.message || error,
    );

    throw error;
  }
}
