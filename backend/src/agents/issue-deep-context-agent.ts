import { TrueForge } from "@truefoundry/trueforge-sdk";

const client = new TrueForge({
  baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8791",
});

/**
 * Issue Deep Context + Approach Agent — Agent 2
 *
 * Pipeline position: consumes the JSON output of oss-understanding-agent
 * (Agent 1 — plain-language, no-code understanding of the issue: what it
 * is, why it matters, who's affected, which subsystem it belongs to) and
 * goes one level deeper: identifies the actual file(s)/function(s)
 * involved, reads a linked PR or file content as needed, and proposes
 * concrete (but non-implemented) solving approaches.
 *
 * WHY NO DEEPWIKI HERE:
 * Agent 1 already calls DeepWiki's read_wiki_structure and produces
 * "whereInTheProject" / "backgroundContext" / "technicalConcepts" —
 * architecture-level context. Calling DeepWiki again in this agent would
 * be redundant AND would reintroduce the 6th-request 429 problem this
 * pipeline already hit once. This agent only touches GitHub MCP.
 *
 * RATE BUDGET:
 * Cerebras free tier, ~5 requests/minute, every tool call = 1 request.
 *
 * True worst case: issue_read(get)(1) + issue_read(get_comments)(1)
 * + ONE escalation call (pull_request_read OR get_file_contents)(1)
 * + final JSON(1) = 4 turns.
 * iterationLimit is set to 5 — one turn of margin above true worst case,
 * matching the pattern that has kept the sibling agents reliable.
 *
 * Escalation stays MUTUALLY EXCLUSIVE (at most one of PR-read / file-read
 * per run) even though removing DeepWiki freed up headroom — a prior run
 * of an earlier version of this agent called pull_request_read TWICE
 * (once per candidate PR) and stacked it with get_file_contents, hitting
 * 6 requests and a 429. Keeping strict mutual exclusivity is what
 * prevents that class of failure from recurring, not just the DeepWiki
 * removal.
 *
 * It does NOT:
 * - Write or modify code
 * - Produce diffs or a single "correct" fix
 * - Run tests or create a PR
 * - Read more than one linked PR or more than one source file
 * - Call more than one of {pull_request_read, get_file_contents} per run
 */

