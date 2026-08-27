/* eslint-disable react-hooks/set-state-in-effect */
// components/AgentTrace.tsx
import { useEffect, useState } from "react";

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

function AgentTrace({
  lines,
  running,
  settled,
}: {
  lines: string[];
  running: boolean;
  settled: boolean; // succeeded or failed — reveal everything, no streaming
}) {
  const [visible, setVisible] = useState(settled ? lines.length : 0);

  useEffect(() => {
    if (settled) {
      setVisible(lines.length);
      return;
    }
    if (!running) {
      setVisible(0);
      return;
    }
    setVisible(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setVisible(Math.min(i, lines.length));
      if (i >= lines.length) clearInterval(id);
    }, 420);
    return () => clearInterval(id);
  }, [running, settled, lines.length]);

  if (visible === 0) return null;

  return (
    <div
      className="rounded-md border border-white/[0.06] bg-black/40 px-4 py-3"
      style={{ fontFamily: FONT_MONO }}
    >
      {lines.slice(0, visible).map((line, i) => (
        <p
          key={i}
          className="trace-line text-[11.5px] leading-[1.85] text-neutral-400"
        >
          <span className="mr-2 text-emerald-700">›</span>
          {line}
        </p>
      ))}
      {running && visible < lines.length && (
        <span className="mt-0.5 inline-block h-3 w-[6px] animate-pulse bg-emerald-500/70 align-middle" />
      )}
      <style>{`
        .trace-line { animation: traceIn 0.32s ease both; }
        @keyframes traceIn {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default AgentTrace;
