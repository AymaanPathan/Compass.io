import { useEffect, useRef } from "react";
import { StepTrace } from "./AgentStepTrace";
import type {
  IssueResolutionPhase,
  IssueResolutionRunStatus,
  SolverStatus,
} from "../store/issueResolutionSlice";
import type { AuthUrl, PendingQuestion, StepNode } from "../utils/agentStream";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface Props {
  issueUrl: string | null;
  phase: IssueResolutionPhase;
  status: IssueResolutionRunStatus;
  steps: StepNode[];
  streamingText: string;
  deepDiveReport: string | null;
  solverReport: string | null;
  solverStatus: SolverStatus;
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
  /**
   * Resets the whole resolution run back to idle (dispatches
   * resetIssueResolution) so the user can pick a fresh issue and go again.
   * Only meaningful once there's something to reset — i.e. phase !== "idle".
   */
  onStartOver: () => void;
}

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
  const traceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    traceRef.current?.scrollTo({
      top: traceRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [steps, pendingQuestion]);

  const isIdle = phase === "idle";
  const isBusy = status === "connecting" || status === "running";
  const report =
    phase === "done"
      ? solverReport
      : phase === "awaiting_approval"
        ? deepDiveReport
        : null;

  return (
    <div className="flex h-[calc(100vh-48px)] w-full flex-col bg-[#14120B] text-[#EDECEC]">
      <StatusBar
        phase={phase}
        status={status}
        cached={cached}
        issueUrl={issueUrl}
        solverStatus={solverStatus}
        onStartOver={onStartOver}
      />

      <div className="flex min-h-0 flex-1">
        <section className="flex w-full max-w-[380px] shrink-0 flex-col border-r border-white/[0.08]">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <p
              className="text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/50"
              style={{ fontFamily: MONO }}
            >
              Agent trace
            </p>
            <span className="text-[10px] uppercase tracking-wide text-[#EDECEC]/35">
              {phase === "implementing" || phase === "done"
                ? "Phase B · Solver"
                : "Phase A · Deep dive"}
            </span>
          </div>
          <div ref={traceRef} className="flex-1 overflow-y-auto px-4 py-4">
            {isIdle && (
              <p className="text-[13px] leading-relaxed text-[#EDECEC]/45">
                {issueUrl
                  ? `Run the agent to investigate ${issueUrl}.`
                  : "Pick an issue from the previous step first."}
              </p>
            )}
            {!isIdle && steps.length === 0 && (
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

        <section className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="w-full flex-1 px-10 py-8 sm:px-14">
            {isIdle && <IdleHero issueUrl={issueUrl} onStart={onStart} />}
            {isBusy && !report && (
              <StreamingReport phase={phase} text={streamingText} />
            )}
            {phase === "awaiting_approval" && report && (
              <ReportView
                title="Deep Dive report"
                report={report}
                footer={
                  declined ? (
                    <p className="text-[12.5px] text-[#EDECEC]/50">
                      Understood — you'll take it from here.
                    </p>
                  ) : (
                    <ApprovalGate onApprove={onApprove} onDecline={onDecline} />
                  )
                }
              />
            )}
            {phase === "done" && report && (
              <ReportView
                title="Solver result"
                report={report}
                footer={<StartOverRow onStartOver={onStartOver} />}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusBar({
  phase,
  status,
  cached,
  issueUrl,
  solverStatus,
  onStartOver,
}: {
  phase: IssueResolutionPhase;
  status: IssueResolutionRunStatus;
  cached: boolean;
  issueUrl: string | null;
  solverStatus: SolverStatus;
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
  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        <p className="text-[12.5px] text-[#EDECEC]/75">
          Issue resolution agent
        </p>
        {issueUrl && (
          <span
            className="max-w-[240px] truncate text-[11.5px] text-[#EDECEC]/40"
            style={{ fontFamily: MONO }}
          >
            {issueUrl}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[11.5px] text-[#EDECEC]/50">
          <span
            className={`h-1.5 w-1.5 rounded-full ${phase === "done" ? "bg-[#D39237]" : "bg-[#D39237]/70"}`}
          />
          {label[status]}
        </span>
        {solverStatus && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              solverStatus === "IMPLEMENTED"
                ? "bg-emerald-500/15 text-emerald-400"
                : solverStatus === "BLOCKED"
                  ? "bg-red-500/15 text-red-400"
                  : "bg-[#D39237]/15 text-[#D39237]"
            }`}
          >
            {solverStatus.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {cached && (
          <span className="text-[11px] text-[#EDECEC]/40">Cached</span>
        )}
        {phase !== "idle" && (
          <button
            onClick={onStartOver}
            className="rounded-md border border-white/[0.12] px-3 py-1.5 text-[12px] text-[#EDECEC]/75 hover:bg-white/[0.05]"
          >
            Start again
          </button>
        )}
      </div>
    </div>
  );
}

function StartOverRow({ onStartOver }: { onStartOver: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        onClick={onStartOver}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#D39237] px-3 py-1.5 text-[12px] font-semibold text-[#14120B] hover:bg-[#D39237]/90"
      >
        Resolve another issue
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
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

function IdleHero({
  issueUrl,
  onStart,
}: {
  issueUrl: string | null;
  onStart: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-200px)] max-w-2xl flex-col items-start justify-center">
      <p className="text-[11.5px] text-[#EDECEC]/50">Step 4 · Resolve</p>
      <h1 className="mt-3 text-[26px] font-medium leading-snug text-[#EDECEC]">
        Investigate this issue
      </h1>
      <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-[#EDECEC]/60">
        The agent will clone the repo into a sandbox, trace the real execution
        path, and hand you a Deep Dive report. It will not touch the repository
        until you approve implementation.
      </p>
      <button
        onClick={onStart}
        disabled={!issueUrl}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-[#D39237] px-4 py-2 text-[13px] font-semibold text-[#14120B] transition-colors hover:bg-[#D39237]/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start investigation
      </button>
    </div>
  );
}

function StreamingReport({
  phase,
  text,
}: {
  phase: IssueResolutionPhase;
  text: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-[11.5px] text-[#EDECEC]/50">
        {phase === "implementing" ? "Implementing" : "Investigating"}
      </p>
      <h2 className="mt-2.5 text-[20px] font-medium text-[#EDECEC]/95">
        {phase === "implementing"
          ? "Writing and verifying the fix"
          : "Tracing the execution path in the sandbox"}
      </h2>
      <div
        className="mt-6 whitespace-pre-wrap rounded-md border border-white/[0.08] p-5 text-[13px] leading-relaxed text-[#EDECEC]/70"
        style={{ fontFamily: MONO }}
      >
        {text || "…"}
      </div>
    </div>
  );
}

function ReportView({
  title,
  report,
  footer,
}: {
  title: string;
  report: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-[11.5px] text-[#EDECEC]/50">{title}</p>
      <article className="whitespace-pre-wrap rounded-md border border-white/[0.08] p-6 text-[13.5px] leading-relaxed text-[#EDECEC]/85">
        {report}
      </article>
      {footer}
    </div>
  );
}

function ApprovalGate({
  onApprove,
  onDecline,
}: {
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="rounded-md border border-[#D39237]/30 bg-[#D39237]/[0.04] p-4">
      <p className="text-[13px] font-medium text-[#EDECEC]/95">
        Investigation is complete. Would you like me to implement the fix?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onApprove}
          className="rounded-md bg-[#D39237] px-3 py-1.5 text-[12px] font-semibold text-[#14120B] hover:bg-[#D39237]/90"
        >
          Implement the fix
        </button>
        <button
          onClick={onDecline}
          className="rounded-md border border-white/[0.12] px-3 py-1.5 text-[12px] text-[#EDECEC]/75 hover:bg-white/[0.05]"
        >
          Stop here, I'll implement it myself
        </button>
      </div>
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
  return (
    <div className="mt-5 rounded-md border border-[#D39237]/30 bg-[#D39237]/[0.04] p-4">
      <p className="text-[13px] font-medium text-[#EDECEC]/95">
        {question.question}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {question.options.map((opt) => (
          <button
            key={opt}
            onClick={() => onAnswer(opt)}
            className="rounded-full border border-white/[0.14] px-3 py-1.5 text-[12px] text-[#EDECEC]/75 hover:border-white/[0.3]"
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
    <div className="mt-5 rounded-md border border-white/[0.08] p-4">
      <p className="text-[13px] font-medium text-[#EDECEC]/95">
        Connect GitHub to continue
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
        {error ?? "Something went wrong."}
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