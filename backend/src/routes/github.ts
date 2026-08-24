import { Router, Response } from "express";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { agentClient, DEV_PROFILE_AGENT_NAME } from "../services/agentClient";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";

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
 * Extract text safely from Agent SDK model message events.
 *
 * event.content can now be:
 *
 * string
 *
 * OR
 *
 * [
 *   { type: "...", text/content/... },
 *   ...
 * ]
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

  // Old/simple SDK format
  if (typeof content === "string") {
    return content;
  }

  // Array of content items
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        // Typical text content item
        if (typeof item?.text === "string") {
          return item.text;
        }

        if (typeof item?.content === "string") {
          return item.content;
        }

        return "";
      })
      .join("");
  }

  // Object-based content
  if (typeof content?.text === "string") {
    return content.text;
  }

  return "";
}



function parseProfileResponse(text: string): DeveloperProfile | null {
  try {
    const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "");

    const parsed = JSON.parse(cleaned);

    if (
      !parsed.builderArchetype ||
      !Array.isArray(parsed.strongestTechnologies)
    ) {
      return null;
    }

    return parsed as DeveloperProfile;
  } catch {
    return null;
  }
}

// Agent Harness session, not the Gateway's stateless chat pattern.
// We persist session.id on the user doc and resume via getSession()
// instead of creating a new session and losing context.
async function getOrCreateProfileSession(user: any) {
  if (user.developerProfileSessionId) {
    try {
      console.log("♻️ Reusing session:", user.developerProfileSessionId);

      const response = await agentClient.sessions.get(
        user.developerProfileSessionId,
      );

      return response.data;
    } catch (err) {
      console.warn("Session invalid, creating new one", err);
    }
  }

  const response = await agentClient.sessions.create({
    agent: {
      name: DEV_PROFILE_AGENT_NAME,
    },
  });

  const session = response.data;

  console.log("🆕 Created session:", session.id);

  user.developerProfileSessionId = session.id;

  await user.save();

  return session;
}
// The developer-profile-agent has its own GitHub MCP tools
// (get_me, search_repositories, list_commits, search_code) preloaded.
//
// It gathers evidence itself. We just trigger the analysis instruction
// and let the agent explore the authenticated developer's GitHub profile.
async function runProfileAgent(user: any): Promise<string> {
  return withAgentRetry(async () => {
    const session = await getOrCreateProfileSession(user);

    let finalText = "";

    const stream = await agentClient.sessions.createTurnStream(session.id, {
      input: [
        {
          type: "user.message",
          content:
            "Analyze the authenticated developer's GitHub profile and repositories now, using the GitHub MCP tools available to you. Produce the developer profile exactly as specified in your instructions.",
        },
      ],
    });

    for await (const event of stream) {
      if (DEBUG_AGENT_EVENTS) {
        console.log(
          `[profile agent event] ${event?.type}`,
          JSON.stringify(event),
        );
      }

      // Stream chunks as they arrive
      const chunk = extractText(event);

      if (chunk) {
        finalText += chunk;
      }

      // Get canonical final output when finished
      if (event?.type === "turn.done") {
        console.log("[profile agent] turn status:", event.state?.status);

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

router.get("/profile", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const forceRefresh = req.query.refresh === "true";

    /**
     * Serve cached profile unless caller explicitly requests refresh.
     */
    if (!forceRefresh && user.developerProfile) {
      return res.json({
        success: true,
        profile: user.developerProfile,
        raw: user.developerProfileRaw ?? null,
        parseFailed: user.developerProfileParseFailed ?? false,
        cached: true,
        generatedAt: user.developerProfileGeneratedAt,
      });
    }

    /**
     * Run the developer profile agent.
     */
    const finalText = await runProfileAgent(user);

    console.log("[profile agent] final output length:", finalText.length);

    const profile = parseProfileResponse(finalText);

    /**
     * If parsing fails, store the raw agent output.
     */
    if (!profile) {
      console.warn(
        "Developer profile agent: failed to parse JSON, returning raw fallback",
      );

      user.developerProfileRaw = finalText;
      user.developerProfileParseFailed = true;
      user.developerProfileGeneratedAt = new Date();

      await user.save();

      return res.json({
        success: true,
        profile: null,
        raw: finalText,
        parseFailed: true,
        cached: false,
      });
    }

    /**
     * Persist successful parsed profile.
     */
    user.developerProfile = profile as any;
    user.developerProfileRaw = finalText;
    user.developerProfileParseFailed = false;
    user.developerProfileGeneratedAt = new Date();

    await user.save();

    return res.json({
      success: true,
      profile,
      raw: finalText,
      parseFailed: false,
      cached: false,
      generatedAt: user.developerProfileGeneratedAt,
    });
  } catch (error: any) {
    console.error(
      "Developer profile fetch error:",
      error.response?.data || error.message || error,
    );

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: "GitHub token invalid, please log in again",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to analyze GitHub profile",
    });
  }
});

export default router;
