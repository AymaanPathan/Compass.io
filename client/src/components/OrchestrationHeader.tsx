import type { AgentRunStatus } from "../store/profileSlice";

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

export type SessionStage = "profile" | "repos";

interface StageNodeProps {
  label: string;
  agentName: string;
  status: AgentRunStatus;
  active: boolean;
  clickable: boolean;
  onClick?: () => void;
}

function nodeVisualState(status: AgentRunStatus, active: boolean) {
  if (status === "succeeded" && !active) return "complete";
  if (
    active &&
    (status === "running" ||
      status === "connecting" ||
      status === "auth_required")
  )
    return "live";
  if (active) return "current";
  if (status === "failed") return "failed";
  return "pending";
}

function StageNode({
  label,
  agentName,
  status,
  active,
  clickable,
  onClick,
}: StageNodeProps) {
  const state = nodeVisualState(status, active);

  const ring =
    state === "complete"
      ? "border-emerald-600 bg-emerald-900/40 text-emerald-400"
      : state === "live"
        ? "border-emerald-500 bg-emerald-950/60 text-emerald-300"
        : state === "failed"
          ? "border-rose-700 bg-rose-950/40 text-rose-400"
          : state === "current"
            ? "border-emerald-700 bg-emerald-950/40 text-emerald-400"
            : "border-white/[0.1] bg-white/[0.02] text-neutral-600";

  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`group flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
        clickable
          ? "cursor-pointer hover:border-emerald-700/60"
          : "cursor-default"
      } ${active ? "border-emerald-800/50 bg-white/[0.02]" : "border-transparent"}`}
    >
      <span
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-[11px] ${ring}`}
        style={{ fontFamily: FONT_MONO }}
      >
        {state === "complete"
          ? "✓"
          : state === "live"
            ? "●"
            : state === "failed"
              ? "!"
              : "○"}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white">{label}</p>
        <p
          className="truncate text-[10px] uppercase tracking-[0.14em] text-neutral-500"
          style={{ fontFamily: FONT_MONO }}
        >
          {agentName}
        </p>
      </div>
    </button>
  );
}

interface OrchestrationHeaderProps {
  stage: SessionStage;
  profileStatus: AgentRunStatus;
  repoStatus: AgentRunStatus;
  onSelectStage: (stage: SessionStage) => void;
}

export default function OrchestrationHeader({
  stage,
  profileStatus,
  repoStatus,
  onSelectStage,
}: OrchestrationHeaderProps) {
  const traceFilled = profileStatus === "succeeded";
  const traceLive =
    stage === "repos" &&
    (repoStatus === "running" || repoStatus === "connecting");

  return (
    <div className="mb-8 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-2">
      <style>{`
        @keyframes traceDraw {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .trace-fill { transform-origin: left; animation: traceDraw 0.6s ease forwards; }
        @keyframes traceShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(220%); }
        }
        .trace-shimmer { animation: traceShimmer 1.6s ease-in-out infinite; }
      `}</style>

      <StageNode
        label="Developer profile"
        agentName="developer-profile-agent"
        status={profileStatus}
        active={stage === "profile"}
        clickable={stage !== "profile"}
        onClick={() => onSelectStage("profile")}
      />

      <div className="relative mx-1 h-px w-10 flex-shrink-0 overflow-hidden bg-white/[0.08] sm:w-16">
        {traceFilled && (
          <div className="trace-fill absolute inset-0 bg-emerald-600" />
        )}
        {traceLive && (
          <div className="trace-shimmer absolute inset-y-0 w-1/3 bg-emerald-400/70" />
        )}
      </div>

      <StageNode
        label="Open-source match"
        agentName="repo-recommender-agent"
        status={repoStatus}
        active={stage === "repos"}
        clickable={stage === "repos" || profileStatus === "succeeded"}
        onClick={() => onSelectStage("repos")}
      />
    </div>
  );
}
