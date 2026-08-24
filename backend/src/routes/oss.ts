import { Router, Request, Response } from "express";
import { TrueForge } from "@truefoundry/trueforge-sdk";
import { withAgentRetry } from "../utils/retryAgentTurn";

const router = Router();

const client = new TrueForge({
  baseUrl: process.env.TRUEFORGE_BASE_URL || "http://localhost:8791",
  timeoutInSeconds: 600,
});

const OSS_AGENT_NAME = "oss-discover-agent";

export interface OssRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string;
  primaryTechnology: string;
  fitScore: number;
  whyItMatches: string;
  difficulty: "intermediate";
}

const REQUIRED_FIELDS: (keyof OssRepository)[] = [
  "owner",
  "name",
  "fullName",
  "url",
  "description",
  "primaryTechnology",
  "fitScore",
  "whyItMatches",
  "difficulty",
];

interface ParseResult {
  repository: OssRepository | null;
  /** Populated when parsing/validation failed, used to build a targeted repair prompt */
  failureReason: string | null;
}

/**
 * Extracts the first balanced {...} block from a string, starting at the
 * first "{". This protects against trailing garbage or explanatory text
 * the model sometimes appends after the JSON object.
 */
function extractBalancedJson(input: string): string | null {
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
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  // Reached end of string without closing — likely truncated output
  return null;
}

