import { agentClient } from "./agentClient";

interface RunAgentOptions {
  agentName: string;
  prompt: string;
  label: string;
  /**
   * Per-user GitHub OAuth access token. When provided, it's forwarded to
   * the session's "github" MCP server so tools like get_me/search_repositories
   * run against the correct authenticated developer's account instead of
   * whatever default/service credentials the MCP server would otherwise use.
   */
  githubAccessToken?: string;
}

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

export async function runAgent({
  agentName,
  prompt,
  label,
  githubAccessToken,
}: RunAgentOptions): Promise<string> {
  const startedAt = Date.now();

  console.log(`\n[agent:${label}] ─────────────────────────────`);
  console.log(`[agent:${label}] starting`);
  console.log(`[agent:${label}] agent=${agentName}`);
  console.log(`[agent:${label}] prompt=${prompt}`);

  try {
    // ------------------------------------------------------------
    // Create session
    // ------------------------------------------------------------

    console.log(`[agent:${label}] creating session...`);

    const { data: session } = await agentClient.sessions.create({
      agent: {
        name: agentName,
      },
      // Scope the GitHub MCP server to the authenticated user's own token
      // for this session, rather than any shared/default credential, so
      // tools like get_me resolve to the right developer.
      ...(githubAccessToken
        ? {
            mcpServers: [
              {
                name: "github",
                headers: {
                  Authorization: `Bearer ${githubAccessToken}`,
                },
              },
            ],
          }
        : {}),
    });

    console.log(`[agent:${label}] session created: ${session.id}`);

    // ------------------------------------------------------------
    // Create turn
    // ------------------------------------------------------------

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

    // ------------------------------------------------------------
    // Consume events
    // ------------------------------------------------------------

    let eventCount = 0;

    for await (const { data: event } of stream.withMetadata()) {
      eventCount++;

      switch (event.type) {
        case "turn.created":
          console.log(
            `[agent:${label}] turn.created`,
            `turnId=${event.turnId}`,
          );
          break;

        case "mcp.initialize":
          console.log(
            `[agent:${label}] mcp.initialize`,
            `servers=${event.mcpServers
              .map((server) => server.name)
              .join(", ")}`,
          );
          break;

        case "model.message":
          console.log(`[agent:${label}] model.message`, `id=${event.id}`);
          break;

        case "model.message.delta":
          if (event.toolCalls?.length) {
            for (const toolCall of event.toolCalls) {
              const toolInfo = toolCall.toolInfo;

              if (toolInfo?.type === "mcp") {
                console.log(
                  `[agent:${label}] tool.call`,
                  `tool=${toolInfo.name}`,
                  `server=${toolInfo.serverName}`,
                );
              } else if (toolInfo) {
                console.log(
                  `[agent:${label}] tool.call`,
                  `tool=${toolInfo.name}`,
                  `type=${toolInfo.type}`,
                );
              }
            }
          }

          if (event.content) {
            console.log(
              `[agent:${label}] model.output.delta`,
              preview(event.content, 120),
            );
          }

          if (event.finishReason) {
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

        case "mcp.auth_required":
          console.warn(`[agent:${label}] mcp.auth_required`, event.mcpServers);
          break;

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
            throw new Error(`Agent turn ended with status: ${status}`);
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

          return text;
        }

        default:
          console.log(`[agent:${label}] event=${event.type}`);
      }
    }

    throw new Error("Agent stream ended without turn.done");
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
