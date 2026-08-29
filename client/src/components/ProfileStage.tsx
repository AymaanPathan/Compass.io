import type { DeveloperProfile } from "../types";
import type { AuthUrl } from "../utils/agentStream";
import type { AgentRunStatus } from "../store/profileSlice";
import AgentStepsPanel from "./AgentStepsPanel";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface ProfileStageProps {
  status: AgentRunStatus;
  profile: DeveloperProfile | null;
  streamingProfile: Partial<DeveloperProfile> | null;
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
  authUrls,
  error,
  cached,
  onStart,
  onResume,
  onAdvance,
}: ProfileStageProps) {
  if (status === "idle") {
    return <ProfileIdle onStart={onStart} />;
  }

  if (
    status === "connecting" ||
    status === "running" ||
    status === "auth_required"
  ) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <AgentStepsPanel steps={steps} />
          {status === "auth_required" && authUrls.length > 0 && (
            <div className="rounded-lg border border-amber-700/30 bg-amber-500/[0.04] p-4">
              <p className="text-sm text-amber-300">
                GitHub authorization needed to continue.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {authUrls.map((a,i) => (
                  <a
                    key={i}
                    href={a.authUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bubble-btn rounded-md border border-amber-700/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-950/30"
                  >
                    Connect {a.name}
                  </a>
                ))}
              </div>
              <button
                onClick={onResume}
                className="bubble-btn mt-3 rounded-md border border-emerald-800/40 px-3 py-1.5 text-xs text-white hover:bg-emerald-950/30"
              >
                I've authorized — continue
              </button>
            </div>
          )}
        </div>
        <LiveProfileBuild profile={streamingProfile} />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-4">
        <AgentStepsPanel steps={steps} />
        <div className="rounded-lg border border-rose-700/30 bg-rose-500/[0.04] p-5">
          <p className="text-sm text-rose-400">{error}</p>
          <button
            onClick={onStart}
            className="bubble-btn mt-3 rounded-md border border-emerald-800/40 px-3 py-1.5 text-xs text-white hover:bg-emerald-950/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (status === "succeeded" && profile) {
    return (
      <div className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-lg border border-white/[0.06] p-6">
              <Eyebrow>Builder archetype</Eyebrow>
              <h2
                className="mt-2 text-xl text-white"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                {profile.builderArchetype}
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-neutral-400">
                {profile.summary}
              </p>
            </section>

            <section className="rounded-lg border border-white/[0.06] p-6">
              <Eyebrow>Strongest technologies</Eyebrow>
              <div className="mt-3 space-y-2.5">
                {profile.strongestTechnologies.map((tech) => (
                  <div key={tech.name} className="flex items-center gap-3">
                    <span className="w-32 flex-shrink-0 text-[13px] text-neutral-300">
                      {tech.name}
                    </span>
                    <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500/70"
                        style={{ width: `${tech.confidence}%` }}
                      />
                    </div>
                    <span
                      className="w-10 text-right text-[11px] text-neutral-500"
                      style={{ fontFamily: FONT_MONO }}
                    >
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

            <AgentStepsPanel steps={steps} />
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

            {cached && (
              <p
                className="text-center text-[10px] text-neutral-600"
                style={{ fontFamily: FONT_MONO }}
              >
                cached ·{" "}
                <button
                  onClick={onStart}
                  className="underline hover:text-neutral-400"
                >
                  regenerate
                </button>
              </p>
            )}
          </aside>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-emerald-900/30 bg-emerald-950/[0.15] px-6 py-5">
          <div>
            <p
              className="text-[11px] uppercase tracking-[0.16em] text-emerald-500"
              style={{ fontFamily: FONT_MONO }}
            >
              Next in the pipeline
            </p>
            <p className="mt-1 text-[15px] text-white">
              Hand this profile to the repo-recommender agent.
            </p>
          </div>
          <button
            onClick={onAdvance}
            className="bubble-btn flex-shrink-0 rounded-lg bg-[#123524] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#17472f]"
          >
            Find my open-source matches →
          </button>
        </div>
      </div>
    );
  }

  return null;
}

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
          patterns, the stack you reach for — and turn it into a profile of the
          kind of engineer you are.
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

function LiveProfileBuild({
  profile,
}: {
  profile: Partial<DeveloperProfile> | null;
}) {
  const fields: { key: keyof DeveloperProfile; label: string }[] = [
    { key: "builderArchetype", label: "Builder archetype" },
    { key: "developerType", label: "Developer type" },
    { key: "experienceLevel", label: "Experience level" },
    { key: "summary", label: "Summary" },
    { key: "githubVibe", label: "GitHub vibe" },
  ];

  return (
    <div className="rounded-lg border border-white/[0.06] p-6">
      <Eyebrow>Building your profile</Eyebrow>
      <div className="mt-4 space-y-4">
        {fields.map(({ key, label }) => {
          const value = profile?.[key];
          return (
            <div key={key}>
              <p
                className="text-[10px] uppercase tracking-[0.14em] text-neutral-600"
                style={{ fontFamily: FONT_MONO }}
              >
                {label}
              </p>
              {value ? (
                <p className="mt-1 text-[14px] text-neutral-200">
                  {String(value)}
                </p>
              ) : (
                <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-white/[0.05]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
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