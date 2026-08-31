import { useState } from "react";
import type { StepNode } from "../utils/agentStream";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";
const SANDBOX_TOOL_PATTERN = /sandbox|bash|shell|exec|terminal|cmd/i;

// eslint-disable-next-line react-refresh/only-export-components
export function isSandboxTool(name: string) {
  return SANDBOX_TOOL_PATTERN.test(name);
}

function extractCommand(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  const command = a.command ?? a.cmd ?? a.script ?? a.input;
  return typeof command === "string" ? command : null;
}

export function StepTrace({ steps }: { steps: StepNode[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <StepRow key={stepKey(step, i)} step={step} />
      ))}
    </div>
  );
}

function stepKey(step: StepNode, i: number) {
  if (step.kind === "reasoning") return `r-${step.id}`;
  if (step.kind === "tool_call") return `t-${step.id}`;
  return `th-${step.threadId}-${i}`;
}

function StepRow({ step }: { step: StepNode }) {
  if (step.kind === "reasoning") {
    return (
      <div className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0">
        <div className="flex items-center gap-1.5">
          <StatusDot done={step.done} />
          <span
            className="text-[10.5px] uppercase tracking-wide text-[#EDECEC]/45"
            style={{ fontFamily: MONO }}
          >
            Reasoning
          </span>
        </div>
        <p className="mt-1 pl-3 text-[12.5px] leading-relaxed text-[#EDECEC]/60">
          {truncate(step.content, 320) || "…"}
        </p>
      </div>
    );
  }

  if (step.kind === "tool_call") {
    if (isSandboxTool(step.name)) return <SandboxRow step={step} />;
    return (
      <div className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0">
        <div className="flex items-center gap-1.5">
          <StatusDot done={step.status === "done"} />
          <span className="text-[12.5px] font-medium text-[#EDECEC]/90">
            {step.name}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-[#EDECEC]/40">
            {step.status === "done" ? "done" : "running"}
          </span>
        </div>
        {step.args !== undefined && step.args !== null && (
          <p
            className="mt-1 truncate pl-3 text-[11px] text-[#EDECEC]/40"
            style={{ fontFamily: MONO }}
          >
            {truncate(safeStringify(step.args), 140)}
          </p>
        )}
      </div>
    );
  }

  return <ThreadRow step={step} />;
}

function SandboxRow({
  step,
}: {
  step: Extract<StepNode, { kind: "tool_call" }>;
}) {
  const command = extractCommand(step.args);
  return (
    <div className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-1.5">
        <StatusDot done={step.status === "done"} />
        <span className="text-[10.5px] uppercase tracking-wide text-[#D39237]/80">
          Sandbox
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[#EDECEC]/40">
          {step.status === "done" ? "done" : "running"}
        </span>
      </div>
      <div className="mt-1.5 overflow-x-auto rounded bg-black/40 p-2.5">
        <p
          className="whitespace-pre-wrap text-[11.5px] text-[#8FE388]"
          style={{ fontFamily: MONO }}
        >
          $ {command ?? truncate(safeStringify(step.args), 200)}
        </p>
        {step.result && (
          <p
            className="mt-1.5 whitespace-pre-wrap border-t border-white/[0.08] pt-1.5 text-[11px] text-[#EDECEC]/55"
            style={{ fontFamily: MONO }}
          >
            {truncate(step.result, 1200)}
          </p>
        )}
      </div>
    </div>
  );
}

function ThreadRow({ step }: { step: Extract<StepNode, { kind: "thread" }> }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <StatusDot done={step.done} />
        <span className="text-[10.5px] uppercase tracking-wide text-[#EDECEC]/50">
          Sub-agent
        </span>
        <span className="text-[12.5px] font-medium text-[#EDECEC]/95">
          {step.agentName}
        </span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 9 9"
          fill="none"
          className={`ml-auto shrink-0 text-[#EDECEC]/35 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path
            d="M2 1l4.5 3.5L2 8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 border-l border-white/[0.08] pl-3">
          {step.steps.length > 0 ? (
            <StepTrace steps={step.steps} />
          ) : (
            <p className="text-[11.5px] text-[#EDECEC]/30">Starting…</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ done }: { done: boolean }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-[#EDECEC]/35" : "bg-[#D39237]"}`}
    />
  );
}

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeStringify(value: unknown) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