function stripMarkdownFences(input: string): string {
  return input
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Validates that a parsed object looks like a usable OssRepository.
 * Returns { repository: null, failureReason } instead of throwing, so
 * callers can decide whether to retry and can build a targeted repair
 * prompt from failureReason.
 */
function validateRepository(candidate: any): {
  repository: OssRepository | null;
  failureReason: string | null;
} {
  if (!candidate || typeof candidate !== "object") {
    return {
      repository: null,
      failureReason: "the repository value was not an object",
    };
  }

  const missing = REQUIRED_FIELDS.filter((field) => !(field in candidate));
  if (missing.length > 0) {
    const reason = `missing required field(s): ${missing.join(", ")}`;
    console.warn(`[oss/discover] ${reason}`);
    return { repository: null, failureReason: reason };
  }

  if (typeof candidate.fitScore !== "number") {
    const coerced = Number(candidate.fitScore);
    if (Number.isNaN(coerced)) {
      const reason = `"fitScore" is not a valid number (got: ${JSON.stringify(candidate.fitScore)})`;
      console.warn(`[oss/discover] ${reason}`);
      return { repository: null, failureReason: reason };
    }
    candidate.fitScore = coerced;
  }

  // Reject obvious placeholder/template output (e.g. "...", "*repository*")
  const suspiciousValues = ["...", "string", "n/a", ""];
  for (const field of ["owner", "name", "fullName", "url"] as const) {
    const value = String(candidate[field] ?? "")
      .trim()
      .toLowerCase();
    if (suspiciousValues.includes(value)) {
      const reason = `field "${field}" looks like a placeholder value: "${candidate[field]}"`;
      console.warn(`[oss/discover] ${reason}`);
      return { repository: null, failureReason: reason };
    }
  }

  return { repository: candidate as OssRepository, failureReason: null };
}

/**
 * Parses the raw agent output into an OssRepository, or null if it
 * cannot be recovered. Handles markdown fences, trailing junk, an
 * explicit `{"repository": null}` response, and truncated output.
 */
function parseRepository(output: string): ParseResult {
  try {
    const cleaned = stripMarkdownFences(output);
    const jsonStr = extractBalancedJson(cleaned);

    if (!jsonStr) {
      const reason =
        "no balanced JSON object found in the output (it may have been truncated or repeated garbage tokens)";
      console.error(`[oss/discover] ${reason}`);
      return { repository: null, failureReason: reason };
    }

    const parsed = JSON.parse(jsonStr);

    // Model may return { repository: {...} }, { repository: null }, or the bare object
    const candidate = "repository" in parsed ? parsed.repository : parsed;

    if (candidate === null) {
      console.log(
        "[oss/discover] agent explicitly returned no matching repository",
      );
      return { repository: null, failureReason: null };
    }

    return validateRepository(candidate);
  } catch (error) {
    const reason = `JSON.parse failed: ${(error as Error)?.message}`;
    console.error(`[oss/discover] failed to parse repository: ${reason}`);
    console.error("[oss/discover] raw output:", output);
    return { repository: null, failureReason: reason };
  }
}

/**
 * Runs a single agent turn against an existing session and collects the
 * final text output, mirroring the streaming logic from the original
 * implementation.
 */
async function runAgentTurn(
  sessionId: string,
  prompt: string,
): Promise<string> {
  const stream = await client.sessions.createTurnStream(sessionId, {
    input: [
      {
        type: "user.message",
        content: prompt,
      },
    ],
  });

  let finalOutput = "";

  for await (const { data: event } of stream.withMetadata()) {
    if (event.type === "model.message.delta" && event.threadId === "main") {
      finalOutput += event.content ?? "";
    }

    if (event.type === "turn.done") {
      console.log("[oss/discover] turn status:", event.state.status);

      if (event.state.status === "done" && event.state.output?.content) {
        const content = event.state.output.content;

        finalOutput =
          typeof content === "string"
            ? content
            : content
                .filter((item: any) => item.type === "text")
                .map((item: any) => item.text)
                .join("");
      }
    }
  }

  return finalOutput;
}

/** Builds a repair prompt that tells the model exactly what went wrong last time. */
function buildRepairPrompt(failureReason: string | null): string {
  const reasonLine = failureReason
    ? `Specifically: ${failureReason}.`
    : "The response could not be parsed as valid JSON.";

  return `
Your previous response was invalid. ${reasonLine}

You already called search_repositories earlier in this session — use those
results. Do NOT call search_repositories again.

Pick ONE repository from the results you already have and return every
field below filled in with real, non-empty values (never "...", "string",
or an empty object):

{"repository":{"owner":"...","name":"...","fullName":"owner/name","url":"...","description":"...","primaryTechnology":"...","fitScore":0,"whyItMatches":"...","difficulty":"intermediate"}}

If genuinely no repository from your search results qualifies, return
exactly {"repository":null} instead.

No markdown, no commentary, no explanation. JSON only.
`;
}

router.post("/discover", async (req: Request, res: Response) => {
  let sessionId: string | undefined;
  let finalOutput = "";

  try {
    const { developerProfile } = req.body;

    if (!developerProfile) {
      return res.status(400).json({
        success: false,
        error: "developerProfile is required",
      });
    }

    console.log("[oss/discover] creating agent session");

    const { data: session } = await withAgentRetry(() =>
      client.sessions.create({
        agent: { name: OSS_AGENT_NAME },
      }),
    );

    sessionId = session.id;
    console.log("[oss/discover] session:", session.id);

    const prompt = `
Developer Profile:

${JSON.stringify(developerProfile, null, 2)}

Find exactly one open-source repository that matches this developer profile.

Return the JSON exactly as instructed.
`;

    console.log("[oss/discover] running agent");

    finalOutput = await withAgentRetry(() => runAgentTurn(session.id, prompt));
    console.log("[oss/discover] final output (attempt 1):");
    console.log(finalOutput);

    let { repository, failureReason } = parseRepository(finalOutput);

    // One repair attempt: ask the same session to fix its own malformed output,
    // telling it exactly what was wrong so it doesn't just resend {}
    if (!repository && failureReason !== null) {
      console.warn(
        `[oss/discover] first attempt failed (${failureReason}), retrying with repair prompt`,
      );

      const repairPrompt = buildRepairPrompt(failureReason);

      finalOutput = await withAgentRetry(() =>
        runAgentTurn(session.id, repairPrompt),
      );
      console.log("[oss/discover] final output (attempt 2 - repair):");
      console.log(finalOutput);

      const repairResult = parseRepository(finalOutput);
      repository = repairResult.repository;
      failureReason = repairResult.failureReason;
    }

    // failureReason === null but repository === null means the agent
    // legitimately found nothing — that's a valid, successful outcome.
    if (!repository && failureReason === null) {
      return res.json({
        success: true,
        repository: null,
        raw: finalOutput,
        sessionId: session.id,
      });
    }

    if (!repository) {
      console.warn(
        `[oss/discover] agent returned invalid repository data after retry: ${failureReason}`,
      );

      return res.status(502).json({
        success: false,
        error: "Repository discovery agent returned an invalid response",
        reason: failureReason,
        raw: finalOutput,
        sessionId: session.id,
      });
    }

    return res.json({
      success: true,
      repository,
      raw: finalOutput,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error("[oss/discover] error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to discover repository",
      sessionId,
    });
  }
});

export default router;
