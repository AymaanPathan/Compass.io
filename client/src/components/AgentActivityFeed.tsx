import { UserCheck, FolderGit2, GitCommit, Search, Check, Loader2 } from "lucide-react";
import type { AgentActivityEvent, AuthUrl } from "../store/profileSlice";

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

const TOOL_ICONS: Record<string, typeof UserCheck> = {
  get_me: UserCheck,
  search_repositories: FolderGit2,
  list_commits: GitCommit,
  search_code: Search,
};

interface Props {
  activity: AgentActivityEvent[];
  status: "idle" | "connecting" | "running" | "auth_required" | "succeeded" | "failed";
  authUrls: AuthUrl[];
  onResume: () => void;
}

export default function AgentActivityFeed({ activity, status, authUrls, onResume }: Props) {
  // Collapse tool_call/tool_result pairs into one row per tool, in order seen.
  const rows = activity.reduce<{ tool: string; label: string; description?: string; resolved: boolean }[]>(
    (acc, event) => {
      const existing = acc.find((r) => r.tool === event.tool);
      if (event.type === "tool_call") {
        if (!existing) acc.push({ tool: event.tool, label: event.label, description: event.description, resolved: false });
      } else if (existing) {
        existing.resolved = true;
      }
      return acc;
    },
    [],
  );

  return (
    <div className="rounded-lg border border-emerald-900/30 bg-white/[0.02] p-5">
      <p
        className="mb-4 text-[10px] uppercase tracking-[0.16em] text-neutral-400"
        style={{ fontFamily: FONT_MONO }}
      >
        developer-profile-agent · live
      </p>

      <div className="space-y-3">
        {status === "connecting" && (
          <ActivityRow icon={<Loader2 className="h-4 w-4 animate-spin" />} label="Connecting to agent" pending />
        )}

        {rows.map((row) => {
          const Icon = TOOL_ICONS[row.tool] ?? Search;
          return (
            <ActivityRow
              key={row.tool}
              icon={
                row.resolved ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Icon className="h-4 w-4 animate-pulse text-emerald-500" />
                )
              }
              label={row.label}
              description={row.description}
              pending={!row.resolved}
            />
          );
        })}

        {status === "running" && rows.length > 0 && rows.every((r) => r.resolved) && (
          <ActivityRow
            icon={<Loader2 className="h-4 w-4 animate-spin" />}
            label="Writing your profile"
            description="Turning the evidence into a summary"
            pending
          />
        )}
      </div>

      {status === "auth_required" && (
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <p className="text-sm text-neutral-300">GitHub authorization is required to continue.</p>
          <div className="mt-3 flex flex-col gap-2">
            {authUrls.map((auth) => (
              <a
                key={auth.name}
                href={auth.authUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-[#123524] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#17472f]"
              >
                Authorize {auth.name}
              </a>
            ))}
          </div>
          <button
            onClick={onResume}
            className="mt-3 w-full rounded-md border border-emerald-800/40 px-4 py-2 text-sm text-white hover:bg-emerald-950/30"
          >
            I've authorized — Continue
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  icon,
  label,
  description,
  pending,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  pending?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 animate-[fadeIn_0.3s_ease]">
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-emerald-900/40 bg-emerald-950/30">
        {icon}
      </span>
      <div>
        <p className={`text-[13px] ${pending ? "text-neutral-200" : "text-neutral-400"}`}>{label}</p>
        {description && <p className="text-[11px] text-neutral-500">{description}</p>}
      </div>
    </div>
  );
}