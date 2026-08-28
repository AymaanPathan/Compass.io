import type { MatchedRepository } from "../types";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

export default function RepoCard({
  repo,
  index,
}: {
  repo: MatchedRepository;
  index: number;
}) {
  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noreferrer"
      className="repo-card-in group flex flex-col justify-between rounded-lg border border-white/[0.06] p-6 transition-colors hover:border-emerald-700/50 hover:bg-white/[0.02]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <style>{`
        @keyframes repoCardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .repo-card-in { animation: repoCardIn 0.4s ease both; }
      `}</style>

      <div>
        <div className="flex items-start justify-between gap-3">
          <h3
            className="text-lg text-white group-hover:text-emerald-300"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            {repo.name}
          </h3>
          <span
            className="flex-shrink-0 rounded-full border border-emerald-800/40 bg-emerald-950/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-emerald-400"
            style={{ fontFamily: FONT_MONO }}
          >
            {repo.repoType}
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
          {repo.description}
        </p>
      </div>

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <p
          className="text-[10px] uppercase tracking-[0.14em] text-neutral-600"
          style={{ fontFamily: FONT_MONO }}
        >
          Why it matches you
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-300">
          {repo.whyItMatches}
        </p>
      </div>

      <span
        className="mt-4 inline-flex items-center gap-1 text-[12px] text-emerald-500 group-hover:text-emerald-400"
        style={{ fontFamily: FONT_MONO }}
      >
        View on GitHub →
      </span>
    </a>
  );
}
