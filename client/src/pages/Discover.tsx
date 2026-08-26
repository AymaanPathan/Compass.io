import Nav from "../components/Nav";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import { runRepoAgent } from "../store/reposSlice";

export default function Discover() {
  const dispatch = useAppDispatch();
  const { data: repos, status, error } = useAppSelector((s) => s.repos);

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono-brand text-[11px] uppercase tracking-[0.22em] text-neutral-500 mb-4">
          Stage 2 — Find your fit
        </p>

        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-3xl text-white">
            Repos worth contributing to
          </h1>

          <button
            onClick={() => dispatch(runRepoAgent(status === "succeeded"))}
            disabled={status === "running"}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
          >
            {status === "running"
              ? "Searching…"
              : status === "succeeded"
                ? "Search again"
                : "Search repos"}
          </button>
        </div>

        {status === "idle" && (
          <p className="text-sm text-neutral-500">
            Hit "Search repos" to match your developer profile against real,
            actively maintained projects.
          </p>
        )}

        {status === "running" && (
          <p className="text-sm text-neutral-500">
            Matching your profile against real repos…
          </p>
        )}

        {status === "failed" && (
          <div className="rounded-lg border border-fail/30 bg-fail/5 p-5">
            <p className="text-sm text-fail">{error}</p>
            <button
              onClick={() => dispatch(runRepoAgent(true))}
              className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        )}

        {status === "succeeded" && repos && (
          <div className="grid gap-5 sm:grid-cols-2">
            {repos.map((repo) => (
              <a
                key={repo.url}
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/[0.06] p-5 hover:border-white/20 transition-colors"
              >
                <p className="font-mono-brand text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  {repo.repoType}
                </p>
                <h2 className="mt-2 font-display text-lg text-white">{repo.name}</h2>
                <p className="mt-2 text-[13px] text-neutral-400">{repo.description}</p>
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