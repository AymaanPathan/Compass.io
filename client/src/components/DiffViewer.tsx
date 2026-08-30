// client/src/components/DiffViewer.tsx
import { useState } from "react";
import type { ChangedFile } from "../utils/parseSolverReport";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface DiffLine {
  type: "add" | "remove" | "context" | "meta";
  content: string;
}

function parseHunk(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      lines.push({ type: "meta", content: line });
    } else if (line.startsWith("+")) {
      lines.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      lines.push({ type: "remove", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      lines.push({ type: "context", content: line.slice(1) });
    } else if (line.trim().length) {
      lines.push({ type: "context", content: line });
    }
  }
  return lines;
}

const OP_BADGE: Record<string, string> = {
  MODIFIED: "bg-[#D39237]/15 text-[#D39237]",
  ADDED: "bg-emerald-500/15 text-emerald-400",
  DELETED: "bg-red-500/15 text-red-400",
  UNKNOWN: "bg-white/[0.08] text-[#EDECEC]/50",
};

export default function DiffViewer({ files }: { files: ChangedFile[] }) {
  const withDiff = files.filter((f) => f.diff.trim().length > 0);

  if (withDiff.length === 0) {
    return (
      <p className="text-[13px] text-[#EDECEC]/45">
        No diff was reported for this run.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {withDiff.map((file, i) => (
        <DiffFileBlock key={`${file.path}-${i}`} file={file} />
      ))}
    </div>
  );
}

function DiffFileBlock({ file }: { file: ChangedFile }) {
  const [open, setOpen] = useState(true);
  const lines = parseHunk(file.diff);
  const additions = lines.filter((l) => l.type === "add").length;
  const deletions = lines.filter((l) => l.type === "remove").length;

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.08]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 bg-white/[0.03] px-3.5 py-2 text-left hover:bg-white/[0.05]"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${OP_BADGE[file.operation]}`}
          >
            {file.operation}
          </span>
          <span
            className="truncate text-[12.5px] text-[#EDECEC]/85"
            style={{ fontFamily: MONO }}
          >
            {file.path}
          </span>
          {file.symbol && (
            <span
              className="shrink-0 text-[11px] text-[#EDECEC]/40"
              style={{ fontFamily: MONO }}
            >
              · {file.symbol}
            </span>
          )}
        </div>
        <span
          className="ml-3 flex shrink-0 items-center gap-2 text-[11px]"
          style={{ fontFamily: MONO }}
        >
          <span className="text-emerald-400">+{additions}</span>
          <span className="text-red-400">-{deletions}</span>
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto" style={{ fontFamily: MONO }}>
          {lines.map((line, i) => (
            <div
              key={i}
              className={`whitespace-pre px-3.5 py-[1px] text-[12px] leading-relaxed ${
                line.type === "add"
                  ? "bg-emerald-500/[0.08] text-emerald-300"
                  : line.type === "remove"
                    ? "bg-red-500/[0.08] text-red-300"
                    : line.type === "meta"
                      ? "bg-[#D39237]/[0.06] text-[#D39237]/70"
                      : "text-[#EDECEC]/55"
              }`}
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              {line.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
