import { Router, Response } from "express";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { DEV_PROFILE_AGENT_NAME, trueforge } from "../services/agentClient";
import {
  openSse,
  streamAgentTurn,
  ToolMeaning,
} from "../services/agentStreaming";

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
 * Human-facing meaning for each MCP tool the developer-profile-agent is
 * allowed to call. Keep in sync with its `enableTools` list.
 */
const TOOL_MEANINGS: Record<string, ToolMeaning> = {
  get_me: {
    label: "Confirming your identity",
    description: "Reading which GitHub account authorized this session",
  },
  search_repositories: {
    label: "Scanning your repositories",
    description:
      "Pulling your public repos to find real signal, not just names",
  },
  list_commits: {
    label: "Sampling commit history",
    description: "Reading recent commits to see how you actually work",
  },
  search_code: {
    label: "Reading code patterns",
    description: "Looking inside files for language and pattern clues",
  },
};

async function markProfileFailed(userId: string, message: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        developerProfileStatus: "failed",
        developerProfileLastError: message,
      },
    },
  );
}

function logErrorChain(label: string, error: any) {
  console.error(`[dev-profile:${label}] ── ERROR ──────────────────────`);
  let depth = 0;
  let current = error;
  while (current && depth < 6) {
    console.error(
      `[dev-profile:${label}] depth=${depth}`,
      `name=${current?.name}`,
      `code=${current?.code}`,
      `message=${current?.message}`,
    );
    current = current?.cause;
    depth++;
  }
  console.error(`[dev-profile:${label}] full error:`, error);
}

router.post(
  "/profile/stream",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    const heartbeat = openSse(res);

    try {
      user.developerProfileStatus = "running";
      await user.save();

      // Fresh session per generation, so a re-run isn't polluted by the last
      // run's history or a half-finished tool call.
      const { data: session } = await trueforge.sessions.create({
        agent: { name: DEV_PROFILE_AGENT_NAME },
      });

      user.developerProfileSessionId = session.id;
      await user.save();

      await streamAgentTurn<DeveloperProfile>(
        res,
        session.id,
        [
          {
            type: "user.message",
            content:
              "Analyze the authenticated GitHub developer and return the developer profile.",
          },
        ],
        "profile-stream",
        TOOL_MEANINGS,
        undefined,
        {
          onAuthRequired: async () => {
            await User.updateOne(
              { _id: user.id },
              { $set: { developerProfileStatus: "auth_required" } },
            );
          },
          onError: (message) => markProfileFailed(user.id, message),
        },
      );
    } catch (error: any) {
      logErrorChain("stream", error);
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "Failed to analyze GitHub profile" })}\n\n`,
      );
      await markProfileFailed(user.id, "Failed to analyze GitHub profile");
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  },
);

router.post(
  "/profile/stream/resume",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    if (!user.developerProfileSessionId) {
      return res
        .status(400)
        .json({ success: false, error: "No pending GitHub authorization" });
    }

    const heartbeat = openSse(res);

    try {
      // Per TrueForge docs: after mcp.auth_required, resume with empty input.
      await streamAgentTurn<DeveloperProfile>(
        res,
        user.developerProfileSessionId,
        [],
        "profile-resume",
        TOOL_MEANINGS,
        undefined,
        {
          onAuthRequired: async () => {
            await User.updateOne(
              { _id: user.id },
              { $set: { developerProfileStatus: "auth_required" } },
            );
          },
          onError: (message) => markProfileFailed(user.id, message),
        },
      );
    } catch (error: any) {
      logErrorChain("resume", error);
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "Failed to resume profile analysis" })}\n\n`,
      );
      await markProfileFailed(user.id, "Failed to resume profile analysis");
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  },
);

/**
 * Called by the client right after it receives the `done` SSE event — the
 * browser already has the parsed profile, so this just persists it instead
 * of re-parsing raw text server-side a second time.
 */
router.post(
  "/profile/commit",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    const { profile, raw } = req.body as {
      profile: DeveloperProfile;
      raw: string;
    };

    user.developerProfile = profile as any;
    user.developerProfileRaw = raw;
    user.developerProfileParseFailed = false;
    user.developerProfileGeneratedAt = new Date();
    user.developerProfileSessionId = undefined;
    user.developerProfileStatus = "idle";
    user.developerProfileLastError = undefined;
    await user.save();

    return res.json({
      success: true,
      generatedAt: user.developerProfileGeneratedAt,
    });
  },
);

// Page-load fetch of whatever's cached.
router.get("/profile", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user)
    return res.status(404).json({ success: false, error: "User not found" });

  return res.json({
    success: true,
    profile: user.developerProfile ?? null,
    cached: Boolean(user.developerProfile),
    generatedAt: user.developerProfileGeneratedAt ?? null,
  });
});

export default router;
