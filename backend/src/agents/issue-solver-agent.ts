import { TrueForge } from "@truefoundry/trueforge-sdk";

const client = new TrueForge({
  baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8791",
});

/**
 * Issue Solver Agent — Agent 3
 *
 * Pipeline position: consumes Agent 1's (oss-understanding-agent) plain-
 * language issue summary AND Agent 2's (issue-deep-context-agent) grounded
 * rootCauseLocation / approaches / linkedPullRequests, then actually
 * implements one approach and validates it — in a real sandbox, against
 * the real repo, with real test output. Nothing here is imagined.
 *
 * ARCHITECTURE NOTE — "subagent" here means: your own Kanban-pipeline
 * orchestration code opens a session against THIS saved agent (same
 * pattern as Agent 1 -> Agent 2), scoped to one issue's session_id. It
 * does NOT rely on TrueForge's `dynamic_sub_agents` auto-fan-out feature.
 * The actual "root agent" (reviews the patch, does its own final sandbox
 * check, builds branch name / commit message / PR title+description, and
 * is the only one allowed to call ask_user_question) is a SEPARATE saved
 * agent you drive after this one returns — not defined in this file.
 *
 * WHY CHECKPOINTED MULTI-TURN, NOT ONE LONG TURN:
 * You're on Cerebras. BOTH gemma-4-31b and gpt-oss-120b are capped at
 * 5 requests/minute on your account (confirmed from your Cerebras
 * dashboard: "Requests — minute: 5, day: 2,400" on both models). That
 * cap is per-model, tracked by Cerebras itself — it does not move no
 * matter which model you point this agent at, and it does not care how
 * efficient your prompt is. A single long turn that clones, reads,
 * edits, and tests will make 10-20+ model calls back-to-back and 429
 * within the first minute, every time — which is exactly what happened
 * in testing (every failed run died at ~5-6 calls, regardless of model).
 *
 * The fix: this agent does a SMALL bounded amount of work per turn (at
 * most 2 agent-loop iterations — see `iterationLimit` below), then MUST
 * stop and report a checkpoint. Your orchestration code re-invokes the
 * SAME session repeatedly, spaced out in time, until the agent reports
 * "done" or "blocked". This works because TrueForge sandboxes persist
 * across turns within a session (cloned repo, edits, everything stays on
 * disk between calls) — see runSolverToCompletion() at the bottom of
 * this file for the driver loop and its pacing math.
 *
 * WHY NO GITHUB MCP:
 * This agent works entirely inside the sandbox: it `git clone`s the
 * (public) repo directly over HTTPS and reads/edits/tests files with the
 * sandbox's own shell + file tools, rather than spending additional
 * model-call budget on GitHub MCP round-trips. If you ever point this at
 * a PRIVATE repo, uncomment the `mcpServers` block below and clone with
 * an authenticated URL instead — do not put tokens in shell history.
 *
 * It does NOT:
 * - git push, open a PR, or merge anything
 * - touch the real GitHub issue/PR (no comments, no labels)
 * - ask the user anything (that's the root agent's job, per your spec)
 * - attempt more than ONE approach at a time, or more than 2 fix-retest
 *   cycles after the first attempt
 * - run a full monorepo test suite when a targeted test file/package is
 *   identifiable from Agent 2's context
 * - do more than ~2 model-driven steps in a single turn, regardless of
 *   how much work is left — see CHECKPOINT PROTOCOL in the instructions
 */

// Cerebras account-level constraint (see dashboard: Limits -> Requests).
// Both gemma-4-31b and gpt-oss-120b are capped here — this is NOT a
// per-model thing, so swapping model.name will not change these numbers.
const CEREBRAS_REQUESTS_PER_MINUTE = 5;
const CEREBRAS_REQUESTS_PER_DAY = 2400;

// Hard per-turn stop: at most this many agent-loop iterations (~model
// calls) before the harness cuts the turn off, regardless of whether the
// model tried to keep going. Kept low and deliberate, not just a safety
// backstop like in a single-shot agent — this IS the pacing mechanism.
const ITERATION_LIMIT_PER_TURN = 2;

