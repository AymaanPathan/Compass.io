const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

type Status = "idle" | "running" | "succeeded" | "failed" | "auth_required";

const STYLES: Record<
  Status,
  { dot: string; text: string; bg: string; label: string }
> = {
  idle: {
    dot: "bg-neutral-600",
    text: "text-neutral-400",
    bg: "border-white/[0.08]",
    label: "idle",
  },
  running: {
    dot: "bg-sky-400 animate-pulse",
    text: "text-sky-400",
    bg: "border-sky-700/40 bg-sky-500/[0.05]",
    label: "running",
  },
  succeeded: {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    bg: "border-emerald-700/40 bg-emerald-900/[0.15]",
    label: "complete",
  },
  failed: {
    dot: "bg-rose-400",
    text: "text-rose-400",
    bg: "border-rose-700/40 bg-rose-500/[0.05]",
    label: "failed",
  },
  auth_required: {
    dot: "bg-amber-400",
    text: "text-amber-400",
    bg: "border-amber-700/40 bg-amber-500/[0.05]",
    label: "needs auth",
  },
};

function StatusPill({ status }: { status: Status }) {
  const s = STYLES[status] ?? STYLES.idle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${s.bg} ${s.text}`}
      style={{ fontFamily: FONT_MONO }}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export default StatusPill;