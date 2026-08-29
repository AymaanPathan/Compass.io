import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  streamAgentTurn,
  openSse,
  buildAnswerInput,
  buildUserMessageInput,
} from "../services/agentStream";
import IssueResolutionRun from "../models/IssueResolutionRun";
import {
  ISSUE_RESOLUTION_AGENT_NAME,
  trueforge,
} from "../services/agentClient";

const router = Router();

const TOOL_MEANINGS = {
  issue_read: {
    label: "Reading issue",
    description: "Fetching the GitHub issue, comments, and linked context.",
  },
  bash: {
    label: "Sandbox",
    description: "Running a command in the repository sandbox.",
  },
};

function parseIssueUrl(issueUrl: string) {
  const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match) throw new Error("Not a valid GitHub issue URL");
  const [, owner, repo, number] = match;
  return {
    owner,
    repo: repo.replace(/\.git$/, ""),
    issueNumber: Number(number),
  };
}

async function getRunOr404(userId: string, issueUrl: string, res: Response) {
  const run = await IssueResolutionRun.findOne({ user: userId, issueUrl });
  if (!run) {
    res.status(404).json({ error: "No investigation found for this issue" });
    return null;
  }
  return run;
}

/** GET /api/issue-resolution?issueUrl=... — cached run, if any. */
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const issueUrl = String(req.query.issueUrl ?? "");
  if (!issueUrl) return res.json({ success: false, run: null });

  const run = await IssueResolutionRun.findOne({
    user: req.userId,
    issueUrl,
  }).lean();
  res.json({ success: true, run: run ?? null });
});

/** POST /api/issue-resolution/stream — Phase A (Deep Dive). Read-only. */
router.post("/stream", requireAuth, async (req: AuthRequest, res: Response) => {
  const { issueUrl } = req.body as { issueUrl?: string };
  if (!issueUrl)
    return void res.status(400).json({ error: "issueUrl is required" });

  let owner: string, repo: string, issueNumber: number;
  try {
    ({ owner, repo, issueNumber } = parseIssueUrl(issueUrl));
  } catch (err: any) {
    return void res.status(400).json({ error: err.message });
  }

  // Match the exact shape github.route.ts already proved works.
  const sessionResponse = await trueforge.sessions.create({
    agent: { name: ISSUE_RESOLUTION_AGENT_NAME },
  });
  const session = sessionResponse.data;
  const sessionId = session.id;

  await IssueResolutionRun.findOneAndUpdate(
    { user: req.userId, issueUrl },
    {
      user: req.userId,
      issueUrl,
      owner,
      repo,
      issueNumber,
      sessionId,
      phase: "investigating",
      deepDiveReport: null,
      solverReport: null,
      solverStatus: null,
    },
    { upsert: true, new: true },
  );

  const heartbeat = openSse(res);
  await streamAgentTurn(
    res,
    sessionId,
    buildUserMessageInput(issueUrl),
    "issue-resolution:investigate",
    TOOL_MEANINGS,
    undefined,
    {
      onAuthRequired: async () => {},
      onQuestionRequired: async () => {},
      onError: async () => {
        await IssueResolutionRun.updateOne(
          { user: req.userId, issueUrl },
          { phase: "failed" },
        );
      },
    },
  );
  clearInterval(heartbeat);
  res.end();
});
/**
 * POST /api/issue-resolution/stream/continue — Phase B (Solver).
 * This is the human approval gate: fires ONLY on an explicit user click,
 * as a brand-new turn on the same session. Never triggered automatically.
 */
router.post(
  "/stream/continue",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { issueUrl, message } = req.body as {
      issueUrl?: string;
      message?: string;
    };
    if (!issueUrl)
      return void res.status(400).json({ error: "issueUrl is required" });

    const run = await getRunOr404(req.userId!, issueUrl, res);
    if (!run) return;

    await IssueResolutionRun.updateOne(
      { _id: run._id },
      { phase: "implementing" },
    );

    const heartbeat = openSse(res);
    await streamAgentTurn(
      res,
      run.sessionId,
      buildUserMessageInput(message ?? "Implement the fix"),
      "issue-resolution:solve",
      TOOL_MEANINGS,
      undefined,
      {
        onAuthRequired: async () => {},
        onQuestionRequired: async () => {},
        onError: async () => {
          await IssueResolutionRun.updateOne(
            { _id: run._id },
            { phase: "failed" },
          );
        },
      },
    );
    clearInterval(heartbeat);
    res.end();
  },
);

/** POST /api/issue-resolution/stream/answer — answers an ask_user_question mid-run. */
router.post(
  "/stream/answer",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { issueUrl, toolCallId, threadId, answer } = req.body as {
      issueUrl?: string;
      toolCallId?: string;
      threadId?: string;
      answer?: string;
    };
    if (!issueUrl || !toolCallId || !answer) {
      return void res
        .status(400)
        .json({ error: "issueUrl, toolCallId, and answer are required" });
    }

    const run = await getRunOr404(req.userId!, issueUrl, res);
    if (!run) return;

    const heartbeat = openSse(res);
    await streamAgentTurn(
      res,
      run.sessionId,
      buildAnswerInput(threadId ?? "main", toolCallId, answer),
      "issue-resolution:answer",
      TOOL_MEANINGS,
      undefined,
      {
        onAuthRequired: async () => {},
        onQuestionRequired: async () => {},
        onError: async () => {},
      },
    );
    clearInterval(heartbeat);
    res.end();
  },
);

/** POST /api/issue-resolution/stream/resume — resume after GitHub auth. */
router.post(
  "/stream/resume",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { issueUrl } = req.body as { issueUrl?: string };
    const run = await getRunOr404(req.userId!, String(issueUrl), res);
    if (!run) return;

    const heartbeat = openSse(res);
    await streamAgentTurn(
      res,
      run.sessionId,
      [],
      "issue-resolution:resume",
      TOOL_MEANINGS,
      undefined,
      {
        onAuthRequired: async () => {},
        onQuestionRequired: async () => {},
        onError: async () => {},
      },
    );
    clearInterval(heartbeat);
    res.end();
  },
);

/** POST /api/issue-resolution/commit — persist the final report text. */
router.post("/commit", requireAuth, async (req: AuthRequest, res: Response) => {
  const { issueUrl, phase, report } = req.body as {
    issueUrl?: string;
    phase?: "awaiting_approval" | "done";
    report?: string;
  };
  if (!issueUrl || !phase || typeof report !== "string") {
    return void res
      .status(400)
      .json({ error: "issueUrl, phase, and report are required" });
  }

  const update: Record<string, unknown> = { phase, generatedAt: new Date() };
  if (phase === "awaiting_approval") update.deepDiveReport = report;
  if (phase === "done") {
    update.solverReport = report;
    const m = report.match(
      /##\s*Status\s*\n+\s*(IMPLEMENTED|PARTIALLY_IMPLEMENTED|BLOCKED|NO_CHANGE_REQUIRED)/i,
    );
    update.solverStatus = m ? m[1].toUpperCase() : null;
  }

  await IssueResolutionRun.updateOne({ user: req.userId, issueUrl }, update);
  res.json({ success: true });
});

export default router;
