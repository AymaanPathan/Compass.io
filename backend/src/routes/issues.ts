import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import {
  agentClient,
  OSS_ISSUES_AGENT_NAME,
  OSS_ISSUE_DEEP_DIVE_AGENT_NAME,
  OSS_CODE_EXPLORER_AGENT_NAME,
} from "../services/agentClient";
import { withAgentRetry } from "../utils/retryAgentTurn";

const DEBUG_AGENT_EVENTS = process.env.DEBUG_AGENT_EVENTS === "true";

const router = Router();

export interface GithubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: string[];
  createdAt: string;
}

interface IssuesResult {
  repository: string;
  issues: GithubIssue[];
}

export interface IssueDeepDiveResult {
  repository: string;
  issueNumber: number;
  title: string;
  author: string;
  state: string;
  whatIsTheIssue: string;
  whatIsHappeningNow: string;
  whatShouldHappen: string;
  whyItMatters: string;
  whoWhatIsAffected: string;
  whereInTheProject: string;
  technicalConcepts: string[];
  backgroundContext: string;
}

export interface CodeExplorerResult {
  repository: string;
  issueNumber: number;
  relevantPackage: string;
  relevantSubsystem: string;
  relevantFiles: string[];
  relevantFunctionsOrClasses: string[];
  codeFlow: string;
  relevantTests: string[];
  architectureContext: string;
  dependenciesAndInterfaces: string[];
  externalContext: string;
}

export interface DeepDiveContext {
  whatIsTheIssue?: string;
  whatIsHappeningNow?: string;
  whereInTheProject?: string;
  technicalConcepts?: string[];
}

// ---------------------------------------------------------------------------
// Request limits
// ---------------------------------------------------------------------------

const MAX_REPO_FULL_NAME_LENGTH = 200;
const MAX_CONTEXT_FIELD_LENGTH = 4_000;
const MAX_TECHNICAL_CONCEPTS = 20;
const MAX_TECHNICAL_CONCEPT_LENGTH = 200;
const MAX_ISSUE_NUMBER = 10_000_000;

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

// ---------------------------------------------------------------------------
// Issue discovery cache
// ---------------------------------------------------------------------------

const inFlightRequests = new Map<string, Promise<IssuesResult>>();

const resultCache = new Map<
  string,
  {
    result: IssuesResult;
    expiresAt: number;
  }
>();

function getCached(repoFullName: string): IssuesResult | null {
  const entry = resultCache.get(repoFullName);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    resultCache.delete(repoFullName);
    return null;
  }

  return entry.result;
}

