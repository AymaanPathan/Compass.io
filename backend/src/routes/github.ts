import { Router, Response } from "express";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { DEV_PROFILE_AGENT_NAME } from "../services/agentClient";
import { runAgent, resumeAgent, AgentRunResult } from "../services/agentRunner";
import { parseAgentJson } from "../utils/agentResponseToJson";

const router = Router();

interface TechConfidence {
  name: string;
  confidence: number;
}

export interface DeveloperProfile {
  builderArchetype: string;
  developerType: string;
  summary: string;
  githubVibe: string;
  experienceLevel:
    | "Beginner"
    | "Early Intermediate"
    | "Intermediate"
    | "Advanced";
  strongestTechnologies: TechConfidence[];
  strengths: string[];
  engineeringPatterns: string[];
  contributionAreas: string[];
  funInsights: string[];
}

/**
 * Shared handling for whatever runAgent/resumeAgent returns: either persist
 * the finished profile, or persist the paused session id + status and tell
 * the client where to send the user to authorize.
 */
async function handleAgentResult(
  user: InstanceType<typeof User>,
  result: AgentRunResult,
  res: Response,
) {
  if (result.status === "auth_required") {
    user.developerProfileSessionId = result.sessionId;
    user.developerProfileStatus = "auth_required";

    await user.save();

    console.log(
      `[dev-profile] auth required user=${user.username} session=${result.sessionId}`,
    );

    return res.status(202).json({
      success: false,
      status: "auth_required",
      sessionId: result.sessionId,
      authUrls: result.authUrls,
    });
  }

  const profile = parseAgentJson<DeveloperProfile>(result.text);

  if (!profile) {
    console.error(`[dev-profile] invalid JSON returned by agent`);

    user.developerProfileStatus = "idle";
    user.developerProfileSessionId = undefined;
    await user.save();

    return res.status(500).json({
      success: false,
      error: "Agent returned invalid profile JSON",
      raw: result.text,
    });
  }

  user.developerProfile = profile as any;
  user.developerProfileRaw = result.text;
  user.developerProfileParseFailed = false;
  user.developerProfileGeneratedAt = new Date();

  user.developerProfileSessionId = undefined;
  user.developerProfileStatus = "idle";

  await user.save();

  console.log(`[dev-profile] profile saved user=${user.username}`);

  return res.json({
    success: true,
    profile,
    cached: false,
    generatedAt: user.developerProfileGeneratedAt,
  });
}

router.get("/profile", requireAuth, async (req: AuthRequest, res: Response) => {
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
      `[dev-profile] request user=${user.username} refresh=${refresh}`,
    );

    if (!refresh && user.developerProfile) {
      console.log(
        `[dev-profile] returning cached profile user=${user.username}`,
      );

      return res.json({
        success: true,
        profile: user.developerProfile,
        cached: true,
        generatedAt: user.developerProfileGeneratedAt,
      });
    }

    if (
      user.developerProfileStatus === "running" ||
      user.developerProfileStatus === "auth_required"
    ) {
      return res.status(409).json({
        success: false,
        status: user.developerProfileStatus,
        sessionId: user.developerProfileSessionId,
        message: "Developer profile analysis is already in progress",
      });
    }

    console.log(`[dev-profile] generating profile user=${user.username}`);

    user.developerProfileStatus = "running";
    await user.save();

    // GitHub auth is handled per-session by TrueForge's own MCP OAuth flow
    // (mcp.auth_required -> authUrl -> resume), not by forwarding a stored
    // access token. See handleAgentResult for the auth_required branch.
    const result = await runAgent({
      agentName: DEV_PROFILE_AGENT_NAME,
      label: "dev-profile",
      prompt:
        "Analyze the authenticated GitHub developer and return the developer profile.",
    });

    return await handleAgentResult(user, result, res);
  } catch (error: any) {
    console.error(
      "[dev-profile] failed:",
      error?.response?.data || error?.message || error,
    );

    return res.status(500).json({
      success: false,
      error: "Failed to analyze GitHub profile",
    });
  }
});

/**
 * Call after the user completes the GitHub OAuth flow for a session that
 * previously paused on mcp.auth_required. Resumes with empty input per
 * TrueForge's docs — no user.message on the resuming turn.
 */
router.post(
  "/profile/resume",
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

      if (
        !user.developerProfileSessionId ||
        user.developerProfileStatus !== "auth_required"
      ) {
        return res.status(400).json({
          success: false,
          error: "No pending GitHub authorization",
        });
      }

      console.log(
        `[dev-profile] resuming user=${user.username} session=${user.developerProfileSessionId}`,
      );

      const result = await resumeAgent({
        sessionId: user.developerProfileSessionId,
        label: "dev-profile-resume",
      });

      return await handleAgentResult(user, result, res);
    } catch (error: any) {
      console.error(
        "[dev-profile] resume failed:",
        error?.response?.data || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        error: "Failed to resume profile analysis",
      });
    }
  },
);

export default router;