async function createAgent() {
  const { data: agent } = await client.agents.create({
    name: "issue-solver-agent",

    manifest: {
      model: {
        // Cerebras. Confirmed 5 requests/min, 2,400/day on this model on
        // your account — same as gemma-4-31b. Do not "fix" 429s here by
        // swapping to gemma or another Cerebras model; the cap follows
        // you. The checkpoint protocol below is the actual fix.
        name: "gpt-oss-120b/gpt-oss-120b",
        params: {
          // Kept modest since most turns only need to emit a small
          // checkpoint envelope, not the full final result. The one
          // turn that emits the full SolverResult (with diffs) may run
          // closer to this ceiling — that's fine, it's a single call.
          max_tokens: 2048,
          temperature: 0.1,
        },
      },

      instructions: `
You are the Issue Solver Agent.

Your job: implement ONE concrete fix for a real GitHub issue, inside your
sandbox, against the real repository, and validate it with the repo's own
tests. You are not writing a hypothetical diff — you are cloning the repo,
editing real files, and running real commands.

You do this ACROSS MANY SMALL TURNS, not one long one. Your sandbox and
files persist between turns in this same session, so you are always
picking up exactly where you left off. Do not try to rush the whole job
into one turn — the harness will cut you off after a couple of steps
anyway, and trying to cram everything in produces a truncated, broken
response instead of a clean checkpoint.

INPUT FORMAT (first turn only):

owner/repo#issue_number

CONTEXT FROM AGENT 1:
{ ...plain-language issue understanding... }

CONTEXT FROM AGENT 2:
{ ...rootCauseLocation, codeLevelExplanation, linkedPullRequests,
   filesADeveloperWouldEdit, approaches, notes... }

On later turns, you will just receive a short "Continue." message. Your
own prior checkpoint output (visible earlier in this session) plus the
actual state of the sandbox (files on disk, git status, etc.) is your
memory of where you are. Re-check real sandbox state when unsure — do not
trust your own prior checkpoint text over what's actually on disk if they
ever seem to disagree.

Trust Agent 1 for WHAT/WHY and Agent 2 for WHERE (files/functions) and
the candidate approaches. Your job is the HOW: actually making one of
Agent 2's approaches real, in code, and proving it works (or reporting
precisely why it doesn't).

CHECKPOINT PROTOCOL — READ THIS BEFORE DOING ANYTHING:

- Each turn, do AT MOST ONE meaningful unit of work (one shell command,
  one file read, one file edit, one test run). Two is an absolute ceiling
  and only when the second is a trivial, obviously-safe follow-up to the
  first (e.g. cd into a dir you just cloned).
- After that unit of work, IMMEDIATELY stop and emit your checkpoint JSON
  (see OUTPUT below). Do not chain a third action. Do not "just quickly
  also check X" — that's next turn's job.
- Never redo something the sandbox already shows is done. Before acting,
  check real state (e.g. \`ls\`, \`git status\`) if you're not certain
  whether the repo is already cloned, a file already edited, etc. — don't
  rely purely on remembering your last checkpoint text.
- This budget exists because of a real, fixed 5-requests-per-minute cap
  on the model you're running on. Every extra action you try to squeeze
  into one turn is not free — it's what causes hard failures.

SANDBOX EXECUTION PLAN — PHASES, EACH SPREAD ACROSS AS MANY TURNS AS IT
TAKES (do not treat this list as "the steps of one turn"; each numbered
phase below typically takes several turns given the one-action-per-turn
rule):

0. SHELL SANITY
   - Do not assume bash exists at any particular path. Sandbox base
     images frequently only ship a POSIX \`sh\` (dash/ash/busybox), not
     bash. Write commands in POSIX-sh-compatible syntax.
   - If a command fails specifically because the shell interpreter
     itself couldn't be found/exec'd (not because of a missing tool like
     git), you get ONE adaptation attempt on your NEXT turn. If that also
     fails on the same shell-not-found class of error, stop trying
     variations — report status "blocked" with validationStatus
     "unable_to_validate" and the exact error in notes.

1. CLONE
   - Shallow-clone the repo: git clone --depth 1 https://github.com/<owner>/<repo>.git,
     then cd into it. This alone is a fine amount of work for one turn.
   - Never run a recursive listing (e.g. \`ls -R\`) from the container
     root or any directory above the cloned repo — that walks the whole
     sandbox filesystem for zero benefit and wastes an entire turn's
     budget on noise. Scope all listing/search commands to inside the
     cloned repo directory.
   - Create a local working branch (do NOT push it), on its own turn if
     needed: fix/issue-<number>-solver-attempt

2. CONFIRM GROUND TRUTH
   - Open Agent 2's rootCauseLocation.primaryFile ONCE, in a single read
     covering the full file (or the full relevant range) — not a partial
     read now and a "read more" next turn just to see more of the SAME
     file. Plan the read size up front so one read is enough.
   - Code moves between when Agent 2 ran and now. If the file, function,
     or line has clearly changed shape, say so in your final "notes" and
     adapt — do not silently pretend it still matches.
   - Read at most 2 additional files from filesADeveloperWouldEdit if you
     genuinely need more context. Do not go on an exploratory tour.

3. CHOOSE ONE APPROACH
   - Pick exactly one entry from Agent 2's "approaches" array — prefer
     the smallest, most targeted change that fixes the actual mechanism
     in codeLevelExplanation, not the most sweeping one. This can happen
     as pure reasoning in your checkpoint notes, no tool call needed.
   - If none of Agent 2's approaches is actually implementable as
     written, you may adapt it minimally, but record the deviation.

4. INSTALL DEPENDENCIES — SCOPED, NOT REPO-WIDE
   - If this is a monorepo (pnpm/yarn/npm workspaces), install and test
     only the affected package/workspace, not the whole repo.
   - This can be one chained shell command (one turn).

5. IMPLEMENT THE FIX
   - Make the minimal code edit(s) for the chosen approach.
   - Do not refactor unrelated code, rename things, or "clean up" nearby
     code. Do not add speculative config flags or commented-out code.

6. VALIDATE — TARGETED FIRST
   - Run the most specific test command available (a colocated test file
     tied to the changed code, if identifiable). Fall back to a
     package-level or full-workspace run only if nothing more targeted
     exists and it's clearly this repo's convention.
   - Capture the real command and its real output.

7. FIX-RETRY BUDGET — HARD CONSTRAINT
   - If targeted tests fail, at most 2 additional fix-and-retest cycles
     (3 test runs total). Each retry must be a genuine diagnosis from
     actual failure output, not a guess.
   - If you exhaust the retry budget still failing, stop — report
     "failed" honestly, don't keep trying.

8. OPTIONAL LIGHT VALIDATION
   - A fast scoped typecheck/lint once, only if cheap and unambiguous.

9. CAPTURE THE DIFF — DO NOT PUSH
   - git diff (and git status) against your working branch.
   - Do NOT git push, open a PR, or touch GitHub in any writable way.
     Your output is the diff plus validation evidence; a separate root
     agent decides branch naming, commit message, PR title/description,
     and whether to actually push.

TOOL DISCIPLINE:
- Prefer one chained shell command over several single-purpose ones when
  it still fits inside a single turn's action budget.
- Once you've read a file's full content, you have every symbol and
  reference in it. Never issue a separate "locate X" call for something
  already visible in a file you've already read.
- Never repeat a successful setup step (don't re-clone, don't re-install
  once already done), and never issue two searches for the same
  symbol/definition back to back, whether in the same turn or across
  turns.
- Never run a large monorepo's full test suite speculatively.
- Stop the whole run (status "done") as soon as you have a validated (or
  honestly failed) result — don't keep polishing a passing fix across
  more turns than needed.

OUTPUT — EVERY TURN, NO EXCEPTIONS:

Return valid JSON only. No markdown, no explanations outside JSON, no
thinking, no code fences.

Use exactly this envelope on every turn:

{
  "status": "in_progress",
  "phase": "string — short machine-ish label for where you are, e.g. cloning / reading / choosing_approach / installing / implementing / testing / retrying / light_validation / capturing_diff / finalizing",
  "progressNotes": "string — 1-3 sentences: what you just did this turn, and what you'll do next turn",
  "result": null
}

Set "status" to "in_progress" for every turn except your last. On your
LAST turn — once you've validated (or definitively failed/blocked) —
set "status" to "done" (successfully reached a validated or honestly
failed/partial conclusion) or "blocked" (couldn't get to a runnable
state at all, e.g. shell/install failure), and populate "result" with
the full result object:

"result": {
  "repository": "owner/repo",
  "issueNumber": 0,
  "approachTaken": "string",
  "approachDeviationNotes": "string",
  "groundTruthMismatch": "string",
  "filesModified": [
    { "path": "string", "diff": "string", "summary": "string" }
  ],
  "testResults": {
    "command": "string",
    "attempts": 0,
    "passed": false,
    "testsRun": 0,
    "testsPassed": 0,
    "testsFailed": 0,
    "output": "string"
  },
  "typecheckOrLint": {
    "ran": false,
    "command": "string",
    "passed": false,
    "output": "string"
  },
  "validationStatus": "passed",
  "suggestedBranchName": "string",
  "notes": "string"
}

FIELD RULES FOR "result" (only relevant once status is "done"/"blocked"):

repository / issueNumber: as given in the input.

approachTaken: the single approach you actually implemented, referencing
which of Agent 2's approaches it corresponds to (or noting it was
adapted).

approachDeviationNotes: empty string if implemented as-written; otherwise
exactly what you changed and why.

groundTruthMismatch: empty string if the code matched Agent 2's
rootCauseLocation; otherwise what had actually changed and how you
adapted.

filesModified: every file you actually edited. "diff" is the real
unified diff (from git diff), not a reconstruction. Empty array only if
you made no edit at all (explain why in notes).

testResults: "command" is your LAST test attempt's exact command.
"attempts" is 1-3 per the retry budget. "passed" reflects only the final
attempt. testsRun/testsPassed/testsFailed are best-effort real counts —
use 0 rather than fabricate. "output" is the relevant tail of real
output, trimmed to roughly 2000 characters.

typecheckOrLint: "ran": false with defaults elsewhere if skipped.

validationStatus: one of "passed" (targeted tests green), "failed"
(retry budget exhausted, still red), "partially_validated" (e.g. tests
passed but typecheck failed), "unable_to_validate" (never reached a
runnable state) — explain in notes either way.

suggestedBranchName: kebab-case, references the issue number. Advisory
only — the root agent decides the real branch name.

notes: anything the root agent needs that doesn't fit above.

SCOPE BOUNDARY:

You MAY:
- clone the repo and create a local (unpushed) branch
- read and edit files needed for the chosen approach
- install dependencies scoped to the affected package/workspace
- run tests, typecheck, or lint to validate the change
- report a failed or partial result honestly

You MUST NOT:
- git push, create a PR, comment on the issue/PR, or touch GitHub in any
  writable way
- ask the user any question
- implement more than one approach, or exceed the fix-retry budget
- run a full monorepo test suite when a targeted alternative exists
- refactor, rename, or edit code unrelated to the chosen approach
- report validationStatus "passed" unless the final test attempt you
  actually ran was green
- do more than ~2 actions in a single turn, no matter how close to done
  you feel — checkpoint instead

STOP after returning the JSON, every turn.
`,

      // No mcpServers block — this agent works entirely inside the
      // sandbox against a public git clone. Uncomment and configure only
      // for private repos (do not put tokens in shell history):
      //
      // mcpServers: [
      //   {
      //     name: "github",
      //     enableTools: ["get_file_contents"],
      //     preload: true,
      //     preloadTools: ["get_file_contents"],
      //   },
      // ],

      config: {
        sandbox: {
          enabled: true,
          fileDownloads: false,
        },

        askUserQuestions: {
          // Only the root agent pauses for user input, per your spec.
          enabled: false,
        },

        dynamicSubAgents: {
          enabled: false,
        },

        generativeUi: {
          enabled: false,
        },

        // This is the actual pacing mechanism, not just a runaway-loop
        // backstop. See CEREBRAS_REQUESTS_PER_MINUTE / the header comment
        // and runSolverToCompletion()'s pacing math below.
        iterationLimit: ITERATION_LIMIT_PER_TURN,
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

export interface ModifiedFile {
  path: string;
  diff: string;
  summary: string;
}

export interface TestResults {
  command: string;
  attempts: number;
  passed: boolean;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  output: string;
}

export interface TypecheckOrLint {
  ran: boolean;
  command: string;
  passed: boolean;
  output: string;
}

export type ValidationStatus =
  | "passed"
  | "failed"
  | "partially_validated"
  | "unable_to_validate";

export interface SolverResult {
  repository: string;
  issueNumber: number;
  approachTaken: string;
  approachDeviationNotes: string;
  groundTruthMismatch: string;
  filesModified: ModifiedFile[];
  testResults: TestResults;
  typecheckOrLint: TypecheckOrLint;
  validationStatus: ValidationStatus;
  suggestedBranchName: string;
  notes: string;
}

export type TurnStatus = "in_progress" | "done" | "blocked";

export interface SolverTurnEnvelope {
  status: TurnStatus;
  phase: string;
  progressNotes: string;
  result: SolverResult | null;
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

export function parseSolverTurnEnvelope(
  raw: string,
): SolverTurnEnvelope | null {
  const candidate = extractFirstJsonObject(raw);

  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as SolverTurnEnvelope;
  } catch {
    return null;
  }
}

/**
 * Builds the input block this agent expects on its FIRST turn only, from
 * Agent 1's and Agent 2's raw output shapes. Subsequent turns just send
 * a short "Continue." message (see runSolverToCompletion below).
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

export interface DeepContextResult {
  repository: string;
  issueNumber: number;
  rootCauseLocation: {
    primaryFile: string;
    functionsOrSymbols: string[];
  };
  codeLevelExplanation: string;
  linkedPullRequests: Array<{
    number: number;
    title: string;
    state: string;
    filesChanged: string[];
  }>;
  filesADeveloperWouldEdit: Array<{ path: string; reason: string }>;
  approaches: string[];
  notes: string;
}

export function buildSolverContextBlock(
  understanding: UnderstandingResult,
  deepContext: DeepContextResult,
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
)}

CONTEXT FROM AGENT 2:
${JSON.stringify(
  {
    rootCauseLocation: deepContext.rootCauseLocation,
    codeLevelExplanation: deepContext.codeLevelExplanation,
    linkedPullRequests: deepContext.linkedPullRequests,
    filesADeveloperWouldEdit: deepContext.filesADeveloperWouldEdit,
    approaches: deepContext.approaches,
    notes: deepContext.notes,
  },
  null,
  2,
)}`;
}

/**
 * Retry helper — same rolling-window rationale as the sibling agents.
 * Used by runSolverToCompletion below as a fallback if a single turn
 * still 429s despite the pacing (e.g. Agents 1/2 or another process
 * happen to be using the same Cerebras account concurrently).
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 65_000;

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

/**
 * Pacing: worst case, one turn burns ITERATION_LIMIT_PER_TURN requests
 * back-to-back (no delay between iterations within a single turn — the
 * harness runs those as fast as it can). To stay under Cerebras's
 * 5 req/min cap, turns must be spaced so that
 * (ITERATION_LIMIT_PER_TURN requests) / (interval) <= (5 requests / 60s).
 * i.e. interval >= ITERATION_LIMIT_PER_TURN * 60000 / 5. We add real
 * margin on top since Cerebras's window isn't necessarily a clean
 * rolling 60s and other agents/processes may share the same account.
 */
const MIN_TURN_INTERVAL_MS =
  Math.ceil(
    (ITERATION_LIMIT_PER_TURN * 60_000) / CEREBRAS_REQUESTS_PER_MINUTE,
  ) + 6_000; // e.g. 2 * 60000 / 5 = 24000, +6000 margin = 30000ms

const MAX_TURNS = 40; // safety cap independent of wall clock
const MAX_WALL_CLOCK_MS = 20 * 60 * 1000; // 20 minutes, safety cap

/**
 * NOTE ON STREAM EVENT PARSING:
 * The exact shape of events from `sessions.createTurnStream(...)` isn't
 * fully documented beyond `event.type` in the SDK docs available at
 * write time. The accumulator below takes a permissive, best-effort
 * approach (checking a few plausible text-bearing fields) and is the one
 * part of this file you should sanity-check against a real run —
 * uncomment the `console.log(JSON.stringify(event))` line below on your
 * first live call, inspect the actual shape, and tighten
 * `extractTextFromEvent` if needed. Everything else in this driver
 * (pacing, checkpoint loop, envelope parsing) does not depend on getting
 * this exactly right on the first try.
 */
function extractTextFromEvent(event: any): string {
  if (typeof event?.text === "string") return event.text;
  if (typeof event?.content === "string") return event.content;
  if (typeof event?.data?.text === "string") return event.data.text;
  if (typeof event?.data?.content === "string") return event.data.content;
  if (typeof event?.delta?.text === "string") return event.delta.text;
  return "";
}

export interface SolverRunOutcome {
  finalEnvelope: SolverTurnEnvelope | null;
  turnsUsed: number;
  timedOut: boolean;
}

/**
 * Drives the full Solver run to completion (or timeout) by sending an
 * initial context-laden turn, then repeated "Continue." turns paced far
 * enough apart to stay under Cerebras's 5 req/min cap, parsing each
 * turn's checkpoint envelope until status is "done" or "blocked".
 */
export async function runSolverToCompletion(
  understanding: UnderstandingResult,
  deepContext: DeepContextResult,
): Promise<SolverRunOutcome> {
  const { data: session } = await client.sessions.create({
    agent: { name: "issue-solver-agent" },
  });

  let turnsUsed = 0;
  let lastEnvelope: SolverTurnEnvelope | null = null;
  const startedAt = Date.now();

  let nextInput = buildSolverContextBlock(understanding, deepContext);

  while (turnsUsed < MAX_TURNS) {
    if (Date.now() - startedAt > MAX_WALL_CLOCK_MS) {
      return { finalEnvelope: lastEnvelope, turnsUsed, timedOut: true };
    }

    const raw = await withAgentRetry(async () => {
      const stream = await client.sessions.createTurnStream(session.id, {
        input: [{ type: "user.message", content: nextInput }],
      });

      let buffer = "";
      for await (const { data: event } of stream.withMetadata()) {
        // Uncomment on your first live run to confirm the real shape:
        // console.log(JSON.stringify(event));
        buffer += extractTextFromEvent(event);
      }
      return buffer;
    });

    turnsUsed++;

    const envelope = parseSolverTurnEnvelope(raw);
    lastEnvelope = envelope;

    if (!envelope) {
      console.warn(
        `Turn ${turnsUsed}: could not parse a checkpoint envelope from the response. Raw output logged below — check extractTextFromEvent against your actual stream shape.`,
      );
      console.warn(raw);
      // Try one more "Continue." rather than aborting outright — a
      // single malformed turn shouldn't kill the whole run.
      nextInput = "Continue.";
    } else if (envelope.status === "done" || envelope.status === "blocked") {
      return { finalEnvelope: envelope, turnsUsed, timedOut: false };
    } else {
      nextInput = "Continue.";
    }

    await new Promise((resolve) => setTimeout(resolve, MIN_TURN_INTERVAL_MS));
  }

  return { finalEnvelope: lastEnvelope, turnsUsed, timedOut: false };
}

createAgent().catch(console.error);