function setCached(repoFullName: string, result: IssuesResult): void {
  if (!resultCache.has(repoFullName) && resultCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;

    if (oldestKey) {
      resultCache.delete(oldestKey);
    }
  }

  resultCache.set(repoFullName, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// Deep dive cache
// ---------------------------------------------------------------------------

const deepDiveInFlight = new Map<string, Promise<IssueDeepDiveResult>>();

const deepDiveCache = new Map<
  string,
  {
    result: IssueDeepDiveResult;
    expiresAt: number;
  }
>();

function deepDiveKey(repoFullName: string, issueNumber: number): string {
  return `${repoFullName}#${issueNumber}`;
}

function getCachedDeepDive(key: string): IssueDeepDiveResult | null {
  const entry = deepDiveCache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    deepDiveCache.delete(key);
    return null;
  }

  return entry.result;
}

function setCachedDeepDive(key: string, result: IssueDeepDiveResult): void {
  if (!deepDiveCache.has(key) && deepDiveCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = deepDiveCache.keys().next().value;

    if (oldestKey) {
      deepDiveCache.delete(oldestKey);
    }
  }

  deepDiveCache.set(key, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// Code explorer cache
// ---------------------------------------------------------------------------

const codeExplorerInFlight = new Map<string, Promise<CodeExplorerResult>>();

const codeExplorerCache = new Map<
  string,
  {
    result: CodeExplorerResult;
    expiresAt: number;
  }
>();

function codeExplorerKey(repoFullName: string, issueNumber: number): string {
  return `${repoFullName}#${issueNumber}`;
}

function getCachedCodeExplorer(key: string): CodeExplorerResult | null {
  const entry = codeExplorerCache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    codeExplorerCache.delete(key);
    return null;
  }

  return entry.result;
}

function setCachedCodeExplorer(key: string, result: CodeExplorerResult): void {
  if (
    !codeExplorerCache.has(key) &&
    codeExplorerCache.size >= MAX_CACHE_ENTRIES
  ) {
    const oldestKey = codeExplorerCache.keys().next().value;

    if (oldestKey) {
      codeExplorerCache.delete(oldestKey);
    }
  }

  codeExplorerCache.set(key, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function parseRepoFullName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const repoFullName = value.trim();

  if (!repoFullName || repoFullName.length > MAX_REPO_FULL_NAME_LENGTH) {
    return null;
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoFullName)) {
    return null;
  }

  return repoFullName;
}

function parseIssueNumber(value: unknown): number | null {
  const issueNumber = typeof value === "number" ? value : Number(value);

  if (
    !Number.isInteger(issueNumber) ||
    issueNumber <= 0 ||
    issueNumber > MAX_ISSUE_NUMBER
  ) {
    return null;
  }

  return issueNumber;
}

function sanitizeDeepDiveContext(
  context: unknown,
): DeepDiveContext | undefined {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return undefined;
  }

  const input = context as Record<string, unknown>;

  const safe: DeepDiveContext = {};

  if (typeof input.whatIsTheIssue === "string") {
    safe.whatIsTheIssue = input.whatIsTheIssue
      .trim()
      .slice(0, MAX_CONTEXT_FIELD_LENGTH);
  }

  if (typeof input.whatIsHappeningNow === "string") {
    safe.whatIsHappeningNow = input.whatIsHappeningNow
      .trim()
      .slice(0, MAX_CONTEXT_FIELD_LENGTH);
  }

  if (typeof input.whereInTheProject === "string") {
    safe.whereInTheProject = input.whereInTheProject
      .trim()
      .slice(0, MAX_CONTEXT_FIELD_LENGTH);
  }

  if (Array.isArray(input.technicalConcepts)) {
    safe.technicalConcepts = input.technicalConcepts
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().slice(0, MAX_TECHNICAL_CONCEPT_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_TECHNICAL_CONCEPTS);
  }

  if (
    !safe.whatIsTheIssue &&
    !safe.whatIsHappeningNow &&
    !safe.whereInTheProject &&
    (!safe.technicalConcepts || safe.technicalConcepts.length === 0)
  ) {
    return undefined;
  }

  return safe;
}

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

function extractBalancedJson(input: string): string | null {
  const start = input.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === "{") {
      depth++;
    }

    if (ch === "}") {
      depth--;

      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}

function stripMarkdownFences(input: string): string {
  return input
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Agent output parsers
// ---------------------------------------------------------------------------

function parseIssuesResponse(text: string): IssuesResult | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const jsonStr = extractBalancedJson(cleaned);

    if (!jsonStr) {
      console.error("[issues/fetch] no balanced JSON object found");
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== "object") {
      console.error("[issues/fetch] parsed response is not an object");
      return null;
    }

    if (!("issues" in parsed)) {
      console.warn(
        "[issues/fetch] response had no issues array — treating as empty",
      );

      return {
        repository: String(parsed.repository || ""),
        issues: [],
      };
    }

    if (!Array.isArray(parsed.issues)) {
      console.error("[issues/fetch] issues field is not an array");
      return null;
    }

    const issues: GithubIssue[] = parsed.issues
      .filter((issue: any) => issue && typeof issue === "object")
      .map((issue: any) => ({
        number: Number(issue.number) || 0,
        title: String(issue.title || "Untitled issue"),
        state: String(issue.state || "open"),
        url: String(issue.url || ""),
        author: String(issue.author || "unknown"),
        labels: Array.isArray(issue.labels) ? issue.labels.map(String) : [],
        createdAt: String(issue.createdAt || ""),
      }))
      .filter((issue: GithubIssue) => issue.number > 0 && issue.url.length > 0);

    return {
      repository: String(parsed.repository || ""),
      issues,
    };
  } catch (error) {
    console.error("[issues/fetch] failed to parse agent output:", error);

    return null;
  }
}

