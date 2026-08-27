import Nav from "../components/Nav";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import { runRepoAgent, resumeRepoAgent } from "../store/reposSlice";

export default function Discover() {
  const dispatch = useAppDispatch();

  const {
    data: repos,
    status,
    error,
    authUrls,
  } = useAppSelector((s) => s.repos);

  const isRunning = status === "running";
  const isAuthRequired = status === "auth_required";

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="mb-4 font-mono-brand text-[11px] uppercase tracking-[0.22em] text-neutral-500">
          Stage 2 — Find your fit
        </p>

        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-3xl text-white">
            Repos worth contributing to
          </h1>

          <button
            onClick={() => dispatch(runRepoAgent(status === "succeeded"))}
            disabled={isRunning || isAuthRequired}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning
              ? "Searching…"
              : isAuthRequired
                ? "Authorization required"
                : status === "succeeded"
                  ? "Search again"
                  : "Search repos"}
          </button>
        </div>

        {/* --------------------------------------------------------------- */}
        {/* Idle */}
        {/* --------------------------------------------------------------- */}

        {status === "idle" && (
          <p className="text-sm text-neutral-500">
            Hit "Search repos" to match your developer profile against real,
            actively maintained projects.
          </p>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Running */}
        {/* --------------------------------------------------------------- */}

        {status === "running" && (
          <p className="text-sm text-neutral-500">
            Matching your profile against real repos…
          </p>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Authorization required */}
        {/* --------------------------------------------------------------- */}

        {status === "auth_required" && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
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
                    className="rounded-md bg-white px-4 py-2 text-center text-sm font-medium text-black transition-colors hover:bg-neutral-200"
                  >
                    Authorize {auth.name}
                  </a>
                ))}
              </div>
            )}

            <button
              onClick={() => dispatch(resumeRepoAgent())}
              className="mt-4 rounded-md border border-white/15 px-4 py-2 text-sm text-white transition-colors hover:bg-white/5"
            >
              I've authorized — Continue
            </button>
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Failed */}
        {/* --------------------------------------------------------------- */}

        {status === "failed" && (
          <div className="rounded-lg border border-fail/30 bg-fail/5 p-5">
            <p className="text-sm text-fail">{error}</p>

            <button
              onClick={() => dispatch(runRepoAgent(true))}
              className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Recommendations */}
        {/* --------------------------------------------------------------- */}

        {status === "succeeded" && repos && (
          <div className="grid gap-5 sm:grid-cols-2">
            {repos.map((repo) => (
              <a
                key={repo.url}
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/[0.06] p-5 transition-colors hover:border-white/20"
              >
                <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  {repo.repoType}
                </p>

                <h2 className="mt-2 font-display text-lg text-white">
                  {repo.name}
                </h2>

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
      </main>
    </div>
  );
}
