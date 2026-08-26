const STYLES: Record<string, string> = {
  idle: "text-neutral-500 border-neutral-800",
  running: "text-run border-run/40 bg-run/10",
  waiting: "text-run border-run/40 bg-run/10",
  succeeded: "text-ok border-ok/40 bg-ok/10",
  done: "text-ok border-ok/40 bg-ok/10",
  already_satisfied: "text-ok border-ok/40 bg-ok/10",
  success: "text-ok border-ok/40 bg-ok/10",
  empty: "text-neutral-500 border-neutral-800",
  blocked: "text-blocked border-blocked/40 bg-blocked/10",
  failed: "text-fail border-fail/40 bg-fail/10",
  error: "text-fail border-fail/40 bg-fail/10",
};

export default function StatusPill({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const cls = STYLES[status] ?? STYLES.idle;
  const isLive = status === "running" || status === "waiting";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${cls}`}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {isLive && (
        <span className="h-1.5 w-1.5 rounded-full bg-current agent-pulse" />
      )}
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
