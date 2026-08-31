/* eslint-disable @typescript-eslint/no-explicit-any */
// client/src/utils/parseSolverReport.ts

export type SolverStatusValue =
  | "IMPLEMENTED"
  | "PARTIALLY_IMPLEMENTED"
  | "BLOCKED"
  | "NO_CHANGE_REQUIRED";

export interface StatusGateItem {
  label: string;
  passed: boolean | null; // null = couldn't parse yes/no
}

export interface VerificationItem {
  label: string;
  status: "PASS" | "FAIL" | "NOT RUN" | "UNKNOWN";
  note?: string;
}

export interface ChangedFile {
  path: string;
  operation: "MODIFIED" | "ADDED" | "DELETED" | "UNKNOWN";
  symbol?: string;
  before: string | null;
  after: string | null;
  /** Real `git diff` hunk(s) for this file/symbol, e.g. "@@ -7,7 +7,7 @@\n ...". */
  diff: string;
}

export interface ParsedSolverReport {
  status: SolverStatusValue | null;
  statusGate: StatusGateItem[];
  issue: string;
  rootCause: string;
  changesMade: string;
  files: ChangedFile[];
  testsAdded: string;
  verification: VerificationItem[];
  diffSummary: string;
  remainingIssues: string;
  solverNotes: string;
  raw: string;
}

/**
 * Pulls the <CHANGED_FILES>{...}</CHANGED_FILES> block out of the raw
 * report and parses its `files` array. Returns the parsed files plus the
 * report text with that block stripped out, so it doesn't leak into the
 * "Changes Made" section's prose when we split by ## headers next.
 */
function extractChangedFiles(raw: string): {
  files: ChangedFile[];
  cleaned: string;
} {
  const match = raw.match(/<CHANGED_FILES>([\s\S]*?)<\/CHANGED_FILES>/);
  if (!match) return { files: [], cleaned: raw };

  const cleaned =
    raw.slice(0, match.index) + raw.slice(match.index! + match[0].length);

  const inner = match[1];
  const jsonStart = inner.indexOf("{");
  const jsonEnd = inner.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return { files: [], cleaned };

  try {
    const parsed = JSON.parse(inner.slice(jsonStart, jsonEnd + 1));
    const rawFiles = Array.isArray(parsed?.files) ? parsed.files : [];
    const files: ChangedFile[] = rawFiles.map((f: any) => ({
      path: String(f?.path ?? "unknown"),
      operation: (["MODIFIED", "ADDED", "DELETED"].includes(f?.operation)
        ? f.operation
        : "UNKNOWN") as ChangedFile["operation"],
      symbol: f?.symbol || undefined,
      before: typeof f?.before === "string" ? f.before : null,
      after: typeof f?.after === "string" ? f.after : null,
      diff: typeof f?.diff === "string" ? f.diff : "",
    }));
    return { files, cleaned };
  } catch {
    // Malformed JSON from the model — degrade gracefully, Files/Diff tabs
    // just show "nothing reported" instead of crashing the whole render.
    return { files: [], cleaned };
  }
}

/** Splits a markdown report into sections keyed by lowercased `## Header` text. */
function splitSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let currentKey = "_preamble";
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    sections[currentKey] = sections[currentKey]
      ? `${sections[currentKey]}\n${text}`
      : text;
    buffer = [];
  };

  for (const line of markdown.split("\n")) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      currentKey = match[1].trim().toLowerCase();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function parseStatusGate(section: string | undefined): StatusGateItem[] {
  if (!section) return [];
  const out: StatusGateItem[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*\d+\.\s*(.+?):\s*(yes|no)\s*$/i);
    if (m)
      out.push({ label: m[1].trim(), passed: m[2].toLowerCase() === "yes" });
  }
  return out;
}

function parseVerification(section: string | undefined): VerificationItem[] {
  if (!section) return [];
  const out: VerificationItem[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-") && !trimmed.startsWith("*")) continue;
    const m = trimmed.match(
      /^[-*]\s*(.+?)\s*[—-]{1,2}\s*(PASS|FAIL|NOT RUN)\b\s*(?:\((.+)\))?\s*$/i,
    );
    if (m) {
      out.push({
        label: m[1].trim(),
        status: m[2].toUpperCase() as VerificationItem["status"],
        note: m[3]?.trim(),
      });
    } else {
      const cleaned = trimmed.replace(/^[-*]\s*/, "").trim();
      if (cleaned) out.push({ label: cleaned, status: "UNKNOWN" });
    }
  }
  return out;
}

export function parseSolverReport(raw: string): ParsedSolverReport {
  const { files, cleaned } = extractChangedFiles(raw);
  const sections = splitSections(cleaned);

  const statusRaw = (sections["status"] ?? "").toUpperCase();
  const status =
    (
      [
        "IMPLEMENTED",
        "PARTIALLY_IMPLEMENTED",
        "BLOCKED",
        "NO_CHANGE_REQUIRED",
      ] as const
    ).find((s) => statusRaw.includes(s)) ?? null;

  return {
    status,
    statusGate: parseStatusGate(sections["status gate checklist"]),
    issue: (sections["issue"] ?? "").trim(),
    rootCause: (sections["root cause"] ?? "").trim(),
    changesMade: (sections["changes made"] ?? "").trim(),
    files,
    testsAdded: (
      sections["tests added or updated"] ??
      sections["tests"] ??
      ""
    ).trim(),
    verification: parseVerification(sections["verification"]),
    diffSummary: (sections["diff summary"] ?? "").trim(),
    remainingIssues: (sections["remaining issues"] ?? "").trim(),
    solverNotes: (sections["solver notes"] ?? "").trim(),
    raw,
  };
}
