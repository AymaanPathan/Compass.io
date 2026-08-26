import { useNavigate } from "react-router-dom";

export type PipelineNodeStatus =
  | "idle"
  | "running"
  | "succeeded"
  | "blocked"
  | "failed"
  | "locked";

export interface PipelineNode {
  key: string;
  label: string;
  agentName: string;
  status: PipelineNodeStatus;
  to?: string;
}

const DOT_STYLES: Record<PipelineNodeStatus, string> = {
  idle: "bg-neutral-700",
  locked: "bg-neutral-800",
  running: "bg-run agent-pulse",
  succeeded: "bg-ok",
  blocked: "bg-blocked",
  failed: "bg-fail",
};

const LINE_STYLES: Record<PipelineNodeStatus, string> = {
  idle: "bg-neutral-800",
  locked: "bg-neutral-900",
  running: "bg-gradient-to-r from-ok to-run",
  succeeded: "bg-ok/60",
  blocked: "bg-blocked/60",
  failed: "bg-fail/60",
};

export default function AgentPipeline({
  nodes,
  activeKey,
}: {
  nodes: PipelineNode[];
  activeKey?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center overflow-x-auto thin-scroll pb-2">
      {nodes.map((node, i) => (
        <div key={node.key} className="flex items-center flex-shrink-0">
          <button
            disabled={!node.to || node.status === "locked"}
            onClick={() => node.to && navigate(node.to)}
            className={`group flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-left transition-colors ${
              node.key === activeKey
                ? "border-white/25 bg-white/[0.06]"
                : "border-white/[0.06] hover:border-white/15"
            } ${node.to && node.status !== "locked" ? "cursor-pointer" : "cursor-default"}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${DOT_STYLES[node.status]}`}
              />
              <span className="text-[13px] text-white">{node.label}</span>
            </div>
            <span
              className="text-[10px] tracking-wide text-neutral-600"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {node.agentName}
            </span>
          </button>

          {i < nodes.length - 1 && (
            <div
              className={`mx-1 h-px w-8 flex-shrink-0 ${LINE_STYLES[node.status]}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
