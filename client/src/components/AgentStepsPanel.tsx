import { useState } from "react";
import type { StepNode } from "../hooks/useAgentStep";

function highlight(json: string) {
  return json.split(/("(?:[^"\\]|\\.)*")/g).map((tok, i) => {
    if (tok.startsWith('"') && tok.endsWith('"')) {
      const isKey = json[json.indexOf(tok) + tok.length] === ":";
      const isUrl = /^"https?:\/\//.test(tok);
      const cls = isUrl
        ? "text-sky-400 underline"
        : isKey
          ? "text-violet-300"
          : "text-amber-300";
      return (
        <span key={i} className={cls}>
          {tok}
        </span>
      );
    }
    return <span key={i}>{tok}</span>;
  });
}

function JsonBlock({ value }: { value: unknown }) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="overflow-x-auto rounded-md bg-black/40 p-3 text-[12px] leading-5 text-zinc-300">
      <code>{highlight(text)}</code>
    </pre>
  );
}

function CollapsibleRow({
  icon,
  label,
  done,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  done: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-l border-zinc-800 pl-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-zinc-200 hover:text-white"
      >
        <span
          className={`inline-block w-3 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
        {icon}
        <span className="flex-1">{label}</span>
        {done && <span className="text-emerald-400">✓</span>}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="ml-5 space-y-2 pb-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

// `steps = []` default: previously this crashed with
// "Cannot read properties of undefined (reading 'filter')" whenever the
// parent passed `undefined` (e.g. before the Redux slice's stream state
// initializes, or if the wrong prop was threaded through). This is a
// defensive guard — the parent still shouldn't be passing undefined, but
// the component should never hard-crash on it either.
export default function AgentStepsPanel({ steps = [] }: { steps: StepNode[] }) {
  const [open, setOpen] = useState(true);
  const toolCallCount = steps.filter((s) => s.kind === "tool_call").length;
  const thoughtCount = steps.filter((s) => s.kind === "reasoning").length;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-200"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
          ›
        </span>
        Agent steps
        <span className="text-zinc-500">
          · {toolCallCount} tool call{toolCallCount === 1 ? "" : "s"} ·{" "}
          {thoughtCount} thought{thoughtCount === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <div className="space-y-1 px-4 pb-3">
          {steps.map((step) => {
            if (step.kind === "reasoning")
              return (
                <CollapsibleRow
                  key={step.id}
                  icon={<span>💭</span>}
                  label="Reasoning"
                  done={step.done}
                >
                  <p className="whitespace-pre-wrap text-[13px] text-zinc-400">
                    {step.content}
                    {!step.done && <span className="animate-pulse">▍</span>}
                  </p>
                </CollapsibleRow>
              );
            if (step.kind === "tool_call")
              return (
                <CollapsibleRow
                  key={step.id}
                  icon={<span>🔧</span>}
                  label={step.name}
                  done={step.status === "done"}
                >
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-indigo-300">
                      Request
                    </div>
                    <JsonBlock value={step.args} />
                  </div>
                  {step.result !== undefined && (
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-indigo-300">
                        Response
                      </div>
                      <JsonBlock value={tryParse(step.result)} />
                    </div>
                  )}
                </CollapsibleRow>
              );
            return (
              <CollapsibleRow
                key={step.threadId}
                icon={<span>🧵</span>}
                label={`${step.agentName} (sub-agent)`}
                done={step.done}
              >
                <AgentStepsPanel steps={step.steps} />
              </CollapsibleRow>
            );
          })}
        </div>
      )}
    </div>
  );
}

function tryParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
