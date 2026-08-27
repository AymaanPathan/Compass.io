import { Router, Response } from "express";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { REPO_RECOMMENDER_AGENT_NAME } from "../services/agentClient";
import { runAgent, resumeAgent, AgentRunResult } from "../services/agentRunner";
import { parseAgentJson } from "../utils/agentResponseToJson";

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
 * Validate that a URL points to a GitHub repository over HTTPS.
 *
 * Expected format:
 * https://github.com/owner/repository
 */
function isValidGitHubRepoUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

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

/**
 * Runtime validation for untrusted agent output.
 *
 * TypeScript interfaces disappear at runtime, so every model response
 * must be validated before it is persisted or returned to the client.
 */
function validateRecommendations(value: unknown): value is RepoRecommendations {
  if (!value || typeof value !== "object") {
    return false;
  }

  const recommendations = (value as any).matchedRepositories;

  if (!Array.isArray(recommendations)) {
    return false;
  }

  // An empty result is not considered a successful recommendation run.
  if (recommendations.length === 0) {
    return false;
  }

  const seenUrls = new Set<string>();

  for (const repo of recommendations) {
    if (!repo || typeof repo !== "object") {
      return false;
    }

    const fields = [
      "name",
      "url",
      "description",
      "repoType",
      "whyItMatches",
    ] as const;

    for (const field of fields) {
      if (typeof repo[field] !== "string" || !repo[field].trim()) {
        return false;
      }
    }

    if (!isValidGitHubRepoUrl(repo.url)) {
      return false;
    }

    if (seenUrls.has(repo.url)) {
      return false;
    }

    seenUrls.add(repo.url);
  }

  return true;
}

/**
 * Release the recommendation lock after a failed run.
 *
 * This ensures a transient agent/database failure does not permanently
 * leave the user in the "running" state.
 */
async function releaseRepoRecommendationLock(userId: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        repoRecommendationsStatus: "idle",
      },
      $unset: {
        repoRecommendationsSessionId: 1,
      },
    },
  );
}

async function handleAgentResult(
  user: InstanceType<typeof User>,
  result: AgentRunResult,
  res: Response,
) {
  /**
   * Agent requires external authorization.
   *
   * Keep the session so the frontend can resume it after OAuth.
   */
  if (result.status === "auth_required") {
    user.repoRecommendationsSessionId = result.sessionId;
    user.repoRecommendationsStatus = "auth_required";

    await user.save();

    console.log(
      `[find-repo] auth required user=${user.username} session=${result.sessionId}`,
    );

    return res.status(202).json({
      success: false,
      status: "auth_required",
      sessionId: result.sessionId,
      authUrls: result.authUrls,
    });
  }

  /**
   * The agent completed, but its output is untrusted.
   * Parse and validate before saving anything.
   */
  const parsed = parseAgentJson<RepoRecommendations>(result.text);

  if (!validateRecommendations(parsed)) {
    console.error(`[find-repo] invalid recommendations returned by agent`);

    await releaseRepoRecommendationLock(user.id);

    return res.status(500).json({
      success: false,
      error: "Agent returned invalid recommendations",
    });
  }

  /**
   * Only validated recommendations reach the database.
   */
  user.repoRecommendations = parsed.matchedRepositories;
  user.repoRecommendationsRaw = result.text;
  user.repoRecommendationsParseFailed = false;
  user.repoRecommendationsGeneratedAt = new Date();
  user.repoRecommendationsSessionId = undefined;
  user.repoRecommendationsStatus = "idle";

  await user.save();

  console.log(`[find-repo] recommendations saved user=${user.username}`);

  return res.json({
    success: true,
    matchedRepositories: parsed.matchedRepositories,
    cached: false,
    generatedAt: user.repoRecommendationsGeneratedAt,
  });
}

router.get(
  "/recommendations",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await User.findById(req.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const refresh = req.query.refresh === "true";

      console.log(
        `[find-repo] request user=${user.username} refresh=${refresh}`,
      );

      /**
       * Return existing recommendations unless an explicit refresh
       * was requested.
       */
      if (!refresh && user.repoRecommendations?.length) {
        console.log(
          `[find-repo] returning cached recommendations user=${user.username}`,
        );

        return res.json({
          success: true,
          matchedRepositories: user.repoRecommendations,
          cached: true,
          generatedAt: user.repoRecommendationsGeneratedAt,
        });
      }

      /**
       * The recommender needs the developer profile as input.
       */
      if (!user.developerProfile) {
        return res.status(400).json({
          success: false,
          code: "DEVELOPER_PROFILE_REQUIRED",
          error: "Developer profile not found",
        });
      }

      /**
       * Atomically claim the recommendation run.
       *
       * This replaces the old read -> check -> save sequence.
       *
       * With this query, only one concurrent request can transition:
       *
       *     idle -> running
       *
       * Every other concurrent request gets null and receives 409.
       */
      console.log(
        `[find-repo] attempting to claim recommendation run user=${user.username}`,
      );

      const claimedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          repoRecommendationsStatus: "idle",
        },
        {
          $set: {
            repoRecommendationsStatus: "running",
          },
        },
        {
          new: true,
        },
      );

      /**
       * Another request already owns the recommendation run.
       */
      if (!claimedUser) {
        const currentUser = await User.findById(user._id);

        if (!currentUser) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        return res.status(409).json({
          success: false,
          status: currentUser.repoRecommendationsStatus,
          sessionId: currentUser.repoRecommendationsSessionId,
          message: "Repo recommendation is already in progress",
        });
      }

      console.log(
        `[find-repo] generating recommendations user=${claimedUser.username}`,
      );

      /**
       * Run the agent while the atomic lock is held.
       *
       * Any thrown error releases the lock before returning 500.
       */
      try {
        const result = await runAgent({
          agentName: REPO_RECOMMENDER_AGENT_NAME,
          label: "find-repo",
          prompt: `Developer profile JSON:\n${JSON.stringify(
            claimedUser.developerProfile,
          )}\n\nFind matching repositories for this developer.`,
        });

        return await handleAgentResult(claimedUser, result, res);
      } catch (error) {
        await releaseRepoRecommendationLock(claimedUser.id);
        throw error;
      }
    } catch (error: any) {
      console.error(
        "[find-repo] failed:",
        error?.response?.data || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to generate repo recommendations",
      });
    }
  },
);

router.post(
  "/recommendations/resume",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await User.findById(req.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      /**
       * Resume is only valid when a previous agent run paused
       * specifically for authorization.
       */
      if (
        !user.repoRecommendationsSessionId ||
        user.repoRecommendationsStatus !== "auth_required"
      ) {
        return res.status(400).json({
          success: false,
          error: "No pending GitHub authorization",
        });
      }

      const sessionId = user.repoRecommendationsSessionId;

      console.log(
        `[find-repo] resuming user=${user.username} session=${sessionId}`,
      );

      /**
       * Move auth_required -> running before resuming.
       *
       * This prevents multiple resume requests from attempting
       * to continue the same session simultaneously.
       */
      user.repoRecommendationsStatus = "running";
      await user.save();

      try {
        const result = await resumeAgent({
          sessionId,
          label: "find-repo-resume",
        });

        return await handleAgentResult(user, result, res);
      } catch (error) {
        /**
         * If resume fails, make sure the user is not permanently
         * stuck in "running".
         */
        await releaseRepoRecommendationLock(user.id);
        throw error;
      }
    } catch (error: any) {
      console.error(
        "[find-repo] resume failed:",
        error?.response?.data || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to resume recommendations",
      });
    }
  },
);

export default router;
