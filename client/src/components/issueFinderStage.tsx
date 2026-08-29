/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import type {
  MatchedIssue,
  IssueFinderRunStatus,
  SelectedRepository,
} from "../store/issueFinderSlice";
import type { AuthUrl, PendingQuestion, StepNode } from "../utils/agentStream";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface IssueFinderStageProps {
  selectedRepository: SelectedRepository | null;
  status: IssueFinderRunStatus;
  issues: MatchedIssue[] | null;
  steps: StepNode[];
  authUrls: AuthUrl[];
  pendingQuestion: PendingQuestion | null;
  qaHistory: { question: string; answer: string }[];
  error: string | null;
  cached: boolean;
  onStart: () => void;
  onAnswer: (answer: string) => void;
  onResume: () => void;
  onResolve: (issue: MatchedIssue) => void;
}

export default function IssueFinderStage({
  selectedRepository,
  status,
  issues,
  steps,
  authUrls,
  pendingQuestion,
  qaHistory,
  error,
  cached,
  onStart,
  onAnswer,
  onResume,
  onResolve,
}: IssueFinderStageProps) {
  const traceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    traceRef.current?.scrollTo({
      top: traceRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [steps, pendingQuestion]);

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
      <StatusBar
        status={status}
        cached={cached}
        repository={selectedRepository}
      />

      <div className="flex min-h-0 flex-1">
        {/* Left — reasoning + question interaction */}
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
                {selectedRepository
                  ? `Run the agent to find open issues in ${selectedRepository.name} that fit you.`
                  : "Pick a repository first, then run the agent to find open issues."}
              </p>
            )}

            {!isIdle && qaHistory.length > 0 && (
              <QaHistoryList entries={qaHistory} />
            )}

            {!isIdle && steps.length === 0 && qaHistory.length === 0 && (
              <div className="flex flex-col gap-2.5">
                <div className="h-2.5 w-2/3 rounded bg-white/[0.06]" />
                <div className="h-2.5 w-1/3 rounded bg-white/[0.06]" />
              </div>
            )}

            {steps.length > 0 && <StepTrace steps={steps} />}

            {status === "question_required" && pendingQuestion && (
              <QuestionCard question={pendingQuestion} onAnswer={onAnswer} />
            )}
            {status === "auth_required" && (
              <AuthCard authUrls={authUrls} onResume={onResume} />
            )}
            {status === "failed" && (
              <FailedCard error={error} onRetry={onStart} />
            )}
          </div>
        </section>

        {/* Right — matched issues */}
        <section className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="w-full flex-1 px-10 py-8 sm:px-14">
            {isIdle && (
              <IdleHero repository={selectedRepository} onStart={onStart} />
            )}
            {isBusy && <SearchingState status={status} />}
            {isDone && issues && (
              <IssueResults
                issues={issues}
                onRegenerate={onStart}
                onResolve={onResolve}
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
  repository,
}: {
  status: IssueFinderRunStatus;
  cached: boolean;
  repository: SelectedRepository | null;
}) {
  const map: Record<IssueFinderRunStatus, { label: string; live: boolean }> = {
    idle: { label: "Idle", live: false },
    connecting: { label: "Connecting", live: true },
    running: { label: "Running", live: true },
    auth_required: { label: "Waiting for authorization", live: true },
    question_required: { label: "Waiting for your answer", live: true },
    failed: { label: "Failed", live: false },
    succeeded: { label: "Complete", live: false },
    cancelled: {
      label: "",
      live: false
    }
  };
  const s = map[status];

  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        <p className="text-[12.5px] text-[#EDECEC]/75">Issue finder agent</p>
        {repository && (
          <span
            className="text-[11.5px] text-[#EDECEC]/40"
            style={{ fontFamily: MONO }}
          >
            {repository.name}
          </span>
        )}
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

function IdleHero({
  repository,
  onStart,
}: {
  repository: SelectedRepository | null;
  onStart: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-200px)] max-w-2xl flex-col items-start justify-center">
      <p className="text-[11.5px] text-[#EDECEC]/50">Step 3 · Issues</p>
      <h1 className="mt-3 text-[26px] font-medium leading-snug text-[#EDECEC]">
        Find an issue worth picking up
      </h1>
      <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-[#EDECEC]/60">
        The agent will ask a few quick questions about what you want to work on,
        then search{" "}
        <span style={{ fontFamily: MONO }} className="text-[#EDECEC]/80">
          {repository?.name ?? "the selected repo"}
        </span>{" "}
        for real, currently open issues that match.
      </p>
      <button
        onClick={onStart}
        disabled={!repository}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-[#D39237] px-4 py-2 text-[13px] font-semibold text-[#14120B] transition-colors hover:bg-[#D39237]/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Find issues
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
      {!repository && (
        <p className="mt-2 text-[11.5px] text-[#EDECEC]/40">
          Select a repository above first.
        </p>
      )}
    </div>
  );
}

function SearchingState({ status }: { status: IssueFinderRunStatus }) {
  const heading =
    status === "question_required"
      ? "Answer the question on the left to continue"
      : "Matching issues to your answers";

  return (
    <div className="max-w-3xl">
      <p className="text-[11.5px] text-[#EDECEC]/50">Searching</p>
      <h2 className="mt-2.5 text-[20px] font-medium text-[#EDECEC]/95">
        {heading}
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
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Question interaction                                                     */
/* -------------------------------------------------------------------------- */

function QaHistoryList({
  entries,
}: {
  entries: { question: string; answer: string }[];
}) {
  return (
    <div className="mb-3 space-y-2 border-b border-white/[0.06] pb-3">
      {entries.map((qa, i) => (
        <div key={i} className="text-[12px] leading-relaxed">
          <p className="text-[#EDECEC]/45">{qa.question}</p>
          <p className="mt-0.5 text-[#EDECEC]/85">{qa.answer}</p>
        </div>
      ))}
    </div>
  );
}

function QuestionCard({
  question,
  onAnswer,
}: {
  question: PendingQuestion;
  onAnswer: (answer: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (opt: string) => {
    setSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  };

  const submit = () => {
    if (selected.length === 0) return;
    onAnswer(selected.join(", "));
    setSelected([]);
  };

  return (
    <div className="mt-5 rounded-md border border-[#D39237]/30 bg-[#D39237]/[0.04] p-4">
      <p className="text-[13px] font-medium text-[#EDECEC]/95">
        {question.question}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {question.options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                active
                  ? "border-[#D39237] bg-[#D39237] text-[#14120B] font-semibold"
                  : "border-white/[0.14] text-[#EDECEC]/75 hover:border-white/[0.3]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <button
        onClick={submit}
        disabled={selected.length === 0}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#D39237] px-3 py-1.5 text-[12px] font-semibold text-[#14120B] hover:bg-[#D39237]/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continue
      </button>
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
        Read-only OAuth grant — the agent can't read issues without it.
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
        {error ?? "Something went wrong while searching for issues."}
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
/*  Step trace — identical renderer to RecommendationsStage                  */
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

function IssueResults({
  issues,
  onRegenerate,
  onResolve,
}: {
  issues: MatchedIssue[];
  onRegenerate: () => void;
  onResolve: (issue: MatchedIssue) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11.5px] text-[#EDECEC]/50">Matched issues</p>
          <p className="mt-1 text-[13px] text-[#EDECEC]/40">
            {issues.length} issues, ranked by fit to your answers.
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
        {issues.map((issue, i) => (
          <IssueCard
            key={issue.url}
            issue={issue}
            rank={i + 1}
            onResolve={onResolve}
          />
        ))}
      </div>
    </div>
  );
}

function IssueCard({
  issue,
  rank,
  onResolve,
}: {
  issue: MatchedIssue;
  rank: number;
  onResolve: (issue: MatchedIssue) => void;
}) {
  return (
    <div className="group relative flex flex-col rounded-md border border-white/[0.08] p-6 transition-colors hover:border-white/[0.18]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10.5px] text-[#EDECEC]/50">
            {rank}
          </span>
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[14px] font-medium text-[#EDECEC] hover:text-[#D39237] hover:underline"
          >
            #{issue.number} {issue.title}
          </a>
        </div>
        <span className="shrink-0 rounded-full bg-[#D39237]/15 px-2 py-0.5 text-[10px] font-medium text-[#D39237]">
          {issue.status}
        </span>
      </div>

      {issue.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {issue.labels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[10.5px] text-[#EDECEC]/50"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-[#EDECEC]/45">
        {issue.difficultySignal}
      </p>

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[12px] leading-relaxed text-[#EDECEC]/60">
        {issue.whyItMatches}
      </p>

      <button
        onClick={() => onResolve(issue)}
        className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-md border border-[#D39237]/40 px-3 py-1.5 text-[12px] font-medium text-[#D39237] transition-colors hover:bg-[#D39237]/10"
      >
        Resolve with agent
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
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
  );
}