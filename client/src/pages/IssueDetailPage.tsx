import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { fetchIssueDeepDive } from "../store/investigationSlice";

function IssueDetailPage() {
  const { owner, repo, issueNumber } = useParams<{
    owner: string;
    repo: string;
    issueNumber: string;
  }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { data, status, error } = useSelector(
    (state: RootState) => state.investigation,
  );

  const repoFullName = `${owner}/${repo}`;
  const parsedIssueNumber = Number(issueNumber);

  useEffect(() => {
    if (!owner || !repo || !issueNumber) return;
    dispatch(
      fetchIssueDeepDive({ repoFullName, issueNumber: parsedIssueNumber }),
    );
    // repoFullName/parsedIssueNumber are derived from the same params;
    // only re-run when the actual route params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, issueNumber, dispatch]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-10 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-3.5">
          <button
            onClick={() => navigate(`/repo/${owner}/${repo}`)}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← Back to {repoFullName}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {status === "loading" && (
          <p className="text-sm text-neutral-500">Digging into the issue…</p>
        )}

        {status === "failed" && <p className="text-sm text-red-400">{error}</p>}

        {status === "succeeded" && data && (
          <>
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-lg font-semibold">
                  #{data.issueNumber} {data.title}
                </h1>
                <span className="shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5 text-emerald-400 bg-emerald-950/40">
                  {data.state}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                opened by {data.author}
              </p>
              <a
                href={`https://github.com/${data.repository}/issues/${data.issueNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-blue-400 hover:text-blue-300 hover:underline"
              >
                view on github
              </a>
            </section>

            <div className="mt-6 grid gap-4">
              <DetailCard
                title="What is the issue?"
                body={data.whatIsTheIssue}
              />
              <DetailCard
                title="What's happening now"
                body={data.whatIsHappeningNow}
              />
              <DetailCard
                title="What should happen"
                body={data.whatShouldHappen}
              />
              <DetailCard title="Why it matters" body={data.whyItMatters} />
              <DetailCard
                title="Who / what is affected"
                body={data.whoWhatIsAffected}
              />
              <DetailCard
                title="Where in the project"
                body={data.whereInTheProject}
              />

              {data.technicalConcepts.length > 0 && (
                <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
                  <h2 className="text-sm font-medium text-neutral-400 mb-3">
                    Technical concepts
                  </h2>
                  <ul className="space-y-2">
                    {data.technicalConcepts.map((concept, i) => (
                      <li
                        key={i}
                        className="text-sm text-neutral-300 leading-relaxed"
                      >
                        {concept}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.backgroundContext && (
                <DetailCard
                  title="Background context"
                  body={data.backgroundContext}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function DetailCard({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-sm font-medium text-neutral-400 mb-2">{title}</h2>
      <p className="text-sm text-neutral-300 leading-relaxed">{body}</p>
    </section>
  );
}

export default IssueDetailPage;
