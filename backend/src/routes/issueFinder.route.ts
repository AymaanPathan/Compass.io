import { Router, Response } from "express";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { ISSUE_FINDER_AGENT_NAME, trueforge } from "../services/agentClient";
import {
  openSse,
  streamAgentTurn,
  buildAnswerInput,
  ToolMeaning,
  PendingQuestion,
} from "../services/agentStream";

const router = Router();

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface SelectedRepository {
  name: string; // "owner/repo"
  url: string;
  description?: string;
}

export interface ContributionIntent {
  contributionTypes: string[];
  difficulty: string;
  timeAvailable: string;
  goal: string;
}

export interface MatchedIssue {
  number: number;
  title: string;
  url: string;
  labels: string[];
  status: string;
  difficultySignal: string;
  whyItMatches: string;
}

interface IssueFinderResult {
  repository: string;
  contributionIntent: ContributionIntent;
  matchedIssues: MatchedIssue[];
}

const TOOL_MEANINGS: Record<string, ToolMeaning> = {
  ask_user_question: {
    label: "Asking you a question",
    description: "Narrowing down what kind of issue to look for",
  },
  list_issues: {
    label: "Listing open issues",
    description: "Pulling the current open issues in the selected repo",
  },
  search_issues: {
    label: "Searching issues",
    description: "Semantic search for issues matching your answers",
  },
  issue_read: {
    label: "Reading issue detail",
    description: "Confirming details on a shortlisted issue",
  },
};

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

function isValidSelectedRepository(
  value: unknown,
): value is SelectedRepository {
  if (!value || typeof value !== "object") return false;
  const repo = value as any;
  if (typeof repo.name !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repo.name)) {
    return false;
  }
  if (typeof repo.url !== "string" || !repo.url.trim()) return false;
  return true;
}

function validateIssueFinderResult(value: unknown): value is IssueFinderResult {
  if (!value || typeof value !== "object") return false;
  const result = value as any;

  if (typeof result.repository !== "string" || !result.repository.trim()) {
    return false;
  }

  const intent = result.contributionIntent;
  if (!intent || typeof intent !== "object") return false;
  if (!Array.isArray(intent.contributionTypes)) return false;
  if (typeof intent.difficulty !== "string") return false;
  if (typeof intent.timeAvailable !== "string") return false;
  if (typeof intent.goal !== "string") return false;

  const issues = result.matchedIssues;
  if (!Array.isArray(issues) || issues.length === 0) return false;

  const seenNumbers = new Set<number>();
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") return false;
    if (typeof issue.number !== "number") return false;
    if (typeof issue.title !== "string" || !issue.title.trim()) return false;
    if (typeof issue.url !== "string" || !issue.url.trim()) return false;
    if (!Array.isArray(issue.labels)) return false;
    if (typeof issue.status !== "string") return false;
    if (typeof issue.difficultySignal !== "string") return false;
    if (typeof issue.whyItMatches !== "string") return false;
    if (seenNumbers.has(issue.number)) return false;
    seenNumbers.add(issue.number);
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/*  Lock / status helpers (mirrors findRepo.ts)                               */
/* -------------------------------------------------------------------------- */

async function releaseIssueFinderLock(userId: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: { issueFinderStatus: "idle" },
      $unset: {
        issueFinderSessionId: 1,
        issueFinderPendingQuestion: 1,
        issueFinderSelectedRepository: 1,
      },
    },
  );
}

async function markIssueFinderFailed(userId: string, message: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        issueFinderStatus: "failed",
        issueFinderLastError: message,
      },
      $unset: { issueFinderPendingQuestion: 1 },
    },
  );
}

async function storePendingQuestion(userId: string, question: PendingQuestion) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        issueFinderStatus: "question_required",
        issueFinderPendingQuestion: question,
      },
    },
  );
}

function logErrorChain(label: string, error: any) {
  console.error(`[issue-finder:${label}] ── ERROR ──────────────────────`);
  console.error(error?.response?.data || error?.message || error);
}