function parseDeepDiveResponse(text: string): IssueDeepDiveResult | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const jsonStr = extractBalancedJson(cleaned);

    if (!jsonStr) {
      console.error("[issues/deep-dive] no balanced JSON object found");
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!parsed.repository) {
      console.error("[issues/deep-dive] response missing repository field");
      return null;
    }

    const issueNumber = Number(parsed.issueNumber);

    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      console.error("[issues/deep-dive] invalid issueNumber in agent response");
      return null;
    }

    return {
      repository: String(parsed.repository || ""),
      issueNumber,
      title: String(parsed.title || ""),
      author: String(parsed.author || ""),
      state: String(parsed.state || "unknown"),
      whatIsTheIssue: String(parsed.whatIsTheIssue || ""),
      whatIsHappeningNow: String(parsed.whatIsHappeningNow || ""),
      whatShouldHappen: String(parsed.whatShouldHappen || ""),
      whyItMatters: String(parsed.whyItMatters || ""),
      whoWhatIsAffected: String(parsed.whoWhatIsAffected || ""),
      whereInTheProject: String(parsed.whereInTheProject || ""),
      technicalConcepts: Array.isArray(parsed.technicalConcepts)
        ? parsed.technicalConcepts.map(String)
        : [],
      backgroundContext: String(parsed.backgroundContext || ""),
    };
  } catch (error) {
    console.error("[issues/deep-dive] failed to parse agent output:", error);

    return null;
  }
}

function parseCodeExplorerResponse(text: string): CodeExplorerResult | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const jsonStr = extractBalancedJson(cleaned);

    if (!jsonStr) {
      console.error("[issues/code-explore] no balanced JSON object found");
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!parsed.repository) {
      console.error("[issues/code-explore] response missing repository field");
      return null;
    }

    const issueNumber = Number(parsed.issueNumber);

    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      console.error(
        "[issues/code-explore] invalid issueNumber in agent response",
      );
      return null;
    }

    const strArr = (value: any): string[] =>
      Array.isArray(value)
        ? value.filter((item) => typeof item === "string").map(String)
        : [];

    return {
      repository: String(parsed.repository || ""),
      issueNumber,
      relevantPackage: String(parsed.relevantPackage || ""),
      relevantSubsystem: String(parsed.relevantSubsystem || ""),
      relevantFiles: strArr(parsed.relevantFiles),
      relevantFunctionsOrClasses: strArr(parsed.relevantFunctionsOrClasses),
      codeFlow: String(parsed.codeFlow || ""),
      relevantTests: strArr(parsed.relevantTests),
      architectureContext: String(parsed.architectureContext || ""),
      dependenciesAndInterfaces: strArr(parsed.dependenciesAndInterfaces),
      externalContext: String(parsed.externalContext || ""),
    };
  } catch (error) {
    console.error("[issues/code-explore] failed to parse agent output:", error);

    return null;
  }
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function isRateLimitError(error: any): boolean {
  const status = error?.response?.status ?? error?.status ?? error?.statusCode;

  if (status === 429) {
    return true;
  }

  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

// ---------------------------------------------------------------------------
// Agent execution
// ---------------------------------------------------------------------------

async function runAgent(
  agentName: string,
  prompt: string,
  debugLabel: string,
  retryOptions?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  },
): Promise<string> {
  return withAgentRetry(
    async () => {
      const { data: session } = await agentClient.sessions.create({
        agent: {
          name: agentName,
        },
      });

      const stream = await agentClient.sessions.createTurnStream(session.id, {
        input: [
          {
            type: "user.message",
            content: prompt,
          },
        ],
      });

      let finalText = "";

      for await (const { data: event } of stream.withMetadata()) {
        if (DEBUG_AGENT_EVENTS) {
          console.log(
            `[${debugLabel} agent event] ${event?.type}`,
            JSON.stringify(event),
          );
        }

        if (event.type === "model.message.delta" && event.threadId === "main") {
          if (typeof event.content === "string") {
            finalText += event.content;
          }
        }

        if (event.type === "turn.done") {
          const status = event.state?.status;

          console.log(`[${debugLabel}] turn status:`, status);

          if (status === "error") {
            throw new Error(
              (event.state as any)?.message || "Agent turn failed",
            );
          }

          if (status !== "done") {
            throw new Error(
              `Agent turn ended with unexpected status: ${status}`,
            );
          }

          if (event.state?.output?.content) {
            const content = event.state.output.content;

            if (typeof content === "string") {
              finalText = content;
            } else if (Array.isArray(content)) {
              finalText = content
                .filter(
                  (item: any) =>
                    item?.type === "text" && typeof item.text === "string",
                )
                .map((item: any) => item.text)
                .join("");
            }
          }
        }
      }

      if (!finalText.trim()) {
        throw new Error("Agent returned empty output");
      }

      return finalText.trim();
    },
    retryOptions ?? {
      maxAttempts: 2,
      baseDelayMs: 1500,
    },
  );
}

// ---------------------------------------------------------------------------
// Agent 1 — Issue discovery
// ---------------------------------------------------------------------------

