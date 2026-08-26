/**
 * Shared helpers for turning raw agent text output into JSON.
 * Every route that talks to an LLM agent should use these instead of
 * rolling its own — keeps parsing behavior identical across agents.
 */

export function stripMarkdownFences(input: string): string {
  return input
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Extracts the first balanced {...} block from a string. */
export function extractBalancedJson(input: string): string | null {
  const start = input.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }

  return null;
}

export function parseAgentJson<T = any>(text: string): T | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const jsonStr = extractBalancedJson(cleaned);
    if (!jsonStr) return null;
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

/** Extracts plain text from the various shapes TrueForge event.content can take. */
export function extractOutputText(content: any): string {
  if (!content) return "";

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .join("");
  }

  if (typeof content?.text === "string") return content.text;

  return "";
}

export function isRateLimitError(error: any): boolean {
  const status = error?.response?.status ?? error?.status ?? error?.statusCode;
  if (status === 429) return true;

  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

/**
 * Runs a single non-streaming turn against a fresh session and returns
 * the final text output. Used by the short, bounded agents (repo
 * recommender, issue explainer, solve approach) that don't need a live
 * SSE feed — only the bounded-solver execution does.
 */
export async function runSingleTurnAgent(
  agentClient: any,
  agentName: string,
  prompt: string,
  debugLabel: string,
  debug = process.env.DEBUG_AGENT_EVENTS === "true",
): Promise<string> {
  const { data: session } = await agentClient.sessions.create({
    agent: { name: agentName },
  });

  const stream = await agentClient.sessions.createTurnStream(session.id, {
    input: [{ type: "user.message", content: prompt }],
  });

  let finalText = "";

  for await (const { data: event } of stream.withMetadata()) {
    if (debug) {
      console.log(`[${debugLabel} agent event] ${event?.type}`);
    }

    if (event.type === "model.message.delta" && event.threadId === "main") {
      if (typeof event.content === "string") {
        finalText += event.content;
      }
    }

    if (event.type === "turn.done") {
      const status = event.state?.status;
      console.log(`[${debugLabel}] turn status:`, status);

      if (status === "error") {
        throw new Error((event.state as any)?.message || "Agent turn failed");
      }
      if (status !== "done") {
        throw new Error(`Agent turn ended with unexpected status: ${status}`);
      }

      if (event.state?.output?.content) {
        const text = extractOutputText(event.state.output.content);
        if (text) finalText = text;
      }
    }
  }

  if (!finalText.trim()) {
    throw new Error("Agent returned empty output");
  }

  return finalText.trim();
}
