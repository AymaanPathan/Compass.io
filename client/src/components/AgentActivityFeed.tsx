// client/src/components/AgentActivityFeed.tsx
//
// Brighter, full-width version. Same StepNode[] contract as before.

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

function safeStringify(value: unknown) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type Category = "reasoning" | "thread" | "sandbox" | "issue" | "tool";
type ToolCallNode = Extract<StepNode, { kind: "tool_call" }>;

interface Group {
  key: string;
  category: Category;
  items: StepNode[];
}

function categorize(step: StepNode): Category {
  if (step.kind === "reasoning") return "reasoning";
  if (step.kind === "thread") return "thread";
  if (isSandboxTool(step.name)) return "sandbox";
  if (step.name === "issue_read") return "issue";
  return "tool";
}

function groupSteps(steps: StepNode[]): Group[] {
  const groups: Group[] = [];

  for (const step of steps) {
    const category = categorize(step);
    const mergeable =
      category === "sandbox" || category === "tool" || category === "issue";
    const last = groups[groups.length - 1];

    if (mergeable && last && last.category === category) {
      last.items.push(step);
    } else {
      groups.push({
        key: `${category}-${groups.length}-${idOf(step)}`,
        category,
        items: [step],
      });
    }
  }

  return groups;
}

function idOf(step: StepNode): string {
  if (step.kind === "reasoning") return step.id;
  if (step.kind === "tool_call") return step.id;
  return step.threadId;
}

export default function AgentActivityFeed({ steps }: { steps: StepNode[] }) {
  const groups = groupSteps(steps);

  return (
    <div className="relative space-y-3">
      {groups.map((g) => (
        <GroupBlock key={g.key} group={g} />
      ))}
    </div>
  );
}

function GroupBlock({ group }: { group: Group }) {
  switch (group.category) {
    case "reasoning":
      return (
        <ReasoningRow
          step={group.items[0] as Extract<StepNode, { kind: "reasoning" }>}
        />
      );
    case "thread":
      return (
        <ThreadBlock
          step={group.items[0] as Extract<StepNode, { kind: "thread" }>}
        />
      );
    case "sandbox":
      return <TerminalBlock items={group.items as ToolCallNode[]} />;
    case "issue":
      return <IssueReadBlock items={group.items as ToolCallNode[]} />;
    case "tool":
      return <ToolGroupBlock items={group.items as ToolCallNode[]} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reasoning
// ---------------------------------------------------------------------------

function ReasoningRow({
  step,
}: {
  step: Extract<StepNode, { kind: "reasoning" }>;
}) {
  const [open, setOpen] = useState(false);
  const preview = truncate(step.content.replace(/\s+/g, " ").trim(), 140);

  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="group flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.05]"
    >
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          step.done ? "bg-white/40" : "bg-[#D39237] animate-pulse"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] italic leading-relaxed text-white/70">
          {open ? step.content || "…" : preview || "Thinking…"}
        </p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sandbox terminal
// ---------------------------------------------------------------------------

function TerminalBlock({ items }: { items: ToolCallNode[] }) {
  const running = items.some((i) => i.status === "running");

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.12] bg-black shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2 border-b border-white/[0.1] bg-white/[0.04] px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span
          className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-white/55"
          style={{ fontFamily: MONO }}
        >
          sandbox · /workspace/repo
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${running ? "bg-[#D39237] animate-pulse" : "bg-emerald-500"}`}
          />
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-white/45">
            {running ? "running" : "idle"}
          </span>
        </span>
      </div>

      <div className="max-h-[460px] overflow-y-auto px-4 py-3.5">
        {items.map((step, i) => {
          const command =
            extractCommand(step.args) ??
            truncate(safeStringify(step.args), 200);
          const isLast = i === items.length - 1;

          return (
            <div
              key={step.id}
              className={
                i > 0 ? "mt-3.5 border-t border-white/[0.06] pt-3.5" : ""
              }
            >
              <p
                className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#8FE388]"
                style={{ fontFamily: MONO }}
              >
                <span className="select-none text-[#8FE388]/60">$ </span>
                {command}
                {isLast && step.status === "running" && (
                  <span className="ml-0.5 inline-block h-[13px] w-[6px] translate-y-[1px] animate-pulse bg-[#8FE388]/80 align-middle" />
                )}
              </p>
              {step.result ? (
                <p
                  className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-white/70"
                  style={{ fontFamily: MONO }}
                >
                  {truncate(step.result, 1600)}
                </p>
              ) : step.status === "running" ? (
                <p
                  className="mt-2 text-[12px] text-white/35"
                  style={{ fontFamily: MONO }}
                >
                  …
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// issue_read
// ---------------------------------------------------------------------------

function IssueReadBlock({ items }: { items: ToolCallNode[] }) {
  const last = items[items.length - 1];
  const done = items.every((i) => i.status === "done");

  return (
    <div className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-3.5">
      <div className="flex items-center gap-2">
        <StatusDot done={done} />
        <span
          className="text-[11px] font-semibold uppercase tracking-wide text-white/60"
          style={{ fontFamily: MONO }}
        >
          Reading issue
        </span>
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-white/35">
          {done ? "done" : "running"}
        </span>
      </div>
      {last.result && (
        <p className="mt-2.5 line-clamp-3 pl-3.5 text-[12.5px] leading-relaxed text-white/65">
          {truncate(last.result.replace(/\s+/g, " ").trim(), 320)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic tool calls
// ---------------------------------------------------------------------------

function ToolGroupBlock({ items }: { items: ToolCallNode[] }) {
  return (
    <div className="space-y-2.5 rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-3.5">
      {items.map((step) => (
        <div key={step.id} className="flex items-start gap-2.5">
          <StatusDot done={step.status === "done"} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-medium text-white/90">
                {step.name}
              </span>
              <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-wide text-white/35">
                {step.status === "done" ? "done" : "running"}
              </span>
            </div>
            {step.args !== undefined && step.args !== null && (
              <p
                className="mt-1 truncate text-[11.5px] text-white/45"
                style={{ fontFamily: MONO }}
              >
                {truncate(safeStringify(step.args), 160)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-agent threads
// ---------------------------------------------------------------------------

function ThreadBlock({
  step,
}: {
  step: Extract<StepNode, { kind: "thread" }>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-lg border border-[#D39237]/40 bg-[#D39237]/[0.06]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <StatusDot done={step.done} />
        <span
          className="text-[11px] font-semibold uppercase tracking-wide text-[#F3B368]"
          style={{ fontFamily: MONO }}
        >
          Sub-agent
        </span>
        <span className="truncate text-[13.5px] font-medium text-white/95">
          {step.agentName}
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 9 9"
          fill="none"
          className={`ml-auto shrink-0 text-white/50 transition-transform ${open ? "rotate-90" : ""}`}
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
        <div className="border-t border-[#D39237]/25 px-4 py-3.5">
          {step.agentInput && (
            <p className="mb-3 text-[12.5px] italic text-white/55">
              {truncate(step.agentInput, 220)}
            </p>
          )}
          {step.steps.length > 0 ? (
            <AgentActivityFeed steps={step.steps} />
          ) : (
            <p className="text-[12.5px] text-white/35">Starting…</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ done }: { done: boolean }) {
  return (
    <span
      className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-white/45" : "bg-[#D39237] animate-pulse"}`}
    />
  );
}
