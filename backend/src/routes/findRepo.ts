// routes/findRepo.ts
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

async function handleAgentResult(
  user: InstanceType<typeof User>,
  result: AgentRunResult,
  res: Response,
) {
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

  const parsed = parseAgentJson<RepoRecommendations>(result.text);

  if (!parsed || !Array.isArray(parsed.matchedRepositories)) {
    console.error(`[find-repo] invalid JSON returned by agent`);

    user.repoRecommendationsStatus = "idle";
    user.repoRecommendationsSessionId = undefined;
    await user.save();

    return res.status(500).json({
      success: false,
      error: "Agent returned invalid recommendations JSON",
      raw: result.text,
    });
  }

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
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      const refresh = req.query.refresh === "true";

      console.log(
        `[find-repo] request user=${user.username} refresh=${refresh}`,
      );

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

      if (
        user.repoRecommendationsStatus === "running" ||
        user.repoRecommendationsStatus === "auth_required"
      ) {
        return res.status(409).json({
          success: false,
          status: user.repoRecommendationsStatus,
          sessionId: user.repoRecommendationsSessionId,
          message: "Repo recommendation is already in progress",
        });
      }

      // The recommender needs the developer profile as input — it must exist first
      if (!user.developerProfile) {
        return res.status(400).json({
          success: false,
          error:
            "Developer profile not found. Generate it first via GET /api/oss/profile.",
        });
      }

      console.log(
        `[find-repo] generating recommendations user=${user.username}`,
      );

      user.repoRecommendationsStatus = "running";
      await user.save();

      const result = await runAgent({
        agentName: REPO_RECOMMENDER_AGENT_NAME,
        label: "find-repo",
        prompt: `Developer profile JSON:\n${JSON.stringify(
          user.developerProfile,
        )}\n\nFind matching repositories for this developer.`,
      });

      return await handleAgentResult(user, result, res);
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
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      if (
        !user.repoRecommendationsSessionId ||
        user.repoRecommendationsStatus !== "auth_required"
      ) {
        return res.status(400).json({
          success: false,
          error: "No pending GitHub authorization",
        });
      }

      console.log(
        `[find-repo] resuming user=${user.username} session=${user.repoRecommendationsSessionId}`,
      );

      const result = await resumeAgent({
        sessionId: user.repoRecommendationsSessionId,
        label: "find-repo-resume",
      });

      return await handleAgentResult(user, result, res);
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
