import { useEffect, useRef, useState } from "react";
import type { DeveloperProfile } from "../types";
import type { AuthUrl, StepNode } from "../utils/agentStream";
import type { AgentRunStatus } from "../store/profileSlice";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface ProfileStageProps {
  status: AgentRunStatus;
  profile: DeveloperProfile | null;
  streamingProfile: Partial<DeveloperProfile> | null;
  steps: StepNode[];
  authUrls: AuthUrl[];
  error: string | null;
  cached: boolean;
  onStart: () => void;
  onResume: () => void;
  onAdvance: () => void;
}

export default function ProfileStage({
  status,
  profile,
  streamingProfile,
  steps,
  authUrls,
  error,
  cached,
  onStart,
  onResume,
  onAdvance,
}: ProfileStageProps) {
  const traceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    traceRef.current?.scrollTo({
      top: traceRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [steps]);

  const isIdle = status === "idle";
  const isBusy =
    status === "connecting" ||
    status === "running" ||
    status === "auth_required" ||
    status === "failed";
  const isDone = status === "succeeded";

  return (
    <div className="flex h-[calc(100vh-48px)] w-full flex-col bg-[#14120B] text-[#EDECEC]">
      <StatusBar status={status} cached={cached} />

      <div className="flex min-h-0 flex-1">
        {/* Left — reasoning */}
        <section className="flex w-full max-w-[400px] shrink-0 flex-col border-r border-white/[0.08]">
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
                Run the agent to see its reasoning trace here.
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
            {status === "failed" && (
              <FailedCard error={error} onRetry={onStart} />
            )}
          </div>
        </section>

        {/* Right — profile, full remaining width */}
        <section className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="w-full flex-1 px-10 py-8 sm:px-14">
            {isIdle && <IdleHero onStart={onStart} />}
            {isBusy && (
              <FormingProfile
                streamingProfile={streamingProfile}
                status={status}
              />
            )}
            {isDone && profile && (
              <FinalProfile profile={profile} onRegenerate={onStart} />
            )}
          </div>

          {isDone && (
            <div className="sticky bottom-0 flex justify-end border-t border-white/[0.08] bg-[#14120B] px-10 py-3.5 sm:px-14">
              <button
                onClick={onAdvance}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#D39237] px-4 py-2 text-[13px] font-semibold text-[#14120B] transition-colors hover:bg-[#D39237]/90"
              >
                Recommend repo
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
          )}
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status bar                                                                */
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
    failed: { label: "Failed", live: false },
    succeeded: { label: "Complete", live: false },
  };
  const s = map[status];

  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        <p className="text-[12.5px] text-[#EDECEC]/75">
          Developer profile agent
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

/* -------------------------------------------------------------------------- */
/*  Idle hero (right pane)                                                   */
/* -------------------------------------------------------------------------- */

function IdleHero({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-[calc(100vh-200px)] max-w-4xl flex-col justify-center">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[#D39237]">
        Step 1 of 5 · Builder profile
      </p>

      <h1 className="mt-4 text-[42px] font-semibold leading-[1.1] tracking-tight text-[#EDECEC] sm:text-[52px]">
        Go from "I want to
        <br />
        contribute" to an open PR
      </h1>

      <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#EDECEC]/65">
        This agent takes you all the way from a blank slate to a tested,
        reviewed pull request — finding the right repo, understanding the issue,
        writing the fix, and opening the PR with your approval at every
        irreversible step. It starts by reading your GitHub activity to
        understand what you're capable of contributing to.
      </p>

      <button
        onClick={onStart}
        className="mt-8 inline-flex w-fit items-center gap-2 rounded-md bg-[#D39237] px-5 py-3 text-[14px] font-semibold text-[#14120B] transition-colors hover:bg-[#D39237]/90"
      >
        Analyze my GitHub
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"
            stroke="#14120B"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <p className="mt-2.5 text-[11.5px] text-[#EDECEC]/40">
        Read-only · we never write to your repos
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Forming profile (right pane, while busy)                                 */
/* -------------------------------------------------------------------------- */

function FormingProfile({
  streamingProfile,
  status,
}: {
  streamingProfile: Partial<DeveloperProfile> | null;
  status: AgentRunStatus;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-[11.5px] text-[#EDECEC]/50">Forming profile</p>
      <h2 className="mt-2.5 text-[20px] font-medium text-[#EDECEC]/95">
        {streamingProfile?.builderArchetype ?? (
          <span className="inline-block h-5 w-2/3 rounded bg-white/[0.06] align-middle" />
        )}
      </h2>

      <div className="mt-5 grid gap-4 border-t border-white/[0.08] pt-4 sm:grid-cols-3">
        <PreviewField
          label="Developer type"
          value={streamingProfile?.developerType}
        />
        <PreviewField
          label="Experience"
          value={streamingProfile?.experienceLevel}
        />
        <PreviewField
          label="GitHub vibe"
          value={streamingProfile?.githubVibe}
        />
      </div>

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

function PreviewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p
        className="text-[10.5px] uppercase tracking-wide text-[#EDECEC]/40"
        style={{ fontFamily: MONO }}
      >
        {label}
      </p>
      <p className="mt-1 min-h-[16px] text-[13px] text-[#EDECEC]/90">
        {value ?? <span className="text-[#EDECEC]/25">—</span>}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Auth / failed cards (left pane)                                          */
/* -------------------------------------------------------------------------- */

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
        Read-only OAuth grant — the agent can't read your repositories without
        it.
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
        {error ?? "Something went wrong while analyzing your GitHub profile."}
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
/*  Step trace                                                               */
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
        {step.result && (
          <p className="mt-0.5 pl-3 text-[11.5px] leading-relaxed text-[#EDECEC]/50">
            {truncate(step.result, 220)}
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
/*  Final profile (right pane) — uses full width via a 2-col grid            */
/* -------------------------------------------------------------------------- */

function FinalProfile({
  profile,
  onRegenerate,
}: {
  profile: DeveloperProfile;
  onRegenerate: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] text-[#EDECEC]/50">Profile</p>
        <button
          onClick={onRegenerate}
          className="rounded-md border border-white/[0.12] px-3 py-1.5 text-[12px] text-[#EDECEC]/75 hover:bg-white/[0.05]"
        >
          Regenerate
        </button>
      </div>

      {/* Archetype spans full width */}
      <section className="rounded-md border border-white/[0.08] p-7">
        <p className="text-[11.5px] text-[#EDECEC]/50">Builder archetype</p>
        <h2 className="mt-1.5 text-[22px] font-medium text-[#EDECEC]">
          {profile.builderArchetype}
        </h2>
        <p className="mt-2.5 max-w-4xl text-[13.5px] leading-relaxed text-[#EDECEC]/65">
          {profile.summary}
        </p>
        <div className="mt-5 grid gap-4 border-t border-white/[0.08] pt-4 sm:grid-cols-3">
          <Field label="Developer type" value={profile.developerType} />
          <Field label="Experience level" value={profile.experienceLevel} />
          <Field label="GitHub vibe" value={`"${profile.githubVibe}"`} italic />
        </div>
      </section>

      {/* Two-column: technologies + lists side by side on wide screens */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-md border border-white/[0.08] p-6">
          <p className="text-[11.5px] text-[#EDECEC]/50">
            Strongest technologies
          </p>
          <div className="mt-3.5 space-y-2.5">
            {profile.strongestTechnologies.map((t) => (
              <div key={t.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-[12.5px] text-[#EDECEC]/75">
                  {t.name}
                </span>
                <div className="h-1 flex-1 rounded-full bg-white/[0.08]">
                  <div
                    className="h-1 rounded-full bg-[#D39237]"
                    style={{ width: `${t.confidence}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[11px] text-[#EDECEC]/40">
                  {t.confidence}%
                </span>
              </div>
            ))}
          </div>
        </section>

        <ListCard title="Strengths" items={profile.strengths} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ListCard title="Patterns" items={profile.engineeringPatterns} />
        <ListCard
          title="Contribution areas"
          items={profile.contributionAreas}
        />
        <ListCard title="Fun insights" items={profile.funInsights} />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  italic,
}: {
  label: string;
  value: string;
  italic?: boolean;
}) {
  return (
    <div>
      <p
        className="text-[10.5px] uppercase tracking-wide text-[#EDECEC]/40"
        style={{ fontFamily: MONO }}
      >
        {label}
      </p>
      <p
        className={`mt-1 text-[13px] text-[#EDECEC]/90 ${italic ? "italic" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-white/[0.08] p-6">
      <p className="mb-2.5 text-[11.5px] text-[#EDECEC]/50">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="text-[12.5px] leading-relaxed text-[#EDECEC]/75"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
