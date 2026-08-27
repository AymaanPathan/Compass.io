const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

export type PipelineNodeStatus =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "auth_required";

export type PipelineNode = {
  key: string;
  label: string;
  agentName: string;
  status: PipelineNodeStatus;
};

const STATUS_STYLES: Record<
  PipelineNodeStatus,
  { dot: string; ring: string; text: string; label: string }
> = {
  idle: {
    dot: "bg-neutral-600",
    ring: "border-white/[0.08]",
    text: "text-neutral-500",
    label: "queued",
  },
  running: {
    dot: "bg-sky-400 animate-node-pulse",
    ring: "border-sky-700/40 bg-sky-500/[0.04]",
    text: "text-sky-400",
    label: "running",
  },
  succeeded: {
    dot: "bg-emerald-400",
    ring: "border-emerald-700/40 bg-emerald-900/[0.12]",
    text: "text-emerald-400",
    label: "done",
  },
  failed: {
    dot: "bg-rose-400",
    ring: "border-rose-700/40 bg-rose-500/[0.04]",
    text: "text-rose-400",
    label: "failed",
  },
  auth_required: {
    dot: "bg-amber-400",
    ring: "border-amber-700/40 bg-amber-500/[0.04]",
    text: "text-amber-400",
    label: "needs auth",
  },
};

function AgentPipeline({
  nodes,
  activeKey,
}: {
  nodes: PipelineNode[];
  activeKey: string;
}) {
  return (
    <div className="mb-10">
      <style>{`
        @keyframes nodePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.4); }
        }
        .animate-node-pulse { animation: nodePulse 1.8s ease-in-out infinite; }
      `}</style>

      <div className="flex items-stretch">
        {nodes.map((node, i) => {
          const s = STATUS_STYLES[node.status];
          const isActive = node.key === activeKey;

          return (
            <div key={node.key} className="flex flex-1 items-center">
              <div
                className={`flex-1 rounded-lg border px-4 py-3 transition-all duration-300 ${s.ring} ${
                  isActive ? "shadow-lg shadow-black/40" : "opacity-70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  <span
                    className={`text-[10px] uppercase tracking-[0.14em] ${s.text}`}
                    style={{ fontFamily: FONT_MONO }}
                  >
                    {s.label}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-medium text-white">
                  {node.label}
                </p>
                <p
                  className="text-[10px] text-neutral-500"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {node.agentName}
                </p>
              </div>

              {i < nodes.length - 1 && (
                <div className="mx-2 h-px w-6 shrink-0 bg-white/[0.08] sm:w-10" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AgentPipeline;