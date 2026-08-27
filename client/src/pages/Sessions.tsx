import { useEffect, useRef } from "react";
import AppLayout from "../components/AppLayout";
import StatusPill from "../components/StatusPill";
import AgentPipeline, { type PipelineNode } from "../components/AgentPipeline";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import { runProfileAgent } from "../store/profileSlice";
import { runRepoAgent, resumeRepoAgent } from "../store/reposSlice";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

const TAG_STYLES: Record<string, string> = {
  "good first issue":
    "bg-emerald-900/30 text-emerald-400 border-emerald-700/40",
  bug: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  enhancement: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  docs: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

/**
 * Sessions — the home for a run. A session is a pipeline of agents that
 * execute one after another:
 *   Stage 1 · developer-profile-agent  — reads your GitHub, builds a profile
 *   Stage 2 · repo-matching-agent      — matches that profile to open issues
 *
 * Both stages render on this one page. Stage 2 unlocks the moment Stage 1
 * succeeds — no route change, the pipeline strip at the top just tracks
 * which agent is doing the work.
 */
export default function Sessions() {
  const dispatch = useAppDispatch();
  const stage2Ref = useRef<HTMLDivElement | null>(null);

  const {
    data: profile,
    status: profileStatus,
    error: profileError,
    cached,
  } = useAppSelector((s) => s.devProfile);

  const {
    data: repos,
    status: repoStatus,
    error: repoError,
    authUrls,
  } = useAppSelector((s) => s.repos);

  const stage2Unlocked = profileStatus === "succeeded";
  const activeKey = stage2Unlocked ? "discover" : "profile";

  useEffect(() => {
    if (profileStatus !== "succeeded") return;
  }, [profileStatus]);

  const nodes: PipelineNode[] = [
    {
      key: "profile",
      label: "Developer Profile",
      agentName: "developer-profile-agent",
      status: profileStatus,
    },
    {
      key: "discover",
      label: "Find first issue",
      agentName: "repo-matching-agent",
      status: !stage2Unlocked ? "idle" : repoStatus,
    },
  ];

  const handleFindIssue = () => {
    if (repoStatus === "idle") dispatch(runRepoAgent(false));
    requestAnimationFrame(() =>
      stage2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  return (
    <AppLayout>
      <style>{`
        .bubble-btn {
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
            background-color 0.2s ease, box-shadow 0.25s ease;
        }
        .bubble-btn:hover { transform: translateY(-2px) scale(1.03); }
        .bubble-btn:active { transform: translateY(0) scale(0.97); }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 122, 0); }
          50% { box-shadow: 0 0 22px 2px rgba(34, 197, 122, 0.18); }
        }
        .animate-glow { animation: glowPulse 3.2s ease-in-out infinite; }
      `}</style>

      {/* ambient background, same as landing */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="pointer-events-none fixed -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-900/[0.12] blur-[120px]" />

      <main className="relative mx-auto max-w-6xl px-6 py-10">
        <p
          className="mb-2 text-[11px] uppercase tracking-[0.22em] text-emerald-500"
          style={{ fontFamily: FONT_MONO }}
        >
          Session · Agent pipeline
        </p>
        <h1
          className="mb-8 text-3xl font-medium text-white"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Your first-contribution run
        </h1>

        <AgentPipeline nodes={nodes} activeKey={activeKey} />

        {/* ------------------------------------------------------------ */}
        {/* Stage 1 — developer-profile-agent                            */}
        {/* ------------------------------------------------------------ */}

        {profileStatus === "idle" && (
          <ProfileIdle onStart={() => dispatch(runProfileAgent(false))} />
        )}

        {profileStatus !== "idle" && (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2
                className="text-xl font-medium text-white"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                Your developer profile
              </h2>
              <StatusPill status={profileStatus} />
            </div>

            {profileStatus === "running" && <ProfileSkeleton />}

            {profileStatus === "failed" && (
              <div className="rounded-lg border border-rose-700/30 bg-rose-500/[0.04] p-5">
                <p className="text-sm text-rose-400">{profileError}</p>
                <button
                  onClick={() => dispatch(runProfileAgent(true))}
                  className="bubble-btn mt-3 rounded-md border border-emerald-800/40 px-3 py-1.5 text-xs text-white hover:bg-emerald-950/30"
                >
                  Retry
                </button>
              </div>
            )}

            {profileStatus === "succeeded" && profile && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <Card>
                    <Eyebrow>Builder archetype</Eyebrow>
                    <h3
                      className="mt-2 text-xl text-white"
                      style={{ fontFamily: FONT_DISPLAY }}
                    >
                      {profile.builderArchetype}
                    </h3>
                    <p className="mt-3 text-[14px] leading-relaxed text-neutral-300">
                      {profile.summary}
                    </p>
                  </Card>

                  <Card>
                    <Eyebrow>Strongest technologies</Eyebrow>
                    <div className="mt-3 space-y-2.5">
                      {profile.strongestTechnologies.map((tech) => (
                        <div key={tech.name} className="flex items-center gap-3">
                          <span className="w-32 flex-shrink-0 text-[13px] text-neutral-300">
                            {tech.name}
                          </span>
                          <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500"
                              style={{ width: `${tech.confidence}%` }}
                            />
                          </div>
                          <span
                            className="w-10 text-right text-[11px] text-neutral-400"
                            style={{ fontFamily: FONT_MONO }}
                          >
                            {tech.confidence}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <ListCard title="Engineering strengths" items={profile.strengths} />
                    <ListCard title="Observable patterns" items={profile.engineeringPatterns} />
                    <ListCard title="Contribution areas" items={profile.contributionAreas} />
                    <ListCard title="Fun insights" items={profile.funInsights} />
                  </div>
                </div>

                <aside className="space-y-6">
                  <Card>
                    <Eyebrow>Experience level</Eyebrow>
                    <p
                      className="mt-2 text-lg text-white"
                      style={{ fontFamily: FONT_DISPLAY }}
                    >
                      {profile.experienceLevel}
                    </p>
                  </Card>

                  <Card>
                    <Eyebrow>Developer type</Eyebrow>
                    <p className="mt-2 text-[14px] text-neutral-300">
                      {profile.developerType}
                    </p>
                  </Card>

                  <Card>
                    <Eyebrow>GitHub vibe</Eyebrow>
                    <p className="mt-2 text-[14px] italic text-neutral-300">
                      "{profile.githubVibe}"
                    </p>
                  </Card>

                  <button
                    onClick={handleFindIssue}
                    className="bubble-btn animate-glow w-full rounded-lg bg-[#123524] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#17472f]"
                  >
                    Find my first contribution →
                  </button>

                  {cached && (
                    <p
                      className="text-center text-[10px] text-neutral-500"
                      style={{ fontFamily: FONT_MONO }}
                    >
                      cached ·{" "}
                      <button
                        onClick={() => dispatch(runProfileAgent(true))}
                        className="underline hover:text-emerald-400"
                      >
                        regenerate
                      </button>
                    </p>
                  )}
                </aside>
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------ */}
        {/* Stage 2 — repo-matching-agent                                 */}
        {/* ------------------------------------------------------------ */}

        {stage2Unlocked && (
          <section ref={stage2Ref} className="mt-14 scroll-mt-10">
            <div className="mb-2 h-px w-full bg-white/[0.06]" />
            <div className="mb-5 mt-8 flex items-center justify-between">
              <h2
                className="text-xl font-medium text-white"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                Repos worth contributing to
              </h2>
              <div className="flex items-center gap-3">
                <StatusPill status={repoStatus} />
                <button
                  onClick={() => dispatch(runRepoAgent(repoStatus === "succeeded"))}
                  disabled={repoStatus === "running" || repoStatus === "auth_required"}
                  className="bubble-btn rounded-lg bg-[#123524] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#17472f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {repoStatus === "running"
                    ? "Searching…"
                    : repoStatus === "succeeded"
                      ? "Search again"
                      : "Search repos"}
                </button>
              </div>
            </div>

            {repoStatus === "idle" && (
              <p className="text-sm text-neutral-400">
                Hit "Search repos" to match your developer profile against real,
                actively maintained projects.
              </p>
            )}

            {repoStatus === "running" && (
              <p className="text-sm text-neutral-400">
                repo-matching-agent is matching your profile against real repos…
              </p>
            )}

            {repoStatus === "auth_required" && (
              <Card>
                <p className="text-sm text-neutral-300">
                  GitHub authorization is required before we can find matching
                  repositories.
                </p>

                {authUrls.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    {authUrls.map((auth) => (
                      <a
                        key={auth.name}
                        href={auth.authUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bubble-btn rounded-md bg-[#123524] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#17472f]"
                      >
                        Authorize {auth.name}
                      </a>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => dispatch(resumeRepoAgent())}
                  className="bubble-btn mt-4 rounded-md border border-emerald-800/40 px-4 py-2 text-sm text-white hover:bg-emerald-950/30"
                >
                  I've authorized — Continue
                </button>
              </Card>
            )}

            {repoStatus === "failed" && (
              <div className="rounded-lg border border-rose-700/30 bg-rose-500/[0.04] p-5">
                <p className="text-sm text-rose-400">{repoError}</p>
                <button
                  onClick={() => dispatch(runRepoAgent(true))}
                  className="bubble-btn mt-3 rounded-md border border-emerald-800/40 px-3 py-1.5 text-xs text-white hover:bg-emerald-950/30"
                >
                  Retry
                </button>
              </div>
            )}

            {repoStatus === "succeeded" && repos && (
              <div className="grid gap-5 sm:grid-cols-2">
                {repos.map((repo) => (
                  <a
                    key={repo.url}
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="bubble-btn rounded-lg border border-white/[0.06] bg-white/[0.02] p-5 transition-colors hover:border-emerald-800/40 hover:bg-emerald-950/20"
                  >
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                        TAG_STYLES[repo.repoType] ??
                        "border-white/10 bg-white/[0.04] text-neutral-300"
                      }`}
                    >
                      {repo.repoType}
                    </span>

                    <h3
                      className="mt-3 text-lg text-white"
                      style={{ fontFamily: FONT_DISPLAY }}
                    >
                      {repo.name}
                    </h3>

                    <p className="mt-2 text-[13px] text-neutral-400">
                      {repo.description}
                    </p>

                    <p className="mt-3 text-[13px] leading-relaxed text-neutral-300">
                      {repo.whyItMatches}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </AppLayout>
  );
}

/* -------------------------------------------------------------------- */
/* Building blocks                                                       */
/* -------------------------------------------------------------------- */

function ProfileIdle({ onStart }: { onStart: () => void }) {
  const scanLines = [
    "reading your public repos",
    "sorting by what's actually active",
    "sampling commits for how you work",
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div>
        <h2
          className="text-4xl leading-[1.1] text-white sm:text-5xl"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Let's see what
          <br />
          you actually build.
        </h2>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-300">
          No forms, no self-rating. We read your public GitHub — repos, commit
          patterns, the stack you reach for — and turn it into a profile of
          the kind of engineer you are. Stage two matches that profile to a
          real first issue.
        </p>

        <button
          onClick={onStart}
          className="bubble-btn animate-glow mt-8 rounded-lg bg-[#123524] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#17472f]"
        >
          Analyze my GitHub
        </button>

        <p
          className="mt-3 text-[10px] tracking-[0.14em] text-neutral-500"
          style={{ fontFamily: FONT_MONO }}
        >
          READ-ONLY · WE NEVER WRITE TO YOUR REPOS
        </p>
      </div>

      <div className="rounded-lg border border-emerald-900/30 bg-white/[0.02] p-5">
        <p
          className="mb-3 text-[10px] uppercase tracking-[0.16em] text-neutral-400"
          style={{ fontFamily: FONT_MONO }}
        >
          developer-profile-agent
        </p>
        <div className="space-y-2.5">
          {scanLines.map((line) => (
            <div
              key={line}
              className="flex items-center gap-2.5 text-[12px] text-neutral-400"
              style={{ fontFamily: FONT_MONO }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonLine width="w-2/3" />
      <SkeletonLine width="w-1/2" />
      <SkeletonLine width="w-3/4" />
      <p
        className="pt-2 text-[11px] text-neutral-500"
        style={{ fontFamily: FONT_MONO }}
      >
        developer-profile-agent is reading your GitHub repos and commit
        patterns…
      </p>
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div className={`h-3 ${width} animate-pulse rounded bg-emerald-950/40`} />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] p-6">{children}</div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] uppercase tracking-[0.16em] text-neutral-400"
      style={{ fontFamily: FONT_MONO }}
    >
      {children}
    </p>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <Eyebrow>{title}</Eyebrow>
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-2 text-[13px] leading-relaxed text-neutral-300"
          >
            <span className="text-emerald-600">·</span>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}