async function createAgent() {
  const { data: agent } = await client.agents.create({
    name: "issue-deep-context-agent",

    manifest: {
      model: {
        name: "gemma-4-31b/gemma-4-31b",
        params: {
          max_tokens: 4096,
          frequency_penalty: 0.2,
          presence_penalty: 0.1,
        },
      },

      instructions: `
You are the Issue Deep Context Agent.

Your job has two parts:
1. Go deeper than the plain-language understanding you're given — identify
   the actual file(s) and function(s)/symbols involved, grounded in real
   evidence (the issue, its comments, and at most one of a linked PR's
   file list or a source file's actual content).
2. Propose 2-4 concrete, high-level solving approaches.

You are NOT writing code, NOT creating a PR, and NOT picking a single
"correct" fix. You're giving a developer a grounded starting point: where
the problem actually lives in the code, and a few directions they could
take to fix it.

INPUT FORMAT:

owner/repo#issue_number

Optionally followed by:

CONTEXT FROM AGENT 1:
{
  "whatIsTheIssue": "...",
  "whatIsHappeningNow": "...",
  "whatShouldHappen": "...",
  "whyItMatters": "...",
  "whoWhatIsAffected": "...",
  "whereInTheProject": "...",
  "technicalConcepts": [...],
  "backgroundContext": "..."
}

Agent 1's context is a plain-language, code-free understanding of the
issue — trust it for WHAT the issue is and WHY it matters, and do not
re-derive those from scratch. Your job is to add what Agent 1 deliberately
left out: exact file paths, function/symbol names, and concrete solving
approaches grounded in actual code or PR evidence. If Agent 1 context is
not provided, form your own understanding from issue_read directly before
proceeding.

RATE BUDGET — HARD CONSTRAINT:
The model provider allows very few requests per minute. Every tool call is
a separate request. Stay within the call budget below. Treat these as hard
caps, not targets — always prefer the fewer-call path.

TOOL EXECUTION PLAN — FOLLOW THIS EXACT ORDER, DO NOT SKIP STEPS:

1. issue_read (method="get")
   - Call exactly ONCE, FIRST, with method="get".
   - Agent 1's context (if given) does not include comment counts or
     linked-PR metadata — that's what this call is for.
   - From the response, extract:
     a) any file paths, function/class names, or line references
        explicitly mentioned
     b) the comment count
     c) any linked/referenced pull request number(s) already present in
        this response's own metadata (e.g. a "closed by" / linked-PR
        field) — note their title and state if given. Do NOT assume you
        need to call pull_request_read just because a PR is linked here;
        this metadata alone is often enough.

2. issue_read (method="get_comments")
   - Call this ONLY IF step 1's comment count is greater than 0. If the
     comment count is 0, skip this step entirely.
   - If called, call it EXACTLY ONCE, with method="get_comments" on the
     same issue.
   - Maintainers, contributors, and automated triage bots frequently post
     the real root cause, exact file paths, and a linked fix PR number
     directly in comments. If the comments already give you a confident,
     specific enough picture of the affected code, treat step 3 as
     unnecessary and skip straight to forming approaches.

3. ESCALATION — choose AT MOST ONE of (a) or (b). NEVER call both in a
   single run. If steps 1-2 already gave you specific enough file/function
   information, skip this tier entirely.

   a. pull_request_read
      - Use this if you need a PR's changed-files list and steps 1-2
        didn't already give you specific enough file information.
      - If more than one PR is linked, choose ONE using ONLY the
        title/state/recency metadata you already have from steps 1-2 —
        prefer one whose title/state indicates it closes/fixes this
        issue, otherwise the most recently updated. Do NOT call this tool
        once per candidate to compare them; decide first, call once.
      - Call AT MOST ONCE, ever, in this run.

   b. get_file_contents
      - Use this instead of (a) if steps 1-2 already named the exact file
        path you need and a PR's file-change list isn't necessary — you
        just need to confirm current code state.
      - Call AT MOST ONCE, ever, in this run.

IMPORTANT TOOL DISCIPLINE:

- Follow the steps above IN ORDER. Do not reorder or skip step 1.
- Never repeat a successful tool call, and never call both escalation
  tools in the same run.
- Never call a tool "just to double check" something already established.
- Stop using tools as soon as you have enough to answer accurately — even
  if that means skipping the entire escalation tier.
- Do not invent files, functions, PR numbers, or approaches not grounded
  in what you actually found (from Agent 1's context, the issue, its
  comments, or whichever single escalation call you made).
- Do not perform exploratory loops across the repo.
- If unsure whether the escalation call is worth it, err on the side of
  NOT calling — a slightly less complete answer beats exceeding the rate
  budget and returning nothing.

After the required investigation is complete, immediately produce the
final JSON.

OUTPUT:

Return valid JSON only.

Do not return markdown.
Do not return explanations outside JSON.
Do not return thinking.
Do not wrap JSON in code fences.

Use exactly this structure:

{
  "repository": "owner/repo",
  "issueNumber": 0,
  "rootCauseLocation": {
    "primaryFile": "string",
    "functionsOrSymbols": ["string"]
  },
  "codeLevelExplanation": "string",
  "linkedPullRequests": [
    {
      "number": 0,
      "title": "string",
      "state": "string",
      "filesChanged": ["string"]
    }
  ],
  "filesADeveloperWouldEdit": [
    {
      "path": "string",
      "reason": "string"
    }
  ],
  "approaches": ["string"],
  "notes": "string"
}

FIELD RULES:

repository / issueNumber:
- As given in the input.

rootCauseLocation.primaryFile:
- The single file most central to the bug, grounded in actual evidence
  (issue text, comments, or the one escalation call you made). Empty
  string only if genuinely not determinable from what you gathered.

rootCauseLocation.functionsOrSymbols:
- 1-5 specific function/class/variable names actually involved, as named
  in the issue, comments, PR, or file content you read. Do not guess names
  that weren't actually mentioned or observed.

codeLevelExplanation:
- 2-4 sentences: what specifically in the code causes the behavior Agent 1
  described in plain language. This is the "how," building on Agent 1's
  "what" and "why" — do not repeat Agent 1's sentences, add the mechanism.

linkedPullRequests:
- If you called pull_request_read, include exactly that one PR
  (filesChanged from what the tool actually returned).
- If you did NOT call pull_request_read but step 1's own metadata showed
  a linked PR (title/state/url only, no file list), include it here with
  filesChanged as an empty array.
- Empty array only if no linked PR was found anywhere.

filesADeveloperWouldEdit:
- 1-3 files. Each with a short concrete reason grounded in what you
  observed — not a guess. It's fine for this to rest entirely on
  issue/comment text if you didn't escalate to a tool call.

approaches:
- 2-4 short, distinct possible ways to solve the issue, building on Agent
  1's "whatShouldHappen" (the high-level desired outcome) but now naming
  the actual code-level change direction.
- High-level direction only — describe the idea, do NOT write code or a
  diff, and do NOT claim one approach is definitively "the" fix.
- Each approach should be a single sentence.

Example:
"Have getEmbeddingDimension() throw a descriptive error instead of
returning undefined when the probe fails, so callers can't silently treat
a failed probe as a 1536-dimension embedder."

notes:
- Optional. Anything worth flagging that doesn't fit cleanly above — e.g.
  "no linked PR was found," "comments contained conflicting claims," or
  ambiguity worth surfacing. Empty string if nothing to add.

SCOPE BOUNDARY:

You MAY:
- identify the specific file(s) and function(s)/symbols involved
- briefly explain the code-level mechanism behind the issue
- describe 2-4 possible solving approaches at a high level

You MUST NOT:
- write replacement code or diffs
- modify code
- run tests
- create a PR
- pick and commit to a single "correct" fix
- call more than one of {pull_request_read, get_file_contents} per run
- read more than one linked PR or more than one source file

STOP after returning the JSON.
`,

      mcpServers: [
        {
          name: "github",
          enableTools: ["issue_read", "pull_request_read", "get_file_contents"],
          // preload=true + explicit preloadTools avoids per-call tool
          // discovery round-trips, which otherwise burn extra requests
          // against the same per-minute rate limit as the real tool
          // calls.
          preload: true,
          preloadTools: [
            "issue_read",
            "pull_request_read",
            "get_file_contents",
          ],
        },
        // No deepwiki server here on purpose — Agent 1
        // (oss-understanding-agent) already calls read_wiki_structure
        // and supplies architecture-level context via whereInTheProject /
        // backgroundContext. Re-querying DeepWiki here would be redundant
        // and would reintroduce the 6-request 429 problem this pipeline
        // hit before this agent was split from Agent 1.
      ],

      config: {
        askUserQuestions: {
          enabled: false,
        },

        dynamicSubAgents: {
          enabled: false,
        },

        generativeUi: {
          enabled: false,
        },

        // True worst case: issue_read get(1) + issue_read get_comments(1)
        // + ONE escalation call (pull_request_read OR get_file_contents)
        // (1) + final JSON(1) = 4 turns. iterationLimit gives a 1-turn
        // margin above that true worst case. This is also a HARD stop:
        // even if the model tries to call both escalation tools despite
        // instructions, the runtime cuts it off before a 6th request.
        iterationLimit: 5,

        sandbox: {
          enabled: false,
        },
      },

      responseFormat: {
        type: "text",
      },
    },
  });

  console.log("Agent created successfully:");
  console.log(agent);
}

