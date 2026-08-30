/* eslint-disable react-hooks/set-state-in-effect */
// client/src/components/IssueResolutionStage.tsx
//
// Full-page live trace. No pipeline rail, no split panes.
//
//   idle            → centered hero, "Start investigation"
//   investigating   → fullscreen live trace (full width, bright text)
//   awaiting_approval → trace stays up, floating "Deep Dive report ready"
//                       pill → fullscreen modal (report + approve/decline)
//   implementing    → fullscreen live trace again
//   done            → floating "Solver report ready" pill → fullscreen
//                       modal (SolverTabs, full width/height)
//
// Props contract is unchanged — drops in without touching Redux or routes.

import { useEffect, useMemo, useRef, useState } from "react";
import AgentActivityFeed, { isSandboxTool } from "./AgentActivityFeed";
import MarkdownReport from "./MarkdownReport";
import SolverTabs from "./SolverTabs";
import { parseSolverReport } from "../utils/parseSolverReport";
import type {
  IssueResolutionPhase,
  IssueResolutionRunStatus,
  SolverStatus,
} from "../store/issueResolutionSlice";
import type { AuthUrl, PendingQuestion, StepNode } from "../utils/agentStream";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";
const ACCENT = "#D39237";

interface Props {
  issueUrl: string | null;
  phase: IssueResolutionPhase;
  status: IssueResolutionRunStatus;
  steps: StepNode[];
  streamingText: string;
  deepDiveReport: string | null;
  solverReport: string | null;
  solverStatus: SolverStatus;
  solverDiff: string | null;
  authUrls: AuthUrl[];
  pendingQuestion: PendingQuestion | null;
  error: string | null;
  declined: boolean;
  cached: boolean;
  onStart: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onAnswer: (answer: string) => void;
  onResume: () => void;
  onStartOver: () => void;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function useStageTimer(active: boolean) {
  const startRef = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      return;
    }
    if (startRef.current == null) {
      startRef.current = Date.now();
      setSeconds(0);
    }
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - (startRef.current as number)) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

interface RunStats {
  commands: number;
  tools: number;
  agents: number;
}

