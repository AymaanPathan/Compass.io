/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import IssueFinderStage from "../components/issueFinderStage";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import {
  startIssueFinder,
  answerIssueFinderQuestion,
  resumeIssueFinderStream,
  fetchCachedIssues,
  selectIssueFinder,
  type SelectedRepository,
} from "../store/issueFinderSlice";
import {
  fetchCachedRecommendations,
  selectRecommendations,
} from "../store/recommendationsSlice";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

function IssueFinderContent() {
  const dispatch = useAppDispatch();
  const issueFinder = useAppSelector(selectIssueFinder);
  const recommendations = useAppSelector(selectRecommendations);

  const [selected, setSelected] = useState<SelectedRepository | null>(
    issueFinder.selectedRepository,
  );

  useEffect(() => {
    if (issueFinder.status === "idle" && !issueFinder.data) {
      dispatch(fetchCachedIssues());
    }
    if (!recommendations.data) {
      dispatch(fetchCachedRecommendations());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default to the top-ranked matched repo once recommendations load, if the
  // user hasn't already picked one this session.
  useEffect(() => {
    if (!selected && recommendations.data && recommendations.data.length > 0) {
      const top = recommendations.data[0];
      setSelected({
        name: top.name,
        url: top.url,
        description: top.description,
      });
    }
  }, [recommendations.data, selected]);

  const repoOptions = recommendations.data ?? [];

  return (
    <div className="flex flex-col">
      {repoOptions.length > 0 && issueFinder.status === "idle" && (
        <div className="flex items-center gap-2 border-b border-white/[0.08] bg-[#14120B] px-5 py-2.5">
          <label
            className="text-[11px] uppercase tracking-wide text-[#EDECEC]/45"
            style={{ fontFamily: MONO }}
          >
            Repository
          </label>
          <select
            value={selected?.url ?? ""}
            onChange={(e) => {
              const repo = repoOptions.find((r) => r.url === e.target.value);
              if (repo) {
                setSelected({
                  name: repo.name,
                  url: repo.url,
                  description: repo.description,
                });
              }
            }}
            className="rounded-md border border-white/[0.12] bg-[#1B1911] px-2.5 py-1.5 text-[12.5px] text-[#EDECEC]/85"
          >
            {repoOptions.map((r) => (
              <option key={r.url} value={r.url}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <IssueFinderStage
        selectedRepository={selected}
        status={issueFinder.status}
        issues={issueFinder.data?.matchedIssues ?? null}
        steps={issueFinder.steps}
        authUrls={issueFinder.authUrls}
        pendingQuestion={issueFinder.pendingQuestion}
        qaHistory={issueFinder.qaHistory}
        error={issueFinder.error}
        cached={issueFinder.cached}
        onStart={() => selected && dispatch(startIssueFinder(selected))}
        onAnswer={(answer) => dispatch(answerIssueFinderQuestion(answer))}
        onResume={() => dispatch(resumeIssueFinderStream())}
      />
    </div>
  );
}

export default function IssueFinder() {
  return (
    <AppLayout>
      <IssueFinderContent />
    </AppLayout>
  );
}
