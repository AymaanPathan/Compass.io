// client/src/components/SolverTabs.tsx
import { useState } from "react";
import MarkdownReport from "./MarkdownReport";
import DiffViewer from "./DiffViewer";
import type {
  ParsedSolverReport,
  ChangedFile,
} from "../utils/parseSolverReport";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

type TabId = "overview" | "files" | "diff" | "tests" | "reasoning";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "files", label: "Files" },
  { id: "diff", label: "Diff" },
  { id: "tests", label: "Tests" },
  { id: "reasoning", label: "Reasoning" },
];

const STATUS_STYLES: Record<string, string> = {
  IMPLEMENTED: "bg-emerald-500/15 text-emerald-400",
  PARTIALLY_IMPLEMENTED: "bg-[#D39237]/15 text-[#D39237]",
  BLOCKED: "bg-red-500/15 text-red-400",
  NO_CHANGE_REQUIRED: "bg-white/[0.08] text-[#EDECEC]/60",
};

const OP_BADGE: Record<string, string> = {
  MODIFIED: "bg-[#D39237]/15 text-[#D39237]",
  ADDED: "bg-emerald-500/15 text-emerald-400",
  DELETED: "bg-red-500/15 text-red-400",
  UNKNOWN: "bg-white/[0.08] text-[#EDECEC]/50",
};

export default function SolverTabs({ parsed }: { parsed: ParsedSolverReport }) {
  const [active, setActive] = useState<TabId>("overview");
  const failedVerification = parsed.verification.filter(
    (v) => v.status === "FAIL",
  ).length;
  const gateFailures = parsed.statusGate.filter(
    (g) => g.passed === false,
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2.5">
          <p className="text-[15px] font-medium text-[#EDECEC]">
            Solver Result
          </p>
          {parsed.status && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                STATUS_STYLES[parsed.status] ??
                "bg-white/[0.08] text-[#EDECEC]/60"
              }`}
            >
              {parsed.status.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-white/[0.08]">
        {TABS.map((tab) => {
          const badge =
            tab.id === "files" && parsed.files.length
              ? parsed.files.length
              : tab.id === "tests" && failedVerification > 0
                ? `${failedVerification} failing`
                : null;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-[12.5px] transition-colors ${
                active === tab.id
                  ? "text-[#EDECEC]"
                  : "text-[#EDECEC]/45 hover:text-[#EDECEC]/70"
              }`}
            >
              {tab.label}
              {badge !== null && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    tab.id === "tests" && failedVerification > 0
                      ? "bg-red-500/15 text-red-400"
                      : "bg-white/[0.08] text-[#EDECEC]/50"
                  }`}
                >
                  {badge}
                </span>
              )}
              {active === tab.id && (
                <span className="absolute inset-x-0 -bottom-px h-[1.5px] bg-[#D39237]" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {active === "overview" && (
          <OverviewTab parsed={parsed} gateFailures={gateFailures} />
        )}
        {active === "files" && <FilesTab files={parsed.files} />}
        {active === "diff" && <DiffViewer files={parsed.files} />}
        {active === "tests" && <TestsTab parsed={parsed} />}
        {active === "reasoning" && <ReasoningTab parsed={parsed} />}
      </div>
    </div>
  );
}

function OverviewTab({
  parsed,
  gateFailures,
}: {
  parsed: ParsedSolverReport;
  gateFailures: number;
}) {
  return (
    <div className="space-y-6">
      {parsed.issue && <MarkdownReport content={parsed.issue} />}
      {parsed.rootCause && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/40">
            Root cause
          </p>
          <MarkdownReport content={parsed.rootCause} />
        </div>
      )}
      {parsed.statusGate.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/40">
            Status gate
            {gateFailures > 0 && (
              <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                {gateFailures} failed
              </span>
            )}
          </p>
          <div className="space-y-1.5">
            {parsed.statusGate.map((g, i) => (
              <div key={i} className="flex items-start gap-2 text-[12.5px]">
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    g.passed === true
                      ? "bg-emerald-500/15 text-emerald-400"
                      : g.passed === false
                        ? "bg-red-500/15 text-red-400"
                        : "bg-white/[0.08] text-[#EDECEC]/40"
                  }`}
                >
                  {g.passed === true ? "✓" : g.passed === false ? "✕" : "?"}
                </span>
                <span className="text-[#EDECEC]/75">{g.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {parsed.diffSummary && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/40">
            Diff summary
          </p>
          <MarkdownReport content={parsed.diffSummary} />
        </div>
      )}
    </div>
  );
}