/* -------------------------------------------------------------------------- */
/*  Start a run                                                               */
/* -------------------------------------------------------------------------- */

router.post("/stream", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user)
    return res.status(404).json({ success: false, error: "User not found" });

  if (!user.developerProfile) {
    return res.status(400).json({
      success: false,
      code: "DEVELOPER_PROFILE_REQUIRED",
      error: "Build your developer profile first",
    });
  }

  const { selectedRepository } = req.body as {
    selectedRepository?: SelectedRepository;
  };

  if (!isValidSelectedRepository(selectedRepository)) {
    return res.status(400).json({
      success: false,
      error: "A valid selectedRepository ({ name, url }) is required",
    });
  }

  const claimedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      issueFinderStatus: { $in: ["idle", "failed", undefined, null] },
    } as any,
    {
      $set: {
        issueFinderStatus: "running",
        issueFinderSelectedRepository: selectedRepository,
      },
      $unset: {
        issueFinderLastError: 1,
        issueFinderPendingQuestion: 1,
      },
    },
    { returnDocument: "after" },
  );

  if (!claimedUser) {
    const current = await User.findById(user._id).select("issueFinderStatus");

    if (current?.issueFinderStatus === "running") {
      return res.status(409).json({
        success: false,
        error: "An issue-finder run is already in progress",
      });
    }
    if (current?.issueFinderStatus === "question_required") {
      return res.status(409).json({
        success: false,
        error: "The agent is waiting on an answer to continue",
      });
    }
    if (current?.issueFinderStatus === "auth_required") {
      return res.status(409).json({
        success: false,
        error: "GitHub authorization is required to continue",
      });
    }
    return res.status(409).json({
      success: false,
      error: "Unable to start issue matching",
    });
  }

  const heartbeat = openSse(res);

  try {
    const sessionResponse = await trueforge.sessions.create({
      agent: { name: ISSUE_FINDER_AGENT_NAME },
    });
    const session = sessionResponse.data;

    claimedUser.issueFinderSessionId = session.id;
    await claimedUser.save();

    await streamAgentTurn<IssueFinderResult>(
      res,
      session.id,
      [
        {
          type: "user.message",
          content: JSON.stringify({
            developerProfile: claimedUser.developerProfile,
            selectedRepository,
          }),
        },
      ],
      "issue-finder-stream",
      TOOL_MEANINGS,
      validateIssueFinderResult,
      {
        onAuthRequired: async () => {
          await User.updateOne(
            { _id: claimedUser.id },
            { $set: { issueFinderStatus: "auth_required" } },
          );
        },
        onQuestionRequired: (question) =>
          storePendingQuestion(claimedUser.id, question),
        onError: (message) => markIssueFinderFailed(claimedUser.id, message),
      },
    );
  } catch (error: any) {
    logErrorChain("stream", error);
    const message =
      error?.response?.data?.message ??
      error?.response?.data?.error ??
      error?.message ??
      "Failed to find matching issues";

    res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    await markIssueFinderFailed(claimedUser.id, message);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

/* -------------------------------------------------------------------------- */
/*  Answer a pending ask_user_question                                       */
/* -------------------------------------------------------------------------- */

router.post(
  "/stream/answer",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    if (
      user.issueFinderStatus !== "question_required" ||
      !user.issueFinderSessionId ||
      !user.issueFinderPendingQuestion
    ) {
      return res.status(400).json({
        success: false,
        error: "There's no pending question to answer",
      });
    }

    const { toolCallId, answer } = req.body as {
      toolCallId?: string;
      answer?: string;
    };

    if (!toolCallId || typeof answer !== "string" || !answer.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "toolCallId and answer are required" });
    }

    if (toolCallId !== user.issueFinderPendingQuestion.toolCallId) {
      return res.status(409).json({
        success: false,
        error: "This answer doesn't match the currently pending question",
      });
    }

    await User.updateOne(
      { _id: user.id },
      {
        $set: { issueFinderStatus: "running" },
        $unset: { issueFinderPendingQuestion: 1 },
      },
    );

    const heartbeat = openSse(res);

    try {
      await streamAgentTurn<IssueFinderResult>(
        res,
        user.issueFinderSessionId,
        buildAnswerInput(toolCallId, answer),
        "issue-finder-answer",
        TOOL_MEANINGS,
        validateIssueFinderResult,
        {
          onAuthRequired: async () => {
            await User.updateOne(
              { _id: user.id },
              { $set: { issueFinderStatus: "auth_required" } },
            );
          },
          onQuestionRequired: (question) =>
            storePendingQuestion(user.id, question),
          onError: (message) => markIssueFinderFailed(user.id, message),
        },
      );
    } catch (error: any) {
      logErrorChain("answer", error);
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Failed to submit your answer",
        })}\n\n`,
      );
      await markIssueFinderFailed(user.id, "Failed to submit your answer");
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  },
);

/* -------------------------------------------------------------------------- */
/*  Resume after GitHub OAuth                                                 */
/* -------------------------------------------------------------------------- */

router.post(
  "/stream/resume",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    if (!user.issueFinderSessionId) {
      return res
        .status(400)
        .json({ success: false, error: "No pending GitHub authorization" });
    }

    const heartbeat = openSse(res);

    try {
      await streamAgentTurn<IssueFinderResult>(
        res,
        user.issueFinderSessionId,
        [],
        "issue-finder-resume",
        TOOL_MEANINGS,
        validateIssueFinderResult,
        {
          onAuthRequired: async () => {
            await User.updateOne(
              { _id: user.id },
              { $set: { issueFinderStatus: "auth_required" } },
            );
          },
          onQuestionRequired: (question) =>
            storePendingQuestion(user.id, question),
          onError: (message) => markIssueFinderFailed(user.id, message),
        },
      );
    } catch (error: any) {
      logErrorChain("resume", error);
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "Failed to resume issue matching" })}\n\n`,
      );
      await markIssueFinderFailed(user.id, "Failed to resume issue matching");
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  },
);

