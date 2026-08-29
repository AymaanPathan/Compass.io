/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type {
  MatchedRepository,
  AgentRunStatus,
} from "../store/recommendationsSlice";
import type { AuthUrl, StepNode } from "../utils/agentStream";
import type { AppDispatch } from "../store/store";
import {
  addToKanban,
  fetchKanbanItems,
  selectKanban,
  selectKanbanUrls,
  KANBAN_COLUMNS,
  type KanbanStatus,
} from "../store/repoKanbanSlice";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface RecommendationsStageProps {
  status: AgentRunStatus;
  repos: MatchedRepository[] | null;
  steps: StepNode[];
  authUrls: AuthUrl[];
  error: string | null;
  cached: boolean;
  onStart: () => void;
  onResume: () => void;
  /**
   * Called when the user picks a repo to find issues in. The parent page
   * (Sessions.tsx) owns what happens next — flipping a local step, not a
   * route change — so this component stays agnostic of routing/Redux for
   * that action.
   */
  onFindIssues: (repo: MatchedRepository) => void;
}

export default function RecommendationsStage({
  status,
  repos,
  steps,
  authUrls,
  error,
  cached,
  onStart,
  onResume,
  onFindIssues,
}: RecommendationsStageProps) {
  const traceRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    traceRef.current?.scrollTo({
      top: traceRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [steps]);

  // Needed so RepoCard can tell if a repo is already on the board.
  useEffect(() => {
    dispatch(fetchKanbanItems());
  }, [dispatch]);

  const isIdle = status === "idle";
  const isBusy =
    status === "connecting" ||
    status === "running" ||
    status === "auth_required" ||
    status === "question_required" ||
    status === "failed";
  const isDone = status === "succeeded";

  return (
    <div className="flex h-[calc(100vh-48px)] w-full flex-col bg-[#14120B] text-[#EDECEC]">
      <StatusBar status={status} cached={cached} />

      <div className="flex min-h-0 flex-1">
        {/* Left — reasoning */}
        <section className="flex w-full max-w-[380px] shrink-0 flex-col border-r border-white/[0.08]">
          <div className="border-b border-white/[0.08] px-4 py-3">
            <p
              className="text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/50"
              style={{ fontFamily: MONO }}
            >
              Reasoning
            </p>
          </div>
          <div ref={traceRef} className="flex-1 overflow-y-auto px-4 py-4">
            {isIdle && (
              <p className="text-[13px] leading-relaxed text-[#EDECEC]/45">
                Run the agent to see it search GitHub for repos that fit your
                profile.
              </p>
            )}

            {!isIdle && steps.length === 0 && (
              <div className="flex flex-col gap-2.5">
                <div className="h-2.5 w-2/3 rounded bg-white/[0.06]" />
                <div className="h-2.5 w-1/3 rounded bg-white/[0.06]" />
              </div>
            )}

            {steps.length > 0 && <StepTrace steps={steps} />}

            {status === "auth_required" && (
              <AuthCard authUrls={authUrls} onResume={onResume} />
            )}
            {status === "question_required" && <QuestionPendingCard />}
            {status === "failed" && (
              <FailedCard error={error} onRetry={onStart} />
            )}
          </div>
        </section>

        {/* Right — matched repos */}
        <section className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="w-full flex-1 px-10 py-8 sm:px-14">
            {isIdle && <IdleHero onStart={onStart} />}
            {isBusy && <SearchingState status={status} />}
            {isDone && repos && (
              <RepoResults
                repos={repos}
                onRegenerate={onStart}
                onFindIssues={onFindIssues}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StatusBar({
  status,
  cached,
}: {
  status: AgentRunStatus;
  cached: boolean;
}) {
  const map: Record<AgentRunStatus, { label: string; live: boolean }> = {
    idle: { label: "Idle", live: false },
    connecting: { label: "Connecting", live: true },
    running: { label: "Running", live: true },
    auth_required: { label: "Waiting for authorization", live: true },
    question_required: { label: "Waiting for your input", live: true },
    failed: { label: "Failed", live: false },
    succeeded: { label: "Complete", live: false },
  };
  const s = map[status];

  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        <p className="text-[12.5px] text-[#EDECEC]/75">
          Repo recommender agent
        </p>
        <span className="flex items-center gap-1.5 text-[11.5px] text-[#EDECEC]/50">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === "succeeded"
                ? "bg-[#D39237]"
                : s.live
                  ? "bg-[#D39237]/70"
                  : "bg-[#EDECEC]/25"
            }`}
          />
          {s.label}
        </span>
      </div>
      {status === "succeeded" && cached && (
        <span className="text-[11px] text-[#EDECEC]/40">Cached</span>
      )}
    </div>
  );
}

function IdleHero({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-[calc(100vh-200px)] max-w-2xl flex-col items-start justify-center">
      <p className="text-[11.5px] text-[#EDECEC]/50">Step 2 · Discovery</p>
      <h1 className="mt-3 text-[26px] font-medium leading-snug text-[#EDECEC]">
        Find repos worth contributing to
      </h1>
      <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-[#EDECEC]/60">
        The agent searches GitHub using your contribution areas and engineering
        patterns — not just your language — and only returns repos that
        currently have an open good-first-issue you can pick up right now.
      </p>
      <button
        onClick={onStart}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-[#D39237] px-4 py-2 text-[13px] font-semibold text-[#14120B] transition-colors hover:bg-[#D39237]/90"
      >
        Find matches
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"
            stroke="#14120B"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function SearchingState({ status }: { status: AgentRunStatus }) {
  return (
    <div className="max-w-3xl">
      <p className="text-[11.5px] text-[#EDECEC]/50">Searching</p>
      <h2 className="mt-2.5 text-[20px] font-medium text-[#EDECEC]/95">
        Matching repositories to your profile
      </h2>
      <div className="mt-8 space-y-2.5">
        <div className="h-2.5 w-full rounded bg-white/[0.05]" />
        <div className="h-2.5 w-5/6 rounded bg-white/[0.05]" />
        <div className="h-2.5 w-3/4 rounded bg-white/[0.05]" />
      </div>
      {status === "auth_required" && (
        <p className="mt-6 text-[12.5px] text-[#EDECEC]/50">
          Waiting on GitHub authorization — see the left panel to continue.
        </p>
      )}
      {status === "question_required" && (
        <p className="mt-6 text-[12.5px] text-[#EDECEC]/50">
          The agent has a question — see the left panel to continue.
        </p>
      )}
    </div>
  );
}

function AuthCard({
  authUrls,
  onResume,
}: {
  authUrls: AuthUrl[];
  onResume: () => void;
}) {
  return (
    <div className="mt-5 rounded-md border border-white/[0.08] p-4">
      <p className="text-[13px] font-medium text-[#EDECEC]/95">
        Connect GitHub to continue
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#EDECEC]/50">
        Read-only OAuth grant — the agent can't search repositories without it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {authUrls.map((a) => (
          <a
            key={a.id}
            href={a.authUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#D39237] px-3 py-1.5 text-[12px] font-semibold text-[#14120B] hover:bg-[#D39237]/90"
          >
            Continue with {a.name}
          </a>
        ))}
        <button
          onClick={onResume}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] px-3 py-1.5 text-[12px] text-[#EDECEC]/75 hover:bg-white/[0.05]"
        >
          I've authorized — resume
        </button>
      </div>
    </div>
  );
}

/**
 * Placeholder shown while the agent is paused on `question_required`.
 * The recommender flow doesn't currently render the question/answer UI
 * (that lives in the issue-finder flow) — this just tells the user
 * something is waiting on them so the panel doesn't look stuck.
 */
function QuestionPendingCard() {
  return (
    <div className="mt-5 rounded-md border border-white/[0.08] p-4">
      <p className="text-[13px] font-medium text-[#EDECEC]/95">
        The agent has a question
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#EDECEC]/50">
        Waiting on your answer before it can continue.
      </p>
    </div>
  );
}

function FailedCard({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="mt-5 rounded-md border border-white/[0.08] p-4">
      <p className="text-[13px] font-medium text-[#EDECEC]/95">
        The agent couldn't finish this run
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#EDECEC]/50">
        {error ?? "Something went wrong while searching for repositories."}
      </p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#D39237] px-3 py-1.5 text-[12px] font-semibold text-[#14120B] hover:bg-[#D39237]/90"
      >
        Retry
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step trace — same recursive renderer used in ProfileStage                */
/* -------------------------------------------------------------------------- */

function StepTrace({ steps }: { steps: StepNode[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <StepRow key={stepKey(step, i)} step={step} />
      ))}
    </div>
  );
}

function stepKey(step: StepNode, i: number) {
  if (step.kind === "reasoning") return `r-${step.id}`;
  if (step.kind === "tool_call") return `t-${step.id}`;
  return `th-${step.threadId}-${i}`;
}

function StepRow({ step }: { step: StepNode }) {
  if (step.kind === "reasoning") {
    return (
      <div className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0">
        <div className="flex items-center gap-1.5">
          <StatusDot done={step.done} />
          <span
            className="text-[10.5px] uppercase tracking-wide text-[#EDECEC]/45"
            style={{ fontFamily: MONO }}
          >
            Reasoning
          </span>
        </div>
        <p className="mt-1 pl-3 text-[12.5px] leading-relaxed text-[#EDECEC]/60">
          {truncate(step.content, 320) || "…"}
        </p>
      </div>
    );
  }

  if (step.kind === "tool_call") {
    return (
      <div className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0">
        <div className="flex items-center gap-1.5">
          <StatusDot done={step.status === "done"} />
          <span className="text-[12.5px] font-medium text-[#EDECEC]/90">
            {step.name}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-[#EDECEC]/40">
            {step.status === "done" ? "done" : "running"}
          </span>
        </div>
        {step.args !== undefined && step.args !== null && (
          <p
            className="mt-1 truncate pl-3 text-[11px] text-[#EDECEC]/40"
            style={{ fontFamily: MONO }}
          >
            {truncate(safeStringify(step.args), 140)}
          </p>
        )}
      </div>
    );
  }

  return <ThreadRow step={step} />;
}

function ThreadRow({ step }: { step: Extract<StepNode, { kind: "thread" }> }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <StatusDot done={step.done} />
        <span className="text-[10.5px] uppercase tracking-wide text-[#EDECEC]/50">
          Sub-agent
        </span>
        <span className="text-[12.5px] font-medium text-[#EDECEC]/95">
          {step.agentName}
        </span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 9 9"
          fill="none"
          className={`ml-auto shrink-0 text-[#EDECEC]/35 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path
            d="M2 1l4.5 3.5L2 8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 border-l border-white/[0.08] pl-3">
          {step.steps.length > 0 ? (
            <StepTrace steps={step.steps} />
          ) : (
            <p className="text-[11.5px] text-[#EDECEC]/30">Starting…</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ done }: { done: boolean }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-[#EDECEC]/35" : "bg-[#D39237]"}`}
    />
  );
}

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeStringify(value: unknown) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* -------------------------------------------------------------------------- */
/*  Results (right pane)                                                     */
/* -------------------------------------------------------------------------- */

function RepoResults({
  repos,
  onRegenerate,
  onFindIssues,
}: {
  repos: MatchedRepository[];
  onRegenerate: () => void;
  onFindIssues: (repo: MatchedRepository) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11.5px] text-[#EDECEC]/50">
            Matched repositories
          </p>
          <p className="mt-1 text-[13px] text-[#EDECEC]/40">
            {repos.length} repos, ranked by fit — each has an open
            good-first-issue right now.
          </p>
        </div>
        <button
          onClick={onRegenerate}
          className="rounded-md border border-white/[0.12] px-3 py-1.5 text-[12px] text-[#EDECEC]/75 hover:bg-white/[0.05]"
        >
          Regenerate
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {repos.map((repo, i) => (
          <RepoCard
            key={repo.url}
            repo={repo}
            rank={i + 1}
            onFindIssues={onFindIssues}
          />
        ))}
      </div>
    </div>
  );
}

function RepoCard({
  repo,
  rank,
  onFindIssues,
}: {
  repo: MatchedRepository;
  rank: number;
  onFindIssues: (repo: MatchedRepository) => void;
}) {
  return (
    <div className="group relative flex flex-col rounded-md border border-white/[0.08] p-6 transition-colors hover:border-white/[0.18]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10.5px] text-[#EDECEC]/50">
            {rank}
          </span>
          <a
            href={repo.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[14px] font-medium text-[#EDECEC] hover:text-[#D39237] hover:underline"
          >
            {repo.name}
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-[#D39237]/15 px-2 py-0.5 text-[10px] font-medium text-[#D39237]">
            good first issue
          </span>
          <RepoCardMenu repo={repo} />
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[#EDECEC]/60">
        {repo.description}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[10.5px] text-[#EDECEC]/50">
          {repo.repoType}
        </span>

        <button
          onClick={() => onFindIssues(repo)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#D39237]/15 px-2.5 py-1 text-[11.5px] font-medium text-[#D39237] transition-colors hover:bg-[#D39237]/25"
        >
          Find issues in {repo.name}
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"
              stroke="#D39237"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[12px] leading-relaxed text-[#EDECEC]/50">
        {repo.whyItMatches}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  3-dot menu — "Add to Kanban board" → column picker                       */
/* -------------------------------------------------------------------------- */

function RepoCardMenu({ repo }: { repo: MatchedRepository }) {
  const dispatch = useDispatch<AppDispatch>();
  const { addingUrl } = useSelector(selectKanban);
  const kanbanUrls = useSelector(selectKanbanUrls);

  const [open, setOpen] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [justAdded, setJustAdded] = useState<KanbanStatus | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOnBoard = kanbanUrls.has(repo.url);
  const isAdding = addingUrl === repo.url;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowColumns(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handlePickColumn = async (status: KanbanStatus) => {
    await dispatch(
      addToKanban({
        name: repo.name,
        url: repo.url,
        description: repo.description,
        repoType: repo.repoType,
        whyItMatches: repo.whyItMatches,
        status,
      }),
    );
    setJustAdded(status);
    setOpen(false);
    setShowColumns(false);
    setTimeout(() => setJustAdded(null), 2000);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setShowColumns(false);
        }}
        aria-label="Repo card options"
        className="flex h-6 w-6 items-center justify-center rounded-md text-[#EDECEC]/40 opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-[#EDECEC]/80 group-hover:opacity-100 data-[open=true]:opacity-100"
        data-open={open}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="3" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="13" r="1.4" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-30 w-56 overflow-hidden rounded-md border border-white/[0.1] bg-[#1B1911] shadow-xl">
          {!showColumns ? (
            <>
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 text-[12.5px] text-[#EDECEC]/80 hover:bg-white/[0.06]"
              >
                Open on GitHub
              </a>
              <button
                onClick={() => setShowColumns(true)}
                disabled={isAdding}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[12.5px] text-[#EDECEC]/80 hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span>
                  {isOnBoard ? "Move on Kanban board" : "Add to Kanban board"}
                </span>
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 9 9"
                  fill="none"
                  className="text-[#EDECEC]/35"
                >
                  <path
                    d="M2 1l4.5 3.5L2 8"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowColumns(false)}
                className="flex w-full items-center gap-1.5 border-b border-white/[0.08] px-3 py-2 text-left text-[11px] uppercase tracking-wide text-[#EDECEC]/45 hover:bg-white/[0.06]"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 9 9"
                  fill="none"
                  className="rotate-180"
                >
                  <path
                    d="M2 1l4.5 3.5L2 8"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Choose a column
              </button>
              {KANBAN_COLUMNS.map((col: any) => (
                <button
                  key={col.value}
                  onClick={() => handlePickColumn(col.value)}
                  disabled={isAdding}
                  className="flex w-full items-center px-3 py-2.5 text-left text-[12.5px] text-[#EDECEC]/80 hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {col.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {justAdded && (
        <span className="absolute right-0 top-7 z-30 whitespace-nowrap rounded-md border border-white/[0.1] bg-[#1B1911] px-3 py-1.5 text-[11px] text-[#D39237]">
          Added to{" "}
          {KANBAN_COLUMNS.find((c: any) => c.value === justAdded)?.label}
        </span>
      )}
    </div>
  );
}