function FilesTab({ files }: { files: ChangedFile[] }) {
  if (files.length === 0) {
    return (
      <p className="text-[13px] text-[#EDECEC]/45">
        No files were reported as changed.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <FileCard key={`${f.path}-${i}`} file={f} />
      ))}
    </div>
  );
}

function FileCard({ file }: { file: ChangedFile }) {
  const [open, setOpen] = useState(false);
  const hasSnippets = file.before || file.after;
  return (
    <div className="overflow-hidden rounded-md border border-white/[0.08]">
      <button
        onClick={() => hasSnippets && setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left ${hasSnippets ? "hover:bg-white/[0.03]" : ""}`}
      >
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${OP_BADGE[file.operation]}`}
        >
          {file.operation}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12.5px] text-[#EDECEC]/90"
          style={{ fontFamily: MONO }}
        >
          {file.path}
        </span>
        {file.symbol && (
          <span
            className="shrink-0 text-[11px] text-[#EDECEC]/40"
            style={{ fontFamily: MONO }}
          >
            {file.symbol}
          </span>
        )}
      </button>
      {open && hasSnippets && (
        <div className="grid grid-cols-1 gap-px border-t border-white/[0.08] bg-white/[0.04] sm:grid-cols-2">
          {file.before && (
            <div className="bg-[#14120B] p-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-red-400/70">
                Before
              </p>
              <pre
                className="overflow-x-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-[#EDECEC]/70"
                style={{ fontFamily: MONO }}
              >
                {file.before}
              </pre>
            </div>
          )}
          {file.after && (
            <div className="bg-[#14120B] p-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-emerald-400/70">
                After
              </p>
              <pre
                className="overflow-x-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-[#EDECEC]/70"
                style={{ fontFamily: MONO }}
              >
                {file.after}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TestsTab({ parsed }: { parsed: ParsedSolverReport }) {
  return (
    <div className="space-y-6">
      {parsed.verification.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/40">
            Verification
          </p>
          <div className="space-y-1.5">
            {parsed.verification.map((v, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-md border border-white/[0.08] px-3.5 py-2.5"
              >
                <span
                  className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    v.status === "PASS"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : v.status === "FAIL"
                        ? "bg-red-500/15 text-red-400"
                        : v.status === "NOT RUN"
                          ? "bg-white/[0.08] text-[#EDECEC]/50"
                          : "bg-white/[0.05] text-[#EDECEC]/35"
                  }`}
                >
                  {v.status}
                </span>
                <div>
                  <p className="text-[12.5px] text-[#EDECEC]/85">{v.label}</p>
                  {v.note && (
                    <p className="mt-1 text-[12px] leading-relaxed text-[#EDECEC]/50">
                      {v.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {parsed.testsAdded ? (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/40">
            Tests added or updated
          </p>
          <MarkdownReport content={parsed.testsAdded} />
        </div>
      ) : (
        parsed.verification.length === 0 && (
          <p className="text-[13px] text-[#EDECEC]/45">
            No test results were reported.
          </p>
        )
      )}
    </div>
  );
}

function ReasoningTab({ parsed }: { parsed: ParsedSolverReport }) {
  const hasAny =
    parsed.changesMade || parsed.solverNotes || parsed.remainingIssues;
  if (!hasAny) {
    return (
      <p className="text-[13px] text-[#EDECEC]/45">
        No reasoning notes were reported for this run.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {parsed.changesMade && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/40">
            Changes made
          </p>
          <MarkdownReport content={parsed.changesMade} />
        </div>
      )}
      {parsed.solverNotes && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/40">
            Solver notes
          </p>
          <MarkdownReport content={parsed.solverNotes} />
        </div>
      )}
      {parsed.remainingIssues && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#EDECEC]/40">
            Remaining issues
          </p>
          <MarkdownReport content={parsed.remainingIssues} />
        </div>
      )}
    </div>
  );
}
