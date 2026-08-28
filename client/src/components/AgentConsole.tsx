import type { AgentActivityEvent, AuthUrl } from "../store/agentStream";
import type { AgentRunStatus } from "../store/profileSlice";

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface AgentConsoleProps {
  agentName: string;
  status: AgentRunStatus;
  activity: AgentActivityEvent[];
  authUrls: AuthUrl[];
  onResume: () => void;
}

/**
 * A live terminal-style feed of what the agent is doing right now — each
 * MCP tool call and its result streams in as its own row, in order, so the
 * person watching never has to guess whether anything is happening.
 */
export default function AgentConsole({
  agentName,
  status,
  activity,
  authUrls,
  onResume,
}: AgentConsoleProps) {
  // Pair each tool_call with its matching tool_result so we can render one
  // row per tool that fills in from "running" to "done".
  const rows = activity.filter((e) => e.type === "tool_call") as Extract<
    AgentActivityEvent,
    { type: "tool_call" }
  >[];

  const resultsByTool = new Map<string, number>();
  activity.forEach((e, i) => {
    if (e.type === "tool_result") resultsByTool.set(`${e.tool}-${i}`, i);
  });

  function isResolved(tool: string, callIndex: number) {
    return activity.some(
      (e, i) => e.type === "tool_result" && e.tool === tool && i > callIndex,
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#070908]">
      <style>{`
        @keyframes consoleRowIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .console-row { animation: consoleRowIn 0.35s ease both; }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .live-dot { animation: pulseDot 1.4s ease-in-out infinite; }
        @keyframes blinkCursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .console-cursor { animation: blinkCursor 1s step-end infinite; }
      `}</style>

      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === "running" || status === "connecting"
                ? "live-dot bg-emerald-500"
                : status === "failed"
                  ? "bg-rose-500"
                  : "bg-emerald-700"
            }`}
          />
          <p
            className="text-[11px] uppercase tracking-[0.16em] text-neutral-400"
            style={{ fontFamily: FONT_MONO }}
          >
            {agentName}
          </p>
        </div>
        <p
          className="text-[10px] text-neutral-600"
          style={{ fontFamily: FONT_MONO }}
        >
          {status === "connecting"
            ? "connecting…"
            : status === "running"
              ? "live"
              : status}
        </p>
      </div>

      <div className="max-h-80 space-y-1 overflow-y-auto px-4 py-4">
        {status === "connecting" && rows.length === 0 && (
          <p
            className="console-row text-[13px] text-neutral-500"
            style={{ fontFamily: FONT_MONO }}
          >
            opening session…
          </p>
        )}

        {rows.map((call, i) => {
          const done = isResolved(call.tool, activity.indexOf(call));
          return (
            <div
              key={call.id}
              className="console-row flex items-start gap-3 py-1.5"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span
                className={`mt-1 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border text-[8px] ${
                  done
                    ? "border-emerald-700 bg-emerald-900/40 text-emerald-400"
                    : "live-dot border-emerald-800 text-emerald-600"
                }`}
              >
                {done ? "✓" : "○"}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] text-neutral-200">{call.label}</p>
                <p
                  className="truncate text-[11px] text-neutral-500"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {call.description} · {call.tool}
                </p>
              </div>
            </div>
          );
        })}

        {(status === "running" || status === "connecting") && (
          <div className="flex items-center gap-1 pt-1 pl-6">
            <span
              className="text-[13px] text-emerald-600"
              style={{ fontFamily: FONT_MONO }}
            >
              thinking
            </span>
            <span
              className="console-cursor text-[13px] text-emerald-600"
              style={{ fontFamily: FONT_MONO }}
            >
              ▍
            </span>
          </div>
        )}
      </div>

      {status === "auth_required" && (
        <div className="border-t border-white/[0.06] bg-amber-500/[0.04] px-4 py-3.5">
          <p className="text-[13px] text-amber-300">
            GitHub needs you to authorize this session before the agent can
            continue.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {authUrls.map((auth) => (
              <a
                key={auth.name}
                href={auth.authUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-amber-700/40 px-3 py-1.5 text-[12px] text-amber-300 hover:bg-amber-900/20"
              >
                Authorize {auth.name} →
              </a>
            ))}
            <button
              onClick={onResume}
              className="rounded-md bg-[#123524] px-3 py-1.5 text-[12px] text-white hover:bg-[#17472f]"
            >
              I've authorized — continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