async function getIssuesForRepo(repoFullName: string): Promise<IssuesResult> {
  const cached = getCached(repoFullName);

  if (cached) {
    console.log(`[issues/fetch] cache hit for ${repoFullName}`);

    return cached;
  }

  const inFlight = inFlightRequests.get(repoFullName);

  if (inFlight) {
    console.log(`[issues/fetch] joining in-flight request for ${repoFullName}`);

    return inFlight;
  }

  const promise = (async () => {
    console.log("[issues/fetch] running agent for", repoFullName);

    const prompt = `Repository: ${repoFullName}`;

    const finalText = await runAgent(OSS_ISSUES_AGENT_NAME, prompt, "issues");

    const parsed = parseIssuesResponse(finalText);

    if (!parsed) {
      const err: any = new Error(
        "Issue discovery agent returned an invalid response",
      );

      err.raw = finalText;

      throw err;
    }

    const result: IssuesResult = {
      repository: parsed.repository || repoFullName,
      issues: parsed.issues,
    };

    setCached(repoFullName, result);

    return result;
  })();

  inFlightRequests.set(repoFullName, promise);

  try {
    return await promise;
  } finally {
    inFlightRequests.delete(repoFullName);
  }
}

// ---------------------------------------------------------------------------
// Agent 2 — Issue deep dive
// ---------------------------------------------------------------------------

