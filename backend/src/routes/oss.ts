import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { withAgentRetry } from "../utils/retryAgentTurn";
import { agentClient, OSS_AGENT_NAME } from "../services/agentClient";

const router = Router();

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

const MAX_DEVELOPER_PROFILE_SIZE = 20_000;

interface ParseResult {
  repository: OssRepository | null;
  /** Populated when parsing/validation failed */
  failureReason: string | null;
}

/**
 * Extracts the first balanced {...} block from a string.
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
 */
function validateRepository(candidate: any): {
  repository: OssRepository | null;
  failureReason: string | null;
} {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {
      repository: null,
      failureReason: "the repository value was not an object",
    };
  }

  const missing = REQUIRED_FIELDS.filter((field) => !(field in candidate));

  if (missing.length > 0) {
    const reason = `missing required field(s): ${missing.join(", ")}`;

    console.warn(`[oss/discover] ${reason}`);

    return {
      repository: null,
      failureReason: reason,
    };
  }

  // fitScore must be an integer between 0 and 100.
  if (
    typeof candidate.fitScore !== "number" ||
    !Number.isInteger(candidate.fitScore) ||
    candidate.fitScore < 0 ||
    candidate.fitScore > 100
  ) {
    const reason = `"fitScore" must be an integer between 0 and 100`;

    console.warn(`[oss/discover] ${reason}`);

    return {
      repository: null,
      failureReason: reason,
    };
  }

  // Agent contract requires intermediate difficulty.
  if (candidate.difficulty !== "intermediate") {
    const reason = `"difficulty" must be "intermediate"`;

    console.warn(`[oss/discover] ${reason}`);

    return {
      repository: null,
      failureReason: reason,
    };
  }

  // Reject obvious placeholder/template output.
  const suspiciousValues = ["...", "string", "n/a", ""];

  for (const field of ["owner", "name", "fullName", "url"] as const) {
    const value = String(candidate[field] ?? "")
      .trim()
      .toLowerCase();

    if (suspiciousValues.includes(value)) {
      const reason = `field "${field}" looks like a placeholder value`;

      console.warn(`[oss/discover] ${reason}`);

      return {
        repository: null,
        failureReason: reason,
      };
    }
  }

  return {
    repository: candidate as OssRepository,
    failureReason: null,
  };
}

/**
 * Parses raw agent output into an OssRepository.
 */
function parseRepository(output: string): ParseResult {
  try {
    const cleaned = stripMarkdownFences(output);
    const jsonStr = extractBalancedJson(cleaned);

    if (!jsonStr) {
      const reason = "no balanced JSON object found in the output";

      console.error(`[oss/discover] ${reason}`);

      return {
        repository: null,
        failureReason: reason,
      };
    }

    const parsed = JSON.parse(jsonStr);

    const candidate = "repository" in parsed ? parsed.repository : parsed;

    if (candidate === null) {
      console.log(
        "[oss/discover] agent explicitly returned no matching repository",
      );

      return {
        repository: null,
        failureReason: null,
      };
    }

    return validateRepository(candidate);
  } catch (error) {
    const reason = `JSON.parse failed: ${(error as Error)?.message}`;

    console.error(`[oss/discover] failed to parse repository: ${reason}`);

    return {
      repository: null,
      failureReason: reason,
    };
  }
}

/**
 * Runs a single agent turn against an existing session.
 */
async function runAgentTurn(
  sessionId: string,
  prompt: string,
): Promise<string> {
  const stream = await agentClient.sessions.createTurnStream(sessionId, {
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
      if (typeof event.content === "string") {
        finalOutput += event.content;
      }
    }

    if (event.type === "turn.done") {
      const status = event.state?.status;

      console.log("[oss/discover] turn status:", status);

      if (status === "error") {
        throw new Error(event.state?.message || "Agent turn failed");
      }

      if (status !== "done") {
        throw new Error(`Agent turn ended with unexpected status: ${status}`);
      }

      if (event.state?.output?.content) {
        const content = event.state.output.content;

        if (typeof content === "string") {
          finalOutput = content;
        } else if (Array.isArray(content)) {
          finalOutput = content
            .filter((item: any) => item?.type === "text")
            .map((item: any) => item.text || "")
            .join("");
        }
      }
    }
  }

  if (!finalOutput.trim()) {
    throw new Error("Agent returned empty output");
  }

  return finalOutput;
}

