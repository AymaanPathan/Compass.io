import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { fetchIssuesForRepo } from "../store/issuesSlice";
import IssueCard from "./IssueCard";

interface IssuesPanelProps {
  repoFullName: string;
}

function IssuesPanel({ repoFullName }: IssuesPanelProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { issues, status, error } = useSelector(
    (state: RootState) => state.issues,
  );

  const handleFindIssues = () => {
    dispatch(fetchIssuesForRepo(repoFullName));
  };

  return (
    <div>
      <button
        onClick={handleFindIssues}
        disabled={status === "loading"}
        className="text-xs px-4 py-2 rounded-md bg-white text-black font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
      >
        {status === "loading" ? "Finding issues..." : "Find Issues"}
      </button>

      {status === "failed" && (
        <p className="text-xs text-red-400 mt-3">{error}</p>
      )}

      {status === "succeeded" && issues.length === 0 && (
        <p className="text-xs text-neutral-600 mt-3">No open issues found.</p>
      )}

      <div className="flex flex-col gap-2 mt-3">
        {issues.map((issue) => (
          <IssueCard
            key={issue.number}
            issue={issue}
            repoFullName={repoFullName}
          />
        ))}
      </div>
    </div>
  );
}

export default IssuesPanel;
