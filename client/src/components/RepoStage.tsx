import type { MatchedRepository } from "../types";
import type { AgentActivityEvent, AuthUrl } from "../store/agentStream";
import type { AgentRunStatus } from "../store/profileSlice";
import AgentConsole from "./AgentConsole";
import RepoCard from "./RepoCard";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface RepoStageProps {
  status: AgentRunStatus;
  repos: MatchedRepository[] | null;
  activity: AgentActivityEvent[];
  authUrls: AuthUrl[];
  error: string | null;
  cached: boolean;
  onResume: () => void;
  onRetry: () => void;
  onBack: () => void;
}

export default function RepoStage({
  status,
  repos,
  activity,
  authUrls,
  error,
  cached,
  onResume,
  onRetry,
  onBack,
}: RepoStageProps) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-300"
        style={{ fontFamily: FONT_MONO }}
      >
        ← back to profile
      </button>

      {(status === "connecting" ||
        status === "running" ||
        status === "auth_required") && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <AgentConsole
            agentName="repo-recommender-agent"
            status={status}
            activity={activity}
            authUrls={authUrls}
            onResume={onResume}
          />
          <div className="rounded-lg border border-white/[0.06] p-6">
            <p
              className="text-[10px] uppercase tracking-[0.16em] text-neutral-400"
              style={{ fontFamily: FONT_MONO }}
            >
              What it's doing
            </p>
            <h2
              className="mt-2 text-2xl text-white"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              Matching your profile against real open-source products.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-neutral-400">
              It's building one broad search from your strongest technologies
              and contribution areas, then ranking every candidate for genuine
              fit — favoring small, actively maintained projects over
              mega-frameworks where contributing is unrealistic.
            </p>
          </div>
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-lg border border-rose-700/30 bg-rose-500/[0.04] p-5">
          <p className="text-sm text-rose-400">{error}</p>
          <button
            onClick={onRetry}
            className="bubble-btn mt-3 rounded-md border border-emerald-800/40 px-3 py-1.5 text-xs text-white hover:bg-emerald-950/30"
          >
            Retry
          </button>
        </div>
      )}

      {status === "succeeded" && repos && (
        <div>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p
                className="text-[11px] uppercase tracking-[0.16em] text-emerald-500"
                style={{ fontFamily: FONT_MONO }}
              >
                {repos.length} matches found
              </p>
              <h2
                className="mt-1 text-2xl text-white"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                Your open-source matches
              </h2>
            </div>
            {cached && (
              <button
                onClick={onRetry}
                className="text-[11px] text-neutral-500 underline hover:text-neutral-300"
                style={{ fontFamily: FONT_MONO }}
              >
                regenerate
              </button>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {repos.map((repo, i) => (
              <RepoCard key={repo.url} repo={repo} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
