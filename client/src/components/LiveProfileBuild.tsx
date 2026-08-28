import type { DeveloperProfile } from "../types";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

export default function LiveProfileBuild({
  profile,
}: {
  profile: Partial<DeveloperProfile> | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <Eyebrow>Builder archetype</Eyebrow>
          {profile?.builderArchetype ? (
            <h3
              className="mt-2 text-xl text-white animate-[fadeIn_0.3s_ease]"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              {profile.builderArchetype}
            </h3>
          ) : (
            <ShimmerLine className="mt-3 w-2/3 h-5" />
          )}
          {profile?.summary ? (
            <p className="mt-3 text-[14px] leading-relaxed text-neutral-300 animate-[fadeIn_0.3s_ease]">
              {profile.summary}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <ShimmerLine className="w-full h-3" />
              <ShimmerLine className="w-5/6 h-3" />
            </div>
          )}
        </Card>

        <Card>
          <Eyebrow>Strongest technologies</Eyebrow>
          <div className="mt-3 space-y-2.5">
            {(profile?.strongestTechnologies?.length
              ? profile.strongestTechnologies
              : [null, null, null]
            ).map((tech, i) =>
              tech ? (
                <div
                  key={tech.name}
                  className="flex items-center gap-3 animate-[fadeIn_0.3s_ease]"
                >
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
              ) : (
                <ShimmerLine key={i} className="w-full h-3" />
              ),
            )}
          </div>
        </Card>

        <div className="grid gap-6 sm:grid-cols-2">
          <ShimmerListCard
            title="Engineering strengths"
            items={profile?.strengths}
          />
          <ShimmerListCard
            title="Observable patterns"
            items={profile?.engineeringPatterns}
          />
          <ShimmerListCard
            title="Contribution areas"
            items={profile?.contributionAreas}
          />
          <ShimmerListCard title="Fun insights" items={profile?.funInsights} />
        </div>
      </div>

      <aside className="space-y-6">
        <Card>
          <Eyebrow>Experience level</Eyebrow>
          {profile?.experienceLevel ? (
            <p
              className="mt-2 text-lg text-white animate-[fadeIn_0.3s_ease]"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              {profile.experienceLevel}
            </p>
          ) : (
            <ShimmerLine className="mt-2 w-1/2 h-5" />
          )}
        </Card>

        <Card>
          <Eyebrow>Developer type</Eyebrow>
          {profile?.developerType ? (
            <p className="mt-2 text-[14px] text-neutral-300 animate-[fadeIn_0.3s_ease]">
              {profile.developerType}
            </p>
          ) : (
            <ShimmerLine className="mt-2 w-full h-3" />
          )}
        </Card>

        <Card>
          <Eyebrow>GitHub vibe</Eyebrow>
          {profile?.githubVibe ? (
            <p className="mt-2 text-[14px] italic text-neutral-300 animate-[fadeIn_0.3s_ease]">
              "{profile.githubVibe}"
            </p>
          ) : (
            <ShimmerLine className="mt-2 w-4/5 h-3" />
          )}
        </Card>
      </aside>
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
function ShimmerLine({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded bg-emerald-950/40 ${className}`} />
  );
}
function ShimmerListCard({
  title,
  items,
}: {
  title: string;
  items?: string[];
}) {
  return (
    <Card>
      <Eyebrow>{title}</Eyebrow>
      <ul className="mt-3 space-y-2">
        {(items?.length ? items : [null, null, null]).map((item, i) =>
          item ? (
            <li
              key={i}
              className="flex gap-2 text-[13px] leading-relaxed text-neutral-300 animate-[fadeIn_0.3s_ease]"
            >
              <span className="text-emerald-600">·</span>
              {item}
            </li>
          ) : (
            <ShimmerLine key={i} className="w-full h-3" />
          ),
        )}
      </ul>
    </Card>
  );
}
