import { Router, Response } from "express";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { DEV_PROFILE_AGENT_NAME } from "../services/agentClient";
import { runAgent } from "../services/agentRunner";
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

    console.log(`[dev-profile] generating profile user=${user.username}`);

    const raw = await runAgent({
      agentName: DEV_PROFILE_AGENT_NAME,
      label: "dev-profile",
      prompt:
        "Analyze the authenticated GitHub developer and return the developer profile.",
    });

    const profile = parseAgentJson<DeveloperProfile>(raw);

    if (!profile) {
      console.error(`[dev-profile] invalid JSON returned by agent`);

      return res.status(500).json({
        success: false,
        error: "Agent returned invalid profile JSON",
        raw,
      });
    }

    user.developerProfile = profile as any;
    user.developerProfileRaw = raw;
    user.developerProfileParseFailed = false;
    user.developerProfileGeneratedAt = new Date();

    await user.save();

    console.log(`[dev-profile] profile saved user=${user.username}`);

    return res.json({
      success: true,
      profile,
      cached: false,
      generatedAt: user.developerProfileGeneratedAt,
    });
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

export default router;
