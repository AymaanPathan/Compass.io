import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "../store/store";

import { findOssRepository, resetOssRecommendation } from "../store/ossSlice";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

function AgentPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const autoFindTriggered = useRef(false);

  const { user } = useSelector((s: RootState) => s.auth);

  const { profile } = useSelector((s: RootState) => s.devProfile);

  const { repository, status, error } = useSelector((s: RootState) => s.oss);

  useEffect(() => {
    if (!user) {
      navigate("/", {
        replace: true,
      });

      return;
    }

    if (!profile) {
      navigate("/analysis", {
        replace: true,
      });

      return;
    }

    const shouldAutoFind = sessionStorage.getItem("compass_auto_find") === "1";

    if (shouldAutoFind && status === "idle" && !autoFindTriggered.current) {
      autoFindTriggered.current = true;

      sessionStorage.removeItem("compass_auto_find");

      dispatch(findOssRepository());
    }
  }, [user, profile, status, dispatch, navigate]);

  const handleRetry = () => {
    dispatch(resetOssRecommendation());

    dispatch(findOssRepository());
  };

  const handleViewIssues = () => {
    if (!repository) return;
    navigate(`/repo/${repository.owner}/${repository.name}`);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between border-b border-white/[0.06] px-6 py-6">
        <span
          className="text-xs uppercase tracking-[0.2em]"
          style={{
            fontFamily: FONT_MONO,
          }}
        >
          Compass
        </span>

        <span
          className="text-[11px] text-neutral-600"
          style={{
            fontFamily: FONT_MONO,
          }}
        >
          finding your next contribution
        </span>
      </header>

      <main className="mx-auto flex min-h-[75vh] w-full max-w-4xl items-center px-6 py-16">
        <div className="w-full">
          {/* IDLE */}

          {status === "idle" && (
            <div className="max-w-xl">
              <p
                className="mb-4 text-[11px] uppercase tracking-[0.2em] text-neutral-500"
                style={{
                  fontFamily: FONT_MONO,
                }}
              >
                Open source discovery
              </p>

              <h1
                className="text-5xl leading-[1.05] tracking-tight"
                style={{
                  fontFamily: FONT_DISPLAY,
                }}
              >
                Find a project worth
                <br />
                contributing to.
              </h1>

              <p className="mt-6 max-w-lg text-base leading-relaxed text-neutral-400">
                Compass will analyze your product-building identity and find one
                open-source project where your skills actually fit.
              </p>

              <button
                onClick={() => dispatch(findOssRepository())}
                className="mt-8 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-neutral-200"
              >
                Find my project →
              </button>
            </div>
          )}

          {/* LOADING */}

          {status === "loading" && (
            <div className="max-w-xl">
              <p
                className="mb-5 text-[11px] uppercase tracking-[0.2em] text-neutral-500"
                style={{
                  fontFamily: FONT_MONO,
                }}
              >
                Compass is working
              </p>

              <h1
                className="text-5xl leading-[1.05] tracking-tight"
                style={{
                  fontFamily: FONT_DISPLAY,
                }}
              >
                Finding your
                <br />
                best match.
              </h1>

              <div className="mt-10 space-y-4">
                <LoadingStep label="Reading your developer profile" active />

                <LoadingStep
                  label="Understanding what you like to build"
                  active
                />

                <LoadingStep label="Searching open source" active />

                <LoadingStep label="Selecting the strongest match" />
              </div>
            </div>
          )}

          {/* ERROR */}

          {status === "failed" && (
            <div className="max-w-xl">
              <p
                className="text-[11px] uppercase tracking-[0.2em] text-red-400"
                style={{
                  fontFamily: FONT_MONO,
                }}
              >
                Discovery failed
              </p>

              <h1
                className="mt-4 text-4xl"
                style={{
                  fontFamily: FONT_DISPLAY,
                }}
              >
                Something went wrong.
              </h1>

              <p className="mt-4 text-sm text-neutral-400">{error}</p>

              <button
                onClick={handleRetry}
                className="mt-8 rounded-lg border border-white/10 px-5 py-3 text-sm transition hover:bg-white/5"
              >
                Try again
              </button>
            </div>
          )}

          {/* RESULT */}

          {status === "succeeded" && repository && (
            <div className="max-w-2xl">
              <p
                className="mb-4 text-[11px] uppercase tracking-[0.2em] text-neutral-500"
                style={{
                  fontFamily: FONT_MONO,
                }}
              >
                Your best match
              </p>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8">
                <div className="flex items-start justify-between gap-8">
                  <div>
                    <h1
                      className="text-4xl tracking-tight"
                      style={{
                        fontFamily: FONT_DISPLAY,
                      }}
                    >
                      {repository.fullName}
                    </h1>

                    <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                      {repository.description}
                    </p>
                  </div>

                  <div
                    className="shrink-0 text-right"
                    style={{
                      fontFamily: FONT_MONO,
                    }}
                  >
                    <p className="text-3xl">{repository.fitScore}</p>

                    <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                      match
                    </p>
                  </div>
                </div>

                <div className="mt-8 border-t border-white/[0.08] pt-6">
                  <p
                    className="mb-3 text-[10px] uppercase tracking-[0.16em] text-neutral-500"
                    style={{
                      fontFamily: FONT_MONO,
                    }}
                  >
                    Why this fits you
                  </p>

                  <p className="text-sm leading-relaxed text-neutral-300">
                    {repository.whyItMatches}
                  </p>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-white/[0.08] pt-6">
                  <div
                    className="text-[11px] text-neutral-500"
                    style={{
                      fontFamily: FONT_MONO,
                    }}
                  >
                    {repository.primaryTechnology}
                    {" · "}
                    {repository.difficulty}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleViewIssues}
                      className="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/5"
                    >
                      View open issues →
                    </button>

                    <a
                      href={repository.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
                    >
                      Explore repository →
                    </a>
                  </div>
                </div>
              </div>

              <button
                onClick={handleRetry}
                className="mt-6 text-xs text-neutral-500 transition hover:text-white"
              >
                Find another match
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function LoadingStep({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-2 w-2 rounded-full ${
          active ? "animate-pulse bg-white" : "bg-neutral-800"
        }`}
      />

      <span
        className={
          active ? "text-sm text-neutral-300" : "text-sm text-neutral-600"
        }
      >
        {label}
      </span>
    </div>
  );
}

export default AgentPage;