/* -------------------------------------------------------------------------- */
/*  Commit final result                                                      */
/* -------------------------------------------------------------------------- */

router.post("/commit", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user)
    return res.status(404).json({ success: false, error: "User not found" });

  const { data, raw } = req.body as { data: IssueFinderResult; raw: string };

  if (!validateIssueFinderResult(data)) {
    await releaseIssueFinderLock(user.id);
    return res
      .status(400)
      .json({ success: false, error: "Invalid issue-finder payload" });
  }

  user.matchedIssues = data.matchedIssues;
  user.matchedIssuesRepository = data.repository;
  user.matchedIssuesContributionIntent = data.contributionIntent;
  user.matchedIssuesRaw = raw;
  user.matchedIssuesGeneratedAt = new Date();
  user.issueFinderSessionId = undefined;
  user.issueFinderStatus = "idle";
  user.issueFinderLastError = undefined;
  user.issueFinderPendingQuestion = undefined;
  await user.save();

  return res.json({
    success: true,
    generatedAt: user.matchedIssuesGeneratedAt,
  });
});

/* -------------------------------------------------------------------------- */
/*  Cached fetch / status                                                    */
/* -------------------------------------------------------------------------- */

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user)
    return res.status(404).json({ success: false, error: "User not found" });

  return res.json({
    success: true,
    matchedIssues: user.matchedIssues ?? null,
    repository: user.matchedIssuesRepository ?? null,
    contributionIntent: user.matchedIssuesContributionIntent ?? null,
    cached: Boolean(user.matchedIssues?.length),
    generatedAt: user.matchedIssuesGeneratedAt ?? null,
    status: user.issueFinderStatus ?? "idle",
    pendingQuestion: user.issueFinderPendingQuestion ?? null,
  });
});

export default router;
