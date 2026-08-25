import { Router, Request, Response } from "express";
import { agentClient, SOLVER_AGENT_NAME } from "../services/agentClient";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";

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
      issue: { title: string; url: string };
      implementation: {
        summary: string;
        filesChanged: { path: string; change: string }[];
      };
      validation: {
        testsRun: { command: string; result: string }[];
        testSummary: string;
        diffCheck: string;
      };
      finalDiff: {
        filesChanged: number;
        insertions: number;
        deletions: number;
      };
    }
  | { status: "blocked" }
  | { status: "failed" };

function isValidSolverInput(input: any): input is SolverInput {
  return Boolean(
    input?.matchedRepository &&
    input?.issue &&
    input?.explanation &&
    input?.solveApproach &&
    input?.relevantFiles,
  );
}

/**
 * Extract text safely from Agent SDK model message events.
 * Same shape-handling as the developer-profile route: event.content can be
 * a string, or an array of content items, or an object with a `.text`.
 */
function extractText(event: any): string | null {
  if (!event) return null;

  if (
    (event.type === "model.message.delta" || event.type === "model.message") &&
    event.content
  ) {
    return extractOutputText(event.content);
  }

  return null;
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
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
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
    return { status: "failed" };
  }
}

/**
 * Solver agent has no per-user session to reuse (unlike the developer-profile
 * agent, which persists a sessionId on the user doc) — each run gets a fresh
 * session since a solver run is scoped to a single issue/card, not a user.
 * If you want to persist the session against a kanban card later, swap this
 * for a getOrCreateSolverSession(cardId) the same way the profile route does.
 */
async function runSolverAgent(input: SolverInput): Promise<string> {
  return withAgentRetry(async () => {
    const sessionResponse = await agentClient.sessions.create({
      agent: {
        name: SOLVER_AGENT_NAME,
      },
    });

    const session = sessionResponse.data;

    console.log("[solver agent] created session:", session.id);

    let finalText = "";

    const stream = await agentClient.sessions.createTurnStream(session.id, {
      input: [
        {
          type: "user.message",
          content: JSON.stringify(input),
        },
      ],
    });

    for await (const event of stream) {
      if (DEBUG_AGENT_EVENTS) {
        console.log(`[solver agent event] ${event?.type}`);
      }

      const chunk = extractText(event);
      if (chunk) {
        finalText += chunk;
      }

      if (event?.type === "turn.done") {
        console.log("[solver agent] turn status:", event.state?.status);

        if (event.state?.status === "done") {
          const outputText = extractOutputText(event.state.output?.content);
          if (outputText) {
            finalText = outputText;
          }
        }

        if (event.state?.status === "error") {
          throw new Error(event.state.message || "Agent turn failed");
        }
      }
    }

    return finalText.trim();
  });
}

// POST /api/solver/run
// Body: SolverInput (matchedRepository, issue, explanation, solveApproach, relevantFiles)
router.post("/run", async (req: Request, res: Response) => {
  const input = req.body as Partial<SolverInput>;

  if (!isValidSolverInput(input)) {
    return res.status(400).json({
      error:
        "Missing required fields: matchedRepository, issue, explanation, solveApproach, relevantFiles",
    });
  }

  try {
    const finalText = await runSolverAgent(input as SolverInput);

    console.log("[solver agent] final output length:", finalText.length);

    const result = parseSolverResult(finalText);

    return res.json({ ...result, raw: finalText });
  } catch (error: any) {
    console.error(
      "[solver route] Unhandled error running solver agent:",
      error.response?.data || error.message || error,
    );
    return res
      .status(500)
      .json({ status: "failed", error: "Solver agent execution failed" });
  }
});

export default router;
