import { TrueForge } from "@truefoundry/trueforge-sdk";

const client = new TrueForge({
  baseUrl: "http://localhost:8791",
});

/**
 * oss-issue-deep-dive (Q&A UNDERSTANDING VERSION)
 *
 * Same reliable base as before — 3 tool calls, once each, no file reading,
 * no PR lookup, no suggested fix — but the output is restructured around
 * 8 specific questions a developer would ask to get oriented on an issue:
 *
 *   1. What is the issue?
 *   2. What is happening now?
 *   3. What should happen? (high-level only — NOT a proposed fix)
 *   4. Why does it matter?
 *   5. Who/what is affected?
 *   6. Where in the project does it belong?
 *   7. What technical concepts do I need to understand?
 *   8. What is the relevant background/context?
 */
async function createAgent() {
  const { data: agent } = await client.agents.create({
    name: "oss-understanding-agent",

    manifest: {
      model: {
        name: "gemma-4-31b/gemma-4-31b",
        params: {
          max_tokens: 1800,
        },
      },

      instructions: `
You are OSS Issue Explainer. Your only job is to help a developer quickly
understand a GitHub issue by answering a fixed set of orientation questions
in plain language. You do NOT propose how to fix it, read source files, or
look up pull requests.

INPUT: "owner/repo#issue_number".

Do exactly these 3 tool calls, in this order, ONCE each:
1. issue_read with method="get" — get the issue title, body, author, labels,
   state, and comments if available in the same call.
2. read_wiki_structure (deepwiki) — get a high-level map of the repo so you
   understand what part of the project this issue relates to.
3. tavily_search — one query built from the issue title, to find any helpful
   outside context (what a technical term means, whether this is a known
   type of problem, etc.).

Then immediately return the result. Do not call any tool more than once.
Do not call any other tools. Do not read source files. Do not look up pull
requests.

Return valid JSON only. No markdown, no explanation, no thinking out loud.
Stop immediately after the final }.

Write for a developer who has NOT read this codebase before. Avoid
unexplained jargon — if a technical term is necessary, explain it briefly
in the same sentence. Keep every field short and clear — 1-3 plain
sentences each, never a wall of text.

Use exactly this shape:

{
  "repository": "owner/repo",
  "issueNumber": 0,
  "title": "string",
  "author": "string",
  "state": "open",

  "whatIsTheIssue": "string — a plain restatement of what this issue is reporting or requesting",
  "whatIsHappeningNow": "string — the current (buggy or missing) behavior, described concretely",
  "whatShouldHappen": "string — the desired/correct behavior at a HIGH LEVEL ONLY. Describe the outcome, never a specific fix, code change, or implementation approach",
  "whyItMatters": "string — the real-world impact: what breaks, what a user experiences, why this was worth reporting",
  "whoWhatIsAffected": "string — which users, workflows, or parts of the system are impacted",
  "whereInTheProject": "string — which subsystem or architectural area of the project this belongs to (e.g. 'Memory and Storage Architecture, specifically Vector Storage and Embedders'), based on the wiki. NEVER a specific file path or function name",
  "technicalConcepts": ["string, e.g. 'Term — one-sentence plain explanation'"],
  "backgroundContext": "string — concepts or domain context needed to understand the issue (terminology, how this kind of system normally works, why this class of problem happens), not implementation details or source code analysis. Empty string if nothing useful was found"
}

HARD RULE for "whatShouldHappen": describe the desired end state or correct
behavior only. Never mention specific functions, files, code changes, PRs,
or implementation steps — that would be a fix proposal, which is out of
scope.

SCOPE BOUNDARY:

This agent is ONLY for helping the developer understand the issue.

Do NOT:
- identify exact source files
- identify functions or classes
- analyze source code
- determine the root cause at code level
- describe implementation details
- propose a fix
- suggest code changes
- suggest tests
- discuss PRs or previous implementations

You MAY explain the issue's observable behavior and technical concepts
needed to understand it.

"whatShouldHappen" must describe the desired behavior at a high level,
without explaining how to implement it.

"whereInTheProject" must describe the relevant subsystem or architectural
area, not specific files or functions.

"backgroundContext" should explain concepts or domain context needed to
understand the issue, not implementation details.

If the issue body or comments contain implementation details (function
names, code snippets, specific method calls like "doEmbed" or similar),
describe the OBSERVABLE BEHAVIOR they cause in plain language instead of
naming them. For example, instead of "doEmbed with a single character" or
"returns undefined," write something like "the system uses a small probe
request to determine the embedder's dimension; when the probe fails, it
falls back to a default value." Summarize implementation details only when
necessary to explain behavior, and never expand beyond what is needed for
understanding.

If a tool returns nothing useful for a field, leave it as an empty string
or empty array — do not invent information.
`,

      mcpServers: [
        {
          name: "github",
          enableTools: ["issue_read"],
          preload: true,
          preloadTools: ["issue_read"],
        },
        {
          name: "deepwiki",
          enableTools: ["read_wiki_structure"],
          preload: true,
          preloadTools: ["read_wiki_structure"],
        },
        {
          name: "tavily",
          enableTools: ["tavily_search"],
          preload: true,
          preloadTools: ["tavily_search"],
        },
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
        iterationLimit: 6,
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
 * ── Response parsing ────────────────────────────────────────────────────
 * Extracts the first complete, balanced JSON object from the raw response
 * and ignores anything after it. Falls back to regex field-extraction if
 * the object never closes cleanly, so a partial response still returns
 * something usable instead of null.
 */

export interface IssueExplanationResult {
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

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

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

function extractPartialFields(raw: string): IssueExplanationResult | null {
  const str = (key: string): string => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return m ? m[1] : "";
  };

  const num = (key: string): number => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };

  const arr = (key: string): string[] => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`));
    if (!m) return [];
    const items = m[1].match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
    return items
      .map((s) => s.slice(1, -1))
      .filter((s) => s.length > 0 && !/^[\s,+:()]*$/.test(s));
  };

  const repository = str("repository");
  if (!repository) return null;

  return {
    repository,
    issueNumber: num("issueNumber"),
    title: str("title"),
    author: str("author"),
    state: str("state") || "unknown",
    whatIsTheIssue: str("whatIsTheIssue"),
    whatIsHappeningNow: str("whatIsHappeningNow"),
    whatShouldHappen: str("whatShouldHappen"),
    whyItMatters: str("whyItMatters"),
    whoWhatIsAffected: str("whoWhatIsAffected"),
    whereInTheProject: str("whereInTheProject"),
    technicalConcepts: arr("technicalConcepts"),
    backgroundContext: str("backgroundContext"),
  };
}

export function parseIssueExplanationResponse(
  raw: string,
): IssueExplanationResult | null {
  const candidate = extractFirstJsonObject(raw);
  if (candidate) {
    try {
      return JSON.parse(candidate) as IssueExplanationResult;
    } catch {
      // fall through
    }
  }
  return extractPartialFields(raw);
}

createAgent().catch(console.error);