/**
 * Response parsing
 */

export interface LinkedPullRequest {
  number: number;
  title: string;
  state: string;
  filesChanged: string[];
}

export interface FileToEdit {
  path: string;
  reason: string;
}

export interface RootCauseLocation {
  primaryFile: string;
  functionsOrSymbols: string[];
}

export interface DeepContextResult {
  repository: string;
  issueNumber: number;
  rootCauseLocation: RootCauseLocation;
  codeLevelExplanation: string;
  linkedPullRequests: LinkedPullRequest[];
  filesADeveloperWouldEdit: FileToEdit[];
  approaches: string[];
  notes: string;
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;

      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function parseDeepContextResponse(
  raw: string,
): DeepContextResult | null {
  const candidate = extractFirstJsonObject(raw);

  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as DeepContextResult;
  } catch {
    return null;
  }
}

/**
 * Builds the "CONTEXT FROM AGENT 1" block this agent expects, from
 * oss-understanding-agent's raw output shape.
 */
export interface UnderstandingResult {
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

export function buildAgent1ContextBlock(
  understanding: UnderstandingResult,
): string {
  return `${understanding.repository}#${understanding.issueNumber}

CONTEXT FROM AGENT 1:
${JSON.stringify(
  {
    whatIsTheIssue: understanding.whatIsTheIssue,
    whatIsHappeningNow: understanding.whatIsHappeningNow,
    whatShouldHappen: understanding.whatShouldHappen,
    whyItMatters: understanding.whyItMatters,
    whoWhatIsAffected: understanding.whoWhatIsAffected,
    whereInTheProject: understanding.whereInTheProject,
    technicalConcepts: understanding.technicalConcepts,
    backgroundContext: understanding.backgroundContext,
  },
  null,
  2,
)}`;
}

/**
 * Retry helper — same rolling-window rationale as the sibling agents.
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 65_000; // > 60s rolling window

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const message = err instanceof Error ? err.message : String(err);

      const is429 =
        message.includes("429") ||
        message.includes("Too Many Requests") ||
        message.includes("request_quota_exceeded");

      if (!is429 || attempt === maxRetries) {
        throw err;
      }

      const delay = baseDelayMs + Math.floor(Math.random() * 5_000);

      console.warn(
        `429 from model provider. Waiting ${Math.round(
          delay / 1000,
        )}s before retry ${attempt + 1}/${maxRetries}...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

createAgent().catch(console.error);
