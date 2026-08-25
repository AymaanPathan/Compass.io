import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { logoutUser } from "../store/authSlice";
import { fetchGithubProfile } from "../store/githubSlice";
import { findOssProjects, resetOssRecommendation } from "../store/ossSlice";
import RepoKanbanBoard from "../components/RepoKanbanBoard";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

function AgentWorkspace() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { user, status } = useSelector((s: RootState) => s.auth);
  const { stack, status: githubStatus } = useSelector(
    (s: RootState) => s.github,
  );
  const {
    repositories,
    bestMatch,
    liveOutput,
    sessionId,
    parseFailed,
    status: ossStatus,
    error: ossError,
  } = useSelector((s: RootState) => s.oss);

  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "loading" && status !== "idle" && !user) {
      navigate("/", { replace: true });
    }
  }, [status, user, navigate]);

  useEffect(() => {
    if (status === "authenticated" && githubStatus === "idle") {
      dispatch(fetchGithubProfile());
    }
  }, [status, githubStatus, dispatch]);

  // This page's whole job is to run discovery — trigger it whenever the
  // stack is ready and nothing's running/finished yet. No fragile
  // one-shot flag: works on first arrival, refresh, or direct nav.
  useEffect(() => {
    if (
      githubStatus === "succeeded" &&
      stack &&
      ossStatus === "idle" &&
      repositories.length === 0
    ) {
      dispatch(findOssProjects());
    }
  }, [githubStatus, stack, ossStatus, repositories.length, dispatch]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [liveOutput]);

  const handleRerun = () => {
    dispatch(resetOssRecommendation());
    dispatch(findOssProjects());
  };

  if (status === "loading" || status === "idle" || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-800 border-t-white animate-spin" />
      </div>
    );
  }

  const isLive = ossStatus === "loading";

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-black/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MarkGlyph />
            <span
              className="text-xs tracking-[0.2em] uppercase"
              style={{ fontFamily: FONT_MONO }}
            >
              Compass
            </span>
            <span
              className="hidden sm:inline text-[11px] text-neutral-600 ml-2"
              style={{ fontFamily: FONT_MONO }}
            >
              · agent workspace
            </span>
          </div>
          <div className="flex items-center gap-4">
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="h-7 w-7 rounded-full ring-1 ring-white/10"
            />
            <span className="text-sm text-neutral-400 hidden sm:inline">
              @{user.username}
            </span>
            <button
              onClick={() => dispatch(logoutUser())}
              className="text-xs text-neutral-600 hover:text-neutral-300 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Session status strip */}
        <div className="flex items-center gap-3 mb-6">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isLive
                ? "bg-emerald-400 animate-pulse"
                : ossStatus === "failed"
                  ? "bg-red-500"
                  : "bg-neutral-600"
            }`}
          />
          <p
            className="text-[11px] tracking-[0.16em] uppercase text-neutral-500"
            style={{ fontFamily: FONT_MONO }}
          >
            {isLive
              ? "Agent session live"
              : ossStatus === "succeeded"
                ? "Session complete"
                : ossStatus === "failed"
                  ? "Session failed"
                  : "Idle"}
          </p>
          {sessionId && (
            <p
              className="text-[11px] text-neutral-700"
              style={{ fontFamily: FONT_MONO }}
            >
              {sessionId}
            </p>
          )}
        </div>
        <h1
          className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-medium tracking-tight mb-1"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Discovering repositories
        </h1>

        <pre className="mt-4 text-[10px] text-lime-400 bg-black/50 p-3 rounded">
          {JSON.stringify(
            {
              authStatus: status,
              githubStatus,
              hasStack: !!stack,
              ossStatus,
              repoCount: repositories.length,
            },
            null,
            2,
          )}
        </pre>
        {stack && (
          <p className="text-sm text-neutral-500 mb-8">
            Scoped to @{user.username}'s stack ·{" "}
            {stack.topLanguages
              .slice(0, 3)
              .map((l) => l.language)
              .join(", ")}
          </p>
        )}
        {/* Live console — the agent's real streamed output */}
        {(isLive || liveOutput) && (
          <div className="mb-8 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
              <span
                className="text-[11px] tracking-[0.14em] uppercase text-neutral-600"
                style={{ fontFamily: FONT_MONO }}
              >
                oss-discover-agent
              </span>
              {isLive && (
                <span
                  className="text-[11px] text-emerald-400/80"
                  style={{ fontFamily: FONT_MONO }}
                >
                  streaming…
                </span>
              )}
            </div>
            <div
              ref={consoleRef}
              className="px-4 py-4 max-h-64 overflow-y-auto text-[12.5px] leading-relaxed text-neutral-300 whitespace-pre-wrap"
              style={{ fontFamily: FONT_MONO }}
            >
              {liveOutput || "Connecting to agent session…"}
              {isLive && (
                <span className="inline-block w-1.5 h-3.5 bg-white/70 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          </div>
        )}
        {ossStatus === "failed" && (
          <div className="mb-8 text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-xl p-5">
            {ossError || "Agent session failed."}
            <button
              onClick={handleRerun}
              className="mt-3 block text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
            >
              Run again
            </button>
          </div>
        )}
        {ossStatus === "succeeded" && parseFailed && (
          <div className="mb-8 text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded-xl p-4">
            Agent finished but didn't follow the expected format — raw output is
            above.
          </div>
        )}
        {ossStatus === "succeeded" && !parseFailed && bestMatch && (
          <div className="mb-10 rounded-2xl border border-white/[0.08] p-6 max-w-2xl">
            <p
              className="text-[11px] tracking-[0.16em] uppercase text-neutral-500 mb-3"
              style={{ fontFamily: FONT_MONO }}
            >
              Agent's top pick
            </p>
            <h2
              className="text-lg font-medium"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              {bestMatch.name}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              {bestMatch.reason}
            </p>
          </div>
        )}
        {ossStatus === "succeeded" &&
          !parseFailed &&
          repositories.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-[11px] tracking-[0.16em] uppercase text-neutral-500"
                  style={{ fontFamily: FONT_MONO }}
                >
                  Discovering
                </h2>
                <button
                  onClick={handleRerun}
                  className="text-[11px] text-neutral-500 hover:text-neutral-300 underline underline-offset-2 transition-colors"
                >
                  Run again
                </button>
              </div>
              <RepoKanbanBoard />
            </section>
          )}
      </main>
    </div>
  );
}

function MarkGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="7"
        stroke="white"
        strokeOpacity="0.8"
        strokeWidth="1"
      />
      <line x1="8" y1="1" x2="8" y2="3.4" stroke="white" strokeWidth="1" />
      <circle cx="8" cy="8" r="1" fill="white" />
    </svg>
  );
}

export default AgentWorkspace;
