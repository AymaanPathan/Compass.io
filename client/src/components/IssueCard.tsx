import { Link } from "react-router-dom";
import type { GithubIssue } from "../store/issuesSlice";

interface IssueCardProps {
  issue: GithubIssue;
  repoFullName: string;
}

function IssueCard({ issue, repoFullName }: IssueCardProps) {
  return (
    <Link
      to={`/repo/${repoFullName}/issue/${issue.number}`}
      className="group flex flex-col gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900/70"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-200 group-hover:text-white transition-colors">
          <span className="text-neutral-600">#{issue.number}</span>{" "}
          {issue.title}
        </p>

        <span className="shrink-0 text-[10px] uppercase tracking-wide text-emerald-400 bg-emerald-950/40 rounded-full px-2 py-0.5">
          {issue.state}
        </span>
      </div>

      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-neutral-950 border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-neutral-600">
          opened by {issue.author}
          {issue.createdAt &&
            ` · ${new Date(issue.createdAt).toLocaleDateString()}`}
        </p>

        <a
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
          // Nested inside a <Link>, so stop the click from also
          // triggering navigation to the deep-dive page.
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-[11px] text-neutral-600 hover:text-neutral-300 transition-colors"
        >
          GitHub ↗
        </a>
      </div>
    </Link>
  );
}

export default IssueCard;