/**
 * Builds a repair prompt that tells the model exactly what went wrong.
 */
function buildRepairPrompt(failureReason: string | null): string {
  const reasonLine = failureReason
    ? `Specifically: ${failureReason}.`
    : "The response could not be parsed as valid JSON.";

  return `
Your previous response was invalid. ${reasonLine}

You already called search_repositories earlier in this session.
Use those results. Do NOT call search_repositories again.

Pick ONE repository from the results you already have and return
every field below filled in with real, non-empty values.

The fitScore must be an integer from 0 to 100.
The difficulty must be exactly "intermediate".

Never use "...", "string", "n/a", or empty values.

Return exactly this shape:

{"repository":{"owner":"...","name":"...","fullName":"owner/name","url":"...","description":"...","primaryTechnology":"...","fitScore":0,"whyItMatches":"...","difficulty":"intermediate"}}

If genuinely no repository from your search results qualifies, return:

{"repository":null}

No markdown.
No commentary.
No explanation.
JSON only.
`;
}

router.post("/discover", requireAuth, async (req: Request, res: Response) => {
  try {
    const { developerProfile } = req.body;

    // Finding #6:
    // Prevent oversized/adversarial profile data from entering the prompt.
    if (developerProfile === undefined || developerProfile === null) {
      return res.status(400).json({
        success: false,
        error: "developerProfile is required",
      });
    }

    if (
      typeof developerProfile !== "object" ||
      Array.isArray(developerProfile)
    ) {
      return res.status(400).json({
        success: false,
        error: "developerProfile must be an object",
      });
    }

    let serializedProfile: string;

    try {
      serializedProfile = JSON.stringify(developerProfile);
    } catch {
      return res.status(400).json({
        success: false,
        error: "developerProfile could not be serialized",
      });
    }

    if (serializedProfile.length > MAX_DEVELOPER_PROFILE_SIZE) {
      return res.status(413).json({
        success: false,
        error: `developerProfile is too large. Maximum size is ${MAX_DEVELOPER_PROFILE_SIZE} characters`,
      });
    }

    console.log("[oss/discover] creating agent session");

    const { data: session } = await withAgentRetry(() =>
      agentClient.sessions.create({
        agent: {
          name: OSS_AGENT_NAME,
        },
      }),
    );

    console.log("[oss/discover] agent session created");

    const prompt = `
Developer Profile:

${JSON.stringify(developerProfile, null, 2)}

Find exactly one open-source repository that matches this developer profile.

Return the JSON exactly as instructed.
`;

    console.log("[oss/discover] running agent");

    let finalOutput = await withAgentRetry(() =>
      runAgentTurn(session.id, prompt),
    );

    console.log("[oss/discover] final output length:", finalOutput.length);

    let { repository, failureReason } = parseRepository(finalOutput);

    // One repair attempt.
    if (!repository && failureReason !== null) {
      console.warn(
        `[oss/discover] first attempt failed (${failureReason}), retrying with repair prompt`,
      );

      const repairPrompt = buildRepairPrompt(failureReason);

      finalOutput = await withAgentRetry(() =>
        runAgentTurn(session.id, repairPrompt),
      );

      const repairResult = parseRepository(finalOutput);

      repository = repairResult.repository;
      failureReason = repairResult.failureReason;
    }

    // Agent legitimately found nothing.
    if (!repository && failureReason === null) {
      return res.json({
        success: true,
        repository: null,
        raw: finalOutput,
      });
    }

    // Agent returned invalid data after repair.
    if (!repository) {
      console.warn(
        `[oss/discover] invalid repository after retry: ${failureReason}`,
      );

      return res.status(502).json({
        success: false,
        error: "Repository discovery agent returned an invalid response",
        reason: failureReason,
        raw: finalOutput,
      });
    }

    return res.json({
      success: true,
      repository,
      raw: finalOutput,
    });
  } catch (error: any) {
    console.error(
      "[oss/discover] error:",
      error?.response?.data || error?.message || error,
    );

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to discover repository",
    });
  }
});

export default router;
