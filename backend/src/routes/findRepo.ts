import { Router, Response } from "express";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  REPO_RECOMMENDER_AGENT_NAME,
  trueforge,
} from "../services/agentClient";
import { openSse, streamAgentTurn, ToolMeaning } from "../services/agentStream";

const router = Router();

export interface MatchedRepository {
  name: string;
  url: string;
  description: string;
  repoType: string;
  whyItMatches: string;
}

interface RepoRecommendations {
  matchedRepositories: MatchedRepository[];
}

/**
 * Human-facing meaning for each MCP tool the repo-recommender-agent is
 * allowed to call. Keep in sync with its `enableTools` list.
 */
const TOOL_MEANINGS: Record<string, ToolMeaning> = {
  search_repositories: {
    label: "Searching GitHub",
    description:
      "Running a broad search built from your strongest skills and interests",
  },
};

function isValidGitHubRepoUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      /^\/[^/]+\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/** Runtime validation for untrusted agent output. */
function validateRecommendations(value: unknown): value is RepoRecommendations {
  if (!value || typeof value !== "object") return false;

  const recommendations = (value as any).matchedRepositories;
  if (!Array.isArray(recommendations) || recommendations.length === 0)
    return false;

  const seenUrls = new Set<string>();

  for (const repo of recommendations) {
    if (!repo || typeof repo !== "object") return false;

    const fields = [
      "name",
      "url",
      "description",
      "repoType",
      "whyItMatches",
    ] as const;
    for (const field of fields) {
      if (typeof repo[field] !== "string" || !repo[field].trim()) return false;
    }

    if (!isValidGitHubRepoUrl(repo.url)) return false;
    if (seenUrls.has(repo.url)) return false;
    seenUrls.add(repo.url);
  }

  return true;
}

async function releaseRepoRecommendationLock(userId: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: { repoRecommendationsStatus: "idle" },
      $unset: { repoRecommendationsSessionId: 1 },
    },
  );
}

async function markRepoRecommendationFailed(userId: string, message: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        repoRecommendationsStatus: "failed",
        repoRecommendationsLastError: message,
      },
    },
  );
}

function logErrorChain(label: string, error: any) {
  console.error(`[find-repo:${label}] ── ERROR ──────────────────────`);
  console.error(error?.response?.data || error?.message || error);
}

router.post(
  "/recommendations/stream",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
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

    // Atomically claim the run so a double-click can't start two sessions.
    const claimedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        repoRecommendationsStatus: {
          $in: ["idle", "failed", undefined, null],
        },
      } as any,
      {
        $set: {
          repoRecommendationsStatus: "running",
        },
        $unset: {
          repoRecommendationsLastError: 1,
        },
      },
      {
        returnDocument: "after",
      },
    );
    if (!claimedUser) {
      const currentUser = await User.findById(user._id).select(
        "repoRecommendationsStatus",
      );

      if (currentUser?.repoRecommendationsStatus === "running") {
        return res.status(409).json({
          success: false,
          error: "A repo match run is already in progress",
        });
      }

      if (currentUser?.repoRecommendationsStatus === "auth_required") {
        return res.status(409).json({
          success: false,
          error: "GitHub authorization is required to continue",
        });
      }

      return res.status(409).json({
        success: false,
        error: "Unable to start repo matching",
      });
    }

    const heartbeat = openSse(res);

    try {
      // NOTE: HttpResponsePromise resolves to a wrapper — the actual
      // session object is under `.data`, same as the profile route.
      const sessionResponse = await trueforge.sessions.create({
        agent: { name: REPO_RECOMMENDER_AGENT_NAME },
      });

      const session = sessionResponse.data;

      claimedUser.repoRecommendationsSessionId = session.id;
      await claimedUser.save();

      await streamAgentTurn<RepoRecommendations>(
        res,
        session.id,
        [
          {
            type: "user.message",
            content: `Developer profile JSON:\n${JSON.stringify(
              claimedUser.developerProfile,
            )}\n\nFind matching repositories for this developer.`,
          },
        ],
        "oss-stream",
        TOOL_MEANINGS,
        validateRecommendations,
        {
          onAuthRequired: async () => {
            await User.updateOne(
              { _id: claimedUser.id },
              { $set: { repoRecommendationsStatus: "auth_required" } },
            );
          },
          onError: (message) =>
            markRepoRecommendationFailed(claimedUser.id, message),
        },
      );
    } catch (error: any) {
      logErrorChain("stream", error);

      const message =
        error?.response?.data?.message ??
        error?.response?.data?.error ??
        error?.message ??
        "Failed to find repo matches";

      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message,
        })}\n\n`,
      );

      await markRepoRecommendationFailed(claimedUser.id, message);
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  },
);

router.post(
  "/recommendations/stream/resume",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    if (!user.repoRecommendationsSessionId) {
      return res
        .status(400)
        .json({ success: false, error: "No pending GitHub authorization" });
    }

    const heartbeat = openSse(res);

    try {
      await streamAgentTurn<RepoRecommendations>(
        res,
        user.repoRecommendationsSessionId,
        [],
        "oss-resume",
        TOOL_MEANINGS,
        validateRecommendations,
        {
          onAuthRequired: async () => {
            await User.updateOne(
              { _id: user.id },
              { $set: { repoRecommendationsStatus: "auth_required" } },
            );
          },
          onError: (message) => markRepoRecommendationFailed(user.id, message),
        },
      );
    } catch (error: any) {
      logErrorChain("resume", error);
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "Failed to resume repo matching" })}\n\n`,
      );
      await markRepoRecommendationFailed(
        user.id,
        "Failed to resume repo matching",
      );
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  },
);

/**
 * Called by the client right after it receives the `done` SSE event, same
 * commit pattern as the profile agent.
 */
router.post(
  "/recommendations/commit",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    const { data, raw } = req.body as {
      data: RepoRecommendations;
      raw: string;
    };

    if (!validateRecommendations(data)) {
      await releaseRepoRecommendationLock(user.id);
      return res
        .status(400)
        .json({ success: false, error: "Invalid recommendations payload" });
    }

    user.repoRecommendations = data.matchedRepositories;
    user.repoRecommendationsRaw = raw;
    user.repoRecommendationsParseFailed = false;
    user.repoRecommendationsGeneratedAt = new Date();
    user.repoRecommendationsSessionId = undefined;
    user.repoRecommendationsStatus = "idle";
    user.repoRecommendationsLastError = undefined;
    await user.save();

    return res.json({
      success: true,
      generatedAt: user.repoRecommendationsGeneratedAt,
    });
  },
);

// Page-load fetch of whatever's cached.
router.get(
  "/recommendations",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    return res.json({
      success: true,
      matchedRepositories: user.repoRecommendations ?? null,
      cached: Boolean(user.repoRecommendations?.length),
      generatedAt: user.repoRecommendationsGeneratedAt ?? null,
    });
  },
);

export default router;
