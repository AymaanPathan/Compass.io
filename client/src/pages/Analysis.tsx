import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import StatusPill from "../components/StatusPill";
import AgentPipeline, { type PipelineNode } from "../components/AgentPipeline";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import { runProfileAgent } from "../store/profileSlice";

export default function Analysis() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const {
    data: profile,
    status,
    error,
    cached,
  } = useAppSelector((s) => s.devProfile);

  // Elapsed-time readout while the agent is running — no fake progress bar,
  // just an honest clock so a 20–40s run doesn't feel broken.
  useEffect(() => {
    if (status !== "running") return;
  }, [status]);

  const nodes: PipelineNode[] = [
    {
      key: "profile",
      label: "Developer Profile",
      agentName: "developer-profile-agent",
      status:
        status === "running"
          ? "running"
          : status === "succeeded"
            ? "succeeded"
            : status === "failed"
              ? "failed"
              : "idle",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono-brand text-[11px] uppercase tracking-[0.22em] text-neutral-500 mb-4">
          Stage 1 — Understand you
        </p>

        {status !== "idle" && (
          <AgentPipeline nodes={nodes} activeKey="profile" />
        )}

        {status === "idle" && (
          <IdleStart onStart={() => dispatch(runProfileAgent(false))} />
        )}

        {status !== "idle" && (
          <div className="mt-10 flex items-center justify-between">
            <h1 className="font-display text-3xl text-white">
              Your developer profile
            </h1>
            <StatusPill status={status} />
          </div>
        )}

        {status === "running" && <RunningState />}

        {status === "failed" && (
          <div className="mt-8 rounded-lg border border-fail/30 bg-fail/5 p-5">
            <p className="text-sm text-fail">{error}</p>
            <button
              onClick={() => dispatch(runProfileAgent(true))}
              className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        )}

        {status === "succeeded" && profile && (
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <section className="rounded-lg border border-white/[0.06] p-6">
                <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Builder archetype
                </p>
                <h2 className="mt-2 font-display text-xl text-white">
                  {profile.builderArchetype}
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-neutral-400">
                  {profile.summary}
                </p>
              </section>

              <section className="rounded-lg border border-white/[0.06] p-6">
                <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-500 mb-3">
                  Strongest technologies
                </p>
                <div className="space-y-2.5">
                  {profile.strongestTechnologies.map((tech) => (
                    <div key={tech.name} className="flex items-center gap-3">
                      <span className="w-32 flex-shrink-0 text-[13px] text-neutral-300">
                        {tech.name}
                      </span>
                      <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
                        <div
                          className="h-1.5 rounded-full bg-white/70"
                          style={{ width: `${tech.confidence}%` }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono-brand text-[11px] text-neutral-500">
                        {tech.confidence}%
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-6 sm:grid-cols-2">
                <ListCard
                  title="Engineering strengths"
                  items={profile.strengths}
                />
                <ListCard
                  title="Observable patterns"
                  items={profile.engineeringPatterns}
                />
                <ListCard
                  title="Contribution areas"
                  items={profile.contributionAreas}
                />
                <ListCard title="Fun insights" items={profile.funInsights} />
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-lg border border-white/[0.06] p-6">
                <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Experience level
                </p>
                <p className="mt-2 font-display text-lg text-white">
                  {profile.experienceLevel}
                </p>
              </div>

              <div className="rounded-lg border border-white/[0.06] p-6">
                <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Developer type
                </p>
                <p className="mt-2 text-[14px] text-neutral-300">
                  {profile.developerType}
                </p>
              </div>

              <div className="rounded-lg border border-white/[0.06] p-6">
                <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  GitHub vibe
                </p>
                <p className="mt-2 text-[14px] italic text-neutral-300">
                  "{profile.githubVibe}"
                </p>
              </div>

              <button
                onClick={() => navigate("/discover")}
                className="w-full rounded-lg bg-white px-5 py-3 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
              >
                Find my first contribution →
              </button>

              {cached && (
                <p className="text-center font-mono-brand text-[10px] text-neutral-600">
                  cached ·{" "}
                  <button
                    onClick={() => dispatch(runProfileAgent(true))}
                    className="underline hover:text-neutral-400"
                  >
                    regenerate
                  </button>
                </p>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Idle state. This is the first thing a new user sees, so it has to explain
 * what's about to happen and why — not just show a spinner they didn't ask for.
 */
function IdleStart({ onStart }: { onStart: () => void }) {
  const scanLines = [
    "reading your public repos",
    "sorting by what's actually active",
    "sampling commits for how you work",
  ];

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div>
        <h1 className="font-display text-4xl leading-[1.1] text-white sm:text-5xl">
          Let's see what
          <br />
          you actually build.
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-400">
          No forms, no self-rating. We read your public GitHub — repos, commit
          patterns, the stack you reach for — and turn it into a profile of the
          kind of engineer you are. Takes under a minute.
        </p>

        <button
          onClick={onStart}
          className="mt-8 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
        >
          Analyze my GitHub
        </button>

        <p className="mt-3 font-mono-brand text-[10px] tracking-[0.14em] text-neutral-600">
          READ-ONLY · WE NEVER WRITE TO YOUR REPOS
        </p>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-600 mb-3">
          developer-profile-agent
        </p>
        <div className="space-y-2.5 font-mono-brand text-[12px] text-neutral-500">
          {scanLines.map((line) => (
            <div key={line} className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-700" />
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunningState() {
  return (
    <div className="mt-8 space-y-3">
      <SkeletonLine width="w-2/3" />
      <SkeletonLine width="w-1/2" />
      <SkeletonLine width="w-3/4" />
      <p className="font-mono-brand text-[11px] text-neutral-600 pt-2">
        developer-profile-agent is reading your GitHub repos and commit
        patterns…
      </p>
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div className={`h-3 ${width} animate-pulse rounded bg-white/[0.06]`} />
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-white/[0.06] p-6">
      <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-500 mb-3">
        {title}
      </p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-2 text-[13px] leading-relaxed text-neutral-300"
          >
            <span className="text-neutral-600">·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