function computeStats(steps: StepNode[]): RunStats {
  let commands = 0;
  let tools = 0;
  let agents = 0;

  for (const step of steps) {
    if (step.kind === "tool_call") {
      tools += 1;
      if (isSandboxTool(step.name)) commands += 1;
    } else if (step.kind === "thread") {
      agents += 1;
      const nested = computeStats(step.steps);
      commands += nested.commands;
      tools += nested.tools;
      agents += nested.agents;
    }
  }

  return { commands, tools, agents };
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function IssueResolutionStage({
  issueUrl,
  phase,
  status,
  steps,
  streamingText,
  deepDiveReport,
  solverReport,
  solverStatus,
  authUrls,
  pendingQuestion,
  error,
  declined,
  cached,
  onStart,
  onApprove,
  onDecline,
  onAnswer,
  onResume,
  onStartOver,
}: Props) {
  const isIdle = phase === "idle";
  const isBusy = status === "connecting" || status === "running";
  const seconds = useStageTimer(isBusy);
  const stats = useMemo(() => computeStats(steps), [steps]);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [solverModalOpen, setSolverModalOpen] = useState(false);

  const prevPhase = useRef<IssueResolutionPhase>(phase);

  // Auto-surface a report the moment it becomes available.
  useEffect(() => {
    if (
      prevPhase.current !== "awaiting_approval" &&
      phase === "awaiting_approval" &&
      deepDiveReport
    ) {
      setReportModalOpen(true);
    }
    if (prevPhase.current !== "done" && phase === "done" && solverReport) {
      setSolverModalOpen(true);
    }
    if (phase === "investigating" || phase === "implementing") {
      setReportModalOpen(false);
      setSolverModalOpen(false);
    }
    prevPhase.current = phase;
  }, [phase, deepDiveReport, solverReport]);

  const traceLabel =
    phase === "implementing" || phase === "done" ? "Solver" : "Deep Dive";

  return (
    <div className="relative flex h-[calc(100vh-48px)] w-full flex-col overflow-hidden bg-[#0B0A06] text-white">
      <TopBar
        issueUrl={issueUrl}
        status={status}
        phase={phase}
        solverStatus={solverStatus}
        cached={cached}
        seconds={seconds}
        isBusy={isBusy}
        onStartOver={onStartOver}
      />

      <div className="relative min-h-0 flex-1">
        {isIdle ? (
          <IdleHero issueUrl={issueUrl} onStart={onStart} />
        ) : (
          <LiveTrace
            steps={steps}
            streamingText={streamingText}
            phase={phase}
            stats={stats}
            isBusy={isBusy}
            label={traceLabel}
          />
        )}

        {/* Floating overlay stack: questions / auth / failures / report CTAs */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-6 pb-6">
          <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-3">
            {status === "question_required" && pendingQuestion && (
              <QuestionCard question={pendingQuestion} onAnswer={onAnswer} />
            )}
            {status === "auth_required" && (
              <AuthCard authUrls={authUrls} onResume={onResume} />
            )}
            {status === "failed" && (
              <FailedCard error={error} onRetry={onStart} />
            )}
            {phase === "awaiting_approval" &&
              deepDiveReport &&
              !reportModalOpen && (
                <ReportPill
                  label={
                    declined
                      ? "Deep Dive report"
                      : "Deep Dive report ready — action needed"
                  }
                  sub={
                    declined
                      ? "You chose to implement it yourself."
                      : `${stats.commands} sandbox command${stats.commands === 1 ? "" : "s"} run`
                  }
                  pulse={!declined}
                  onOpen={() => setReportModalOpen(true)}
                />
              )}
            {phase === "done" && solverReport && !solverModalOpen && (
              <ReportPill
                label="Solver report ready"
                sub={solverStatus ? solverStatus.replace(/_/g, " ") : "View results"}
                pulse
                badgeStatus={solverStatus}
                onOpen={() => setSolverModalOpen(true)}
              />
            )}
          </div>
        </div>
      </div>

      {reportModalOpen && deepDiveReport && (
        <FullScreenModal
          eyebrow={issueUrl}
          title="Deep Dive Report"
          onClose={() => setReportModalOpen(false)}
          footer={
            phase === "awaiting_approval" && !declined ? (
              <ApprovalFooter
                stats={stats}
                onApprove={() => {
                  setReportModalOpen(false);
                  onApprove();
                }}
                onDecline={() => {
                  onDecline();
                }}
              />
            ) : declined ? (
              <div className="flex items-center justify-center px-8 py-4 text-[12.5px] text-white/50">
                You'll take it from here — the repository hasn't been touched.
              </div>
            ) : null
          }
        >
          <div className="mx-auto w-full max-w-3xl px-10 py-10">
            <MarkdownReport content={deepDiveReport} />
          </div>
        </FullScreenModal>
      )}

      {solverModalOpen && solverReport && (
        <FullScreenModal
          eyebrow={issueUrl}
          title="Solver Result"
          badgeStatus={solverStatus}
          onClose={() => setSolverModalOpen(false)}
          footer={
            <div className="flex items-center justify-end px-8 py-4">
              <button
                onClick={() => {
                  setSolverModalOpen(false);
                  onStartOver();
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12.5px] font-semibold text-[#14120B] transition-colors"
                style={{ backgroundColor: ACCENT }}
              >
                Resolve another issue
                <ArrowIcon />
              </button>
            </div>
          }
        >
          <div className="mx-auto w-full max-w-5xl px-10 py-10">
            {deepDiveReport && <DeepDiveRecap report={deepDiveReport} />}
            <SolverTabs parsed={parseSolverReport(solverReport)} />
          </div>
        </FullScreenModal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({
  issueUrl,
  status,
  phase,
  solverStatus,
  cached,
  seconds,
  isBusy,
  onStartOver,
}: {
  issueUrl: string | null;
  status: IssueResolutionRunStatus;
  phase: IssueResolutionPhase;
  solverStatus: SolverStatus;
  cached: boolean;
  seconds: number;
  isBusy: boolean;
  onStartOver: () => void;
}) {
  const label: Record<IssueResolutionRunStatus, string> = {
    idle: "Idle",
    connecting: "Connecting",
    running: phase === "implementing" ? "Implementing" : "Investigating",
    auth_required: "Waiting for authorization",
    question_required: "Waiting for your answer",
    failed: "Failed",
    succeeded:
      phase === "awaiting_approval" ? "Awaiting your approval" : "Complete",
    cancelled: "Cancelled",
  };

  const dotColor =
    status === "failed"
      ? "bg-red-400"
      : status === "cancelled"
        ? "bg-white/30"
        : isBusy
          ? "bg-[#D39237] animate-pulse"
          : "bg-emerald-500/80";

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <p className="shrink-0 text-[13px] font-medium text-white/90">
          Issue resolution agent
        </p>
        {issueUrl && (
          <span
            className="max-w-[340px] truncate rounded border border-white/[0.08] px-2 py-0.5 text-[11px] text-white/50"
            style={{ fontFamily: MONO }}
          >
            {issueUrl}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-white/60">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          {label[status]}
        </span>
        {isBusy && (
          <span
            className="shrink-0 text-[11px] text-white/40"
            style={{ fontFamily: MONO }}
          >
            {formatDuration(seconds)}
          </span>
        )}
        {solverStatus && <SolverBadge status={solverStatus} />}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {cached && <span className="text-[11px] text-white/40">Cached</span>}
        {phase !== "idle" && (
          <button
            onClick={onStartOver}
            className="rounded-md border border-white/[0.14] px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/[0.06]"
          >
            Start again
          </button>
        )}
      </div>
    </div>
  );
}

function SolverBadge({ status }: { status: NonNullable<SolverStatus> }) {
  const styles: Record<string, string> = {
    IMPLEMENTED: "bg-emerald-500/15 text-emerald-400",
    BLOCKED: "bg-red-500/15 text-red-400",
    PARTIALLY_IMPLEMENTED: "bg-[#D39237]/15 text-[#F3B368]",
    NO_CHANGE_REQUIRED: "bg-white/[0.1] text-white/70",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status] ?? styles.PARTIALLY_IMPLEMENTED}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Live trace — full width, no side gutters, bright text
// ---------------------------------------------------------------------------

function LiveTrace({
  steps,
  streamingText,
  phase,
  stats,
  isBusy,
  label,
}: {
  steps: StepNode[];
  streamingText: string;
  phase: IssueResolutionPhase;
  stats: RunStats;
  isBusy: boolean;
  label: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [steps, streamingText]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-8 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isBusy ? "bg-[#D39237] animate-pulse" : "bg-emerald-500/70"}`}
          />
          <p
            className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70"
            style={{ fontFamily: MONO }}
          >
            Live trace · {label}
          </p>
        </div>
        <div
          className="flex items-center gap-4 text-[11px] text-white/45"
          style={{ fontFamily: MONO }}
        >
          {stats.commands > 0 && <span>{stats.commands} cmd</span>}
          {stats.tools > 0 && <span>{stats.tools} calls</span>}
          {stats.agents > 0 && (
            <span>
              {stats.agents} sub-agent{stats.agents > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* No max-width cap — the trace fills the page. Just breathing-room
          padding on the sides. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="w-full px-8 py-6">
          {steps.length === 0 ? (
            <TraceSkeleton />
          ) : (
            <AgentActivityFeed steps={steps} />
          )}

          {(phase === "investigating" || phase === "implementing") &&
            streamingText && (
              <div
                className="mt-4 whitespace-pre-wrap rounded-lg border border-white/[0.1] bg-white/[0.03] p-5 text-[13px] leading-relaxed text-white/85"
                style={{ fontFamily: MONO }}
              >
                {streamingText}
                <span className="ml-0.5 inline-block h-[12px] w-[6px] translate-y-[2px] animate-pulse bg-white/60 align-middle" />
              </div>
            )}

          {/* Breathing room so the floating overlay never covers the tail */}
          <div className="h-24" />
        </div>
      </div>
    </div>
  );
}

function TraceSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-16 animate-pulse rounded-lg bg-white/[0.06]" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.06]" />
      <p className="mt-1 text-[11.5px] text-white/35">
        Starting the sandbox — the first commands can take a few seconds to
        show up.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idle hero
// ---------------------------------------------------------------------------

function IdleHero({
  issueUrl,
  onStart,
}: {
  issueUrl: string | null;
  onStart: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-2xl px-6 text-center">
        <p className="text-[11.5px] text-white/50">Step 4 · Resolve</p>
        <h1 className="mt-3 text-[28px] font-medium leading-snug text-white">
          Investigate this issue
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-white/65">
          The agent clones the repo into a sandbox, traces the real execution
          path, and hands you a Deep Dive report. It will not touch the
          repository until you approve implementation.
        </p>
        <button
          onClick={onStart}
          disabled={!issueUrl}
          className="mt-6 inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[13px] font-semibold text-[#14120B] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: ACCENT }}
        >
          Start investigation
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating "report ready" pill
// ---------------------------------------------------------------------------

function ReportPill({
  label,
  sub,
  onOpen,
  pulse,
  badgeStatus,
}: {
  label: string;
  sub?: string;
  onOpen: () => void;
  pulse?: boolean;
  badgeStatus?: SolverStatus;
}) {
  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl border p-4 text-left shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: `${ACCENT}66`,
        backgroundColor: "#14120Bf5",
      }}
    >
      <span
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ backgroundColor: `${ACCENT}28` }}
      >
        <DocIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-white">{label}</p>
        {sub && <p className="mt-0.5 text-[11.5px] text-white/55">{sub}</p>}
      </div>
      {badgeStatus && <SolverBadge status={badgeStatus} />}
      <span
        className="ml-1 shrink-0 rounded-md px-3 py-1.5 text-[12px] font-semibold text-[#14120B] transition-colors group-hover:brightness-95"
        style={{ backgroundColor: ACCENT }}
      >
        View
      </span>
    </button>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 2h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"
        stroke={ACCENT}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M9 2v3h3" stroke={ACCENT} strokeWidth="1.3" strokeLinejoin="round" />
      <path
        d="M5.5 8.5h5M5.5 10.5h5M5.5 6.5h2.5"
        stroke={ACCENT}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"
        stroke="#14120B"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Fullscreen modal shell
// ---------------------------------------------------------------------------

function FullScreenModal({
  title,
  eyebrow,
  badgeStatus,
  onClose,
  footer,
  children,
}: {
  title: string;
  eyebrow?: string | null;
  badgeStatus?: SolverStatus;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B0A06]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[16px] font-semibold text-white">{title}</h2>
            {badgeStatus && <SolverBadge status={badgeStatus} />}
          </div>
          {eyebrow && (
            <p
              className="mt-0.5 truncate text-[11px] text-white/45"
              style={{ fontFamily: MONO }}
            >
              {eyebrow}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/[0.08] hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 2l10 10M12 2 2 12"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      {footer && (
        <div className="shrink-0 border-t border-white/[0.08] bg-[#0B0A06]">
          {footer}
        </div>
      )}
    </div>
  );
}

function ApprovalFooter({
  stats,
  onApprove,
  onDecline,
}: {
  stats: RunStats;
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-2 py-4">
      <p className="text-[11.5px] text-white/50">
        Ran {stats.commands} sandbox command{stats.commands === 1 ? "" : "s"}
        {stats.agents > 0
          ? ` across ${stats.agents} sub-agent${stats.agents > 1 ? "s" : ""}`
          : ""}
        . Nothing in the repository has changed yet.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onDecline}
          className="rounded-md border border-white/[0.14] px-3.5 py-2 text-[12.5px] text-white/80 hover:bg-white/[0.06]"
        >
          Stop here, I'll implement it myself
        </button>
        <button
          onClick={onApprove}
          className="rounded-md px-3.5 py-2 text-[12.5px] font-semibold text-[#14120B] hover:brightness-95"
          style={{ backgroundColor: ACCENT }}
        >
          Implement the fix
        </button>
      </div>
    </div>
  );
}

function DeepDiveRecap({ report }: { report: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-white/[0.1]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.05]"
      >
        <span className="flex items-center gap-2 text-[12.5px] text-white/75">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] text-emerald-400">
            ✓
          </span>
          Deep Dive investigation
        </span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          className={`text-white/55 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="border-t border-white/[0.1] p-5">
          <MarkdownReport content={report} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating cards: question / auth / failure
// ---------------------------------------------------------------------------

function QuestionCard({
  question,
  onAnswer,
}: {
  question: PendingQuestion;
  onAnswer: (answer: string) => void;
}) {
  return (
    <div
      className="rounded-xl border p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md"
      style={{ borderColor: `${ACCENT}66`, backgroundColor: "#14120Bf5" }}
    >
      <p className="text-[13px] font-medium text-white">{question.question}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {question.options.map((opt) => (
          <button
            key={opt}
            onClick={() => onAnswer(opt)}
            className="rounded-full border border-white/[0.18] px-3 py-1.5 text-[12px] text-white/85 hover:border-white/[0.35]"
          >
            {opt}
          </button>
        ))}
      </div>
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
    <div
      className="rounded-xl border border-white/[0.1] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md"
      style={{ backgroundColor: "#14120Bf5" }}
    >
      <p className="text-[13px] font-medium text-white">
        Connect GitHub to continue
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {authUrls.map((a) => (
          <a
            key={a.id}
            href={a.authUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-[#14120B] hover:brightness-95"
            style={{ backgroundColor: ACCENT }}
          >
            Continue with {a.name}
          </a>
        ))}
        <button
          onClick={onResume}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.14] px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/[0.06]"
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
    <div
      className="rounded-xl border border-red-500/30 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md"
      style={{ backgroundColor: "#14120Bf5" }}
    >
      <p className="text-[13px] font-medium text-white">
        The agent couldn't finish this run
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-white/60">
        {error ?? "Something went wrong."}
      </p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-[#14120B] hover:brightness-95"
        style={{ backgroundColor: ACCENT }}
      >
        Retry
      </button>
    </div>
  );
}