async function getDeepDiveForIssue(
  repoFullName: string,
  issueNumber: number,
): Promise<IssueDeepDiveResult> {
  const key = deepDiveKey(repoFullName, issueNumber);

  const cached = getCachedDeepDive(key);

  if (cached) {
    console.log(`[issues/deep-dive] cache hit for ${key}`);

    return cached;
  }

  const inFlight = deepDiveInFlight.get(key);

  if (inFlight) {
    console.log(`[issues/deep-dive] joining in-flight request for ${key}`);

    return inFlight;
  }

  const promise = (async () => {
    console.log("[issues/deep-dive] running agent for", key);

    const prompt = `${repoFullName}#${issueNumber}`;

    const finalText = await runAgent(
      OSS_ISSUE_DEEP_DIVE_AGENT_NAME,
      prompt,
      "deep-dive",
    );

    const parsed = parseDeepDiveResponse(finalText);

    if (!parsed) {
      const err: any = new Error(
        "Issue deep-dive agent returned an invalid response",
      );

      err.raw = finalText;

      throw err;
    }

    // Never cache an answer for a different issue.
    if (
      parsed.repository !== repoFullName ||
      parsed.issueNumber !== issueNumber
    ) {
      throw new Error(
        `Agent returned mismatched issue: expected ${repoFullName}#${issueNumber}, got ${parsed.repository}#${parsed.issueNumber}`,
      );
    }

    setCachedDeepDive(key, parsed);

    return parsed;
  })();

  deepDiveInFlight.set(key, promise);

  try {
    return await promise;
  } finally {
    deepDiveInFlight.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Agent 3 — Code explorer
// ---------------------------------------------------------------------------

function buildCodeExplorerPrompt(
  repoFullName: string,
  issueNumber: number,
  context?: DeepDiveContext,
): string {
  const base = `${repoFullName}#${issueNumber}`;

  if (!context) {
    return base;
  }

  const trimmed: DeepDiveContext = {};

  if (context.whatIsTheIssue) {
    trimmed.whatIsTheIssue = context.whatIsTheIssue.slice(
      0,
      MAX_CONTEXT_FIELD_LENGTH,
    );
  }

  if (context.whatIsHappeningNow) {
    trimmed.whatIsHappeningNow = context.whatIsHappeningNow.slice(
      0,
      MAX_CONTEXT_FIELD_LENGTH,
    );
  }

  if (context.whereInTheProject) {
    trimmed.whereInTheProject = context.whereInTheProject.slice(
      0,
      MAX_CONTEXT_FIELD_LENGTH,
    );
  }

  if (context.technicalConcepts && context.technicalConcepts.length > 0) {
    trimmed.technicalConcepts = context.technicalConcepts
      .slice(0, MAX_TECHNICAL_CONCEPTS)
      .map((concept) => concept.slice(0, MAX_TECHNICAL_CONCEPT_LENGTH));
  }

  if (Object.keys(trimmed).length === 0) {
    return base;
  }

  return `${base}

CONTEXT FROM AGENT 1:
${JSON.stringify(trimmed)}`;
}

async function getCodeExplorationForIssue(
  repoFullName: string,
  issueNumber: number,
  context?: DeepDiveContext,
): Promise<CodeExplorerResult> {
  const key = codeExplorerKey(repoFullName, issueNumber);

  const cached = getCachedCodeExplorer(key);

  if (cached) {
    console.log(`[issues/code-explore] cache hit for ${key}`);

    return cached;
  }

  const inFlight = codeExplorerInFlight.get(key);

  if (inFlight) {
    console.log(`[issues/code-explore] joining in-flight request for ${key}`);

    return inFlight;
  }

  const promise = (async () => {
    console.log("[issues/code-explore] running agent for", key);

    const prompt = buildCodeExplorerPrompt(repoFullName, issueNumber, context);

    const finalText = await runAgent(
      OSS_CODE_EXPLORER_AGENT_NAME,
      prompt,
      "code-explore",
      {
        maxAttempts: 3,
        baseDelayMs: 15000,
        maxDelayMs: 60000,
      },
    );

    const parsed = parseCodeExplorerResponse(finalText);

    if (!parsed) {
      const err: any = new Error(
        "Code explorer agent returned an invalid response",
      );

      err.raw = finalText;

      throw err;
    }

    // Never cache an answer for a different issue.
    if (
      parsed.repository !== repoFullName ||
      parsed.issueNumber !== issueNumber
    ) {
      throw new Error(
        `Agent returned mismatched issue: expected ${repoFullName}#${issueNumber}, got ${parsed.repository}#${parsed.issueNumber}`,
      );
    }

    setCachedCodeExplorer(key, parsed);

    return parsed;
  })();

  codeExplorerInFlight.set(key, promise);

  try {
    return await promise;
  } finally {
    codeExplorerInFlight.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post("/fetch", requireAuth, async (req: Request, res: Response) => {
  try {
    const repoFullName = parseRepoFullName(req.body?.repoFullName);

    if (!repoFullName) {
      return res.status(400).json({
        success: false,
        error:
          "repoFullName must be a valid GitHub repository in owner/name format",
      });
    }

    const result = await getIssuesForRepo(repoFullName);

    return res.json({
      success: true,
      repository: result.repository,
      issues: result.issues,
    });
  } catch (error: any) {
    console.error("[issues/fetch] error:", error);

    if (isRateLimitError(error)) {
      return res.status(429).json({
        success: false,
        error:
          "The issue-discovery agent is rate-limited right now. Please wait about a minute and try again.",
      });
    }

    return res.status(502).json({
      success: false,
      error: error?.message || "Failed to fetch issues",
    });
  }
});

// ---------------------------------------------------------------------------
// Deep dive
// ---------------------------------------------------------------------------

router.post("/deep-dive", requireAuth, async (req: Request, res: Response) => {
  try {
    const repoFullName = parseRepoFullName(req.body?.repoFullName);

    if (!repoFullName) {
      return res.status(400).json({
        success: false,
        error:
          "repoFullName must be a valid GitHub repository in owner/name format",
      });
    }

    const issueNumber = parseIssueNumber(req.body?.issueNumber);

    if (issueNumber === null) {
      return res.status(400).json({
        success: false,
        error: "issueNumber must be a positive integer",
      });
    }

    const result = await getDeepDiveForIssue(repoFullName, issueNumber);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[issues/deep-dive] error:", error);

    if (isRateLimitError(error)) {
      return res.status(429).json({
        success: false,
        error:
          "The issue deep-dive agent is rate-limited right now. Please wait about a minute and try again.",
      });
    }

    return res.status(502).json({
      success: false,
      error: error?.message || "Failed to run deep dive",
    });
  }
});

// ---------------------------------------------------------------------------
// Code explorer
// ---------------------------------------------------------------------------

router.post(
  "/code-explore",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const repoFullName = parseRepoFullName(req.body?.repoFullName);

      if (!repoFullName) {
        return res.status(400).json({
          success: false,
          error:
            "repoFullName must be a valid GitHub repository in owner/name format",
        });
      }

      const issueNumber = parseIssueNumber(req.body?.issueNumber);

      if (issueNumber === null) {
        return res.status(400).json({
          success: false,
          error: "issueNumber must be a positive integer",
        });
      }

      const safeContext = sanitizeDeepDiveContext(req.body?.context);

      const result = await getCodeExplorationForIssue(
        repoFullName,
        issueNumber,
        safeContext,
      );

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("[issues/code-explore] error:", error);

      if (isRateLimitError(error)) {
        return res.status(429).json({
          success: false,
          error:
            "The code explorer agent is rate-limited right now. Please wait about a minute and try again.",
        });
      }

      return res.status(502).json({
        success: false,
        error: error?.message || "Failed to explore code",
      });
    }
  },
);

export default router;
