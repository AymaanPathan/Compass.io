import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";

/**
 * Fonts: add to index.html <head>:
 *
 * <link rel="preconnect" href="https://fonts.googleapis.com" />
 * <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
 * <link
 *   href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&display=swap"
 *   rel="stylesheet"
 * />
 *
 * Falls back to system serif/mono if not loaded — everything else uses
 * your existing Tailwind sans stack, unchanged from the rest of the app.
 *
 * Tailwind: this file assumes Tailwind v4 (`@import "tailwindcss";`), no
 * config changes needed — every color/utility used below ships in core.
 *
 * Theme note: primary surface stays black; buttons and small accent
 * elements (badges, dots, avatar rings, dividers) now use a dark-green
 * palette (#0f3d2e / #16523d / #22c37a for highlights). A few gentle
 * animations were added — a slow float on the hero cards, a soft pulse
 * on the "live" dot, and bubbly hover/press motion on buttons — kept
 * subtle on purpose.
 */

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

const GITHUB_AUTH_URL = `${
  import.meta.env.VITE_API_URL || "http://localhost:5000"
}/api/auth/github`;

/* ------------------------------------------------------------------ */
/* Mock data for the hero card stack + board preview                   */
/* (purely presentational — swap for real API data once wired up)      */
/* ------------------------------------------------------------------ */

const TAG_STYLES: Record<string, string> = {
  "good first issue":
    "bg-emerald-900/30 text-emerald-400 border-emerald-700/40",
  bug: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  enhancement: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  docs: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

type BoardCard = {
  tag: keyof typeof TAG_STYLES;
  refId: string;
  title: string;
  desc: string;
  avatars: string[];
  prOpen?: boolean;
  stat?: string;
};

type Column = {
  label: string;
  count: number;
  dot: string;
  cards: BoardCard[];
};

const COLUMNS: Column[] = [
  {
    label: "Discovering",
    count: 2,
    dot: "bg-neutral-500",
    cards: [
      {
        tag: "good first issue",
        refId: "excalidraw #6120",
        title: "Arrow snapping drifts on zoomed canvas",
        desc: "Repro found, agent is scoring difficulty against your stack.",
        avatars: ["AI"],
      },
      {
        tag: "docs",
        refId: "fastapi #3190",
        title: "Clarify dependency override examples",
        desc: "Tavily is pulling related upstream discussion.",
        avatars: ["AI"],
      },
    ],
  },
  {
    label: "Understanding",
    count: 2,
    dot: "bg-sky-500",
    cards: [
      {
        tag: "bug",
        refId: "next.js #8821",
        title: "WebSocket loses context after HMR reload",
        desc: "Reading linked PRs and the router's source via DeepWiki.",
        avatars: ["AI", "MK"],
      },
      {
        tag: "enhancement",
        refId: "vite #9042",
        title: "Expose manifest hook for custom SSR builds",
        desc: "Mapping module graph before proposing an approach.",
        avatars: ["AI"],
      },
    ],
  },
  {
    label: "Solving",
    count: 2,
    dot: "bg-amber-500",
    cards: [
      {
        tag: "bug",
        refId: "zod #4410",
        title: "Union parsing drops discriminator on refine",
        desc: "Solver subagent iterating in sandbox — 2 test runs so far.",
        avatars: ["AI"],
        stat: "4 / 9 tests passing",
      },
      {
        tag: "enhancement",
        refId: "excalidraw #6120",
        title: "Arrow snapping drifts on zoomed canvas",
        desc: "Fix drafted, validating against the real test suite.",
        avatars: ["AI"],
        stat: "7 / 9 tests passing",
      },
    ],
  },
  {
    label: "Awaiting Approval",
    count: 1,
    dot: "bg-orange-500",
    cards: [
      {
        tag: "bug",
        refId: "next.js #8821",
        title: "WebSocket loses context after HMR reload",
        desc: "Diff, test results, and PR draft are ready for your review.",
        avatars: ["AI", "MK"],
        stat: "+38 −11",
      },
    ],
  },
  {
    label: "PR Open",
    count: 1,
    dot: "bg-emerald-500",
    cards: [
      {
        tag: "docs",
        refId: "fastapi #3190",
        title: "Clarify dependency override examples",
        desc: "Session stays live — agent will react to review comments.",
        avatars: ["AI"],
        prOpen: true,
      },
    ],
  },
  {
    label: "Merged",
    count: 1,
    dot: "bg-emerald-500",
    cards: [
      {
        tag: "good first issue",
        refId: "zod #4210",
        title: "Fix stale cache key on nested schemas",
        desc: "Merged 4 days ago — your first contribution.",
        avatars: ["AI"],
        prOpen: true,
      },
    ],
  },
];

function Landing() {
  const navigate = useNavigate();
  const { user, status } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (status !== "loading" && status !== "idle" && user) {
      navigate("/analysis", { replace: true });
    }
  }, [status, user, navigate]);

  const handleFindFirstContribution = () => {
    sessionStorage.setItem("compass_auto_find", "1");
    window.location.href = GITHUB_AUTH_URL;
  };

  const handleConnectGithub = () => {
    window.location.href = GITHUB_AUTH_URL;
  };

  if (status === "loading" || status === "idle") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-800 border-t-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* local keyframes for the subtle floating / pulse / bubble motion */}
      <style>{`
        @keyframes floatY {
          0%, 100% { transform: translateY(0) rotate(var(--tilt, 0deg)); }
          50% { transform: translateY(-10px) rotate(var(--tilt, 0deg)); }
        }
        @keyframes softPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.35); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 122, 0.0); }
          50% { box-shadow: 0 0 22px 2px rgba(34, 197, 122, 0.18); }
        }
        .animate-float {
          animation: floatY 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: floatY 6.5s ease-in-out infinite;
          animation-delay: 0.6s;
        }
        .animate-soft-pulse {
          animation: softPulse 2.2s ease-in-out infinite;
        }
        .animate-glow {
          animation: glowPulse 3.2s ease-in-out infinite;
        }
        .bubble-btn {
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
            background-color 0.2s ease, box-shadow 0.25s ease;
        }
        .bubble-btn:hover {
          transform: translateY(-2px) scale(1.035);
        }
        .bubble-btn:active {
          transform: translateY(0) scale(0.97);
        }
      `}</style>

      {/* ambient starfield + glow, fixed behind everything */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="pointer-events-none fixed -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-900/[0.12] blur-[120px]" />

      <div className="relative">
        {/* header */}
        <header className="mx-auto w-full max-w-6xl px-6 py-6 flex items-center justify-between border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <MarkGlyph />
            <span
              className="text-xs tracking-[0.2em] uppercase text-white"
              style={{ fontFamily: FONT_MONO }}
            >
              Compass<span className="text-neutral-500">.io</span>
            </span>
          </div>

          <nav
            className="hidden md:flex items-center gap-8 text-[13px] text-neutral-300"
            style={{ fontFamily: FONT_MONO }}
          >
            <a
              href="#how-it-works"
              className="hover:text-emerald-400 transition-colors"
            >
              How it works
            </a>
            <a
              href="#board"
              className="hover:text-emerald-400 transition-colors"
            >
              The board
            </a>
            <a href="#" className="hover:text-emerald-400 transition-colors">
              Docs
            </a>
          </nav>

          <div className="flex items-center gap-5">
            <button
              onClick={handleConnectGithub}
              className="hidden sm:block text-[13px] text-neutral-300 hover:text-white transition-colors"
              style={{ fontFamily: FONT_MONO }}
            >
              Log in
            </button>
            <button
              onClick={handleConnectGithub}
              className="bubble-btn inline-flex items-center gap-2 rounded-full bg-[#123524] px-4 py-2 text-[13px] font-medium text-white shadow-lg shadow-emerald-950/40 hover:bg-[#17472f] transition-colors"
            >
              <GithubGlyph />
              Connect GitHub
            </button>
          </div>
        </header>

        {/* hero */}
        <main className="mx-auto w-full max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center pt-20 pb-24 lg:pt-28 lg:pb-32">
            {/* left: copy */}
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full border border-emerald-800/40 bg-emerald-950/30 px-3 py-1 mb-6"
                style={{ fontFamily: FONT_MONO }}
              >
                <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-soft-pulse" />
                </span>
                <span className="text-[11px] tracking-[0.16em] uppercase text-neutral-300">
                  Repo matching · live
                </span>
              </div>

              <h1
                className="text-[2.5rem] leading-[1.1] sm:text-[3.5rem] sm:leading-[1.06] font-medium tracking-tight text-white"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                Plot a course to
                <br />
                <em className="not-italic italic text-emerald-400">
                  your first commit.
                </em>
              </h1>

              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-neutral-300">
                Compass reads your GitHub stack, matches you to real open issues
                you're already equipped to solve, and drafts the fix itself —
                you approve the PR before anything ships.
              </p>

              <div className="mt-10 flex items-center gap-4">
                <button
                  onClick={handleFindFirstContribution}
                  className="bubble-btn animate-glow inline-flex items-center gap-2.5 rounded-lg bg-[#123524] px-6 py-3 text-sm font-medium text-white hover:bg-[#17472f] transition-colors"
                >
                  <GithubGlyph />
                  Find my first contribution
                </button>
              </div>
              <p
                className="mt-3 text-[11px] tracking-wide text-neutral-500"
                style={{ fontFamily: FONT_MONO }}
              >
                connects with github · read-only access
              </p>
            </div>

            {/* right: floating repo + issue cards */}
            <div className="relative h-[420px] hidden lg:block">
              <div
                className="animate-float absolute top-0 right-4 w-[340px] rounded-2xl border border-emerald-900/40 bg-[#0d0f0d] p-5 shadow-2xl shadow-black/60"
                style={{ ["--tilt" as string]: "5deg" }}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-900/30 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                    94% match
                  </span>
                  <span
                    className="text-[11px] text-neutral-400"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    updated 2h ago
                  </span>
                </div>
                <h3 className="mt-3 text-[15px] font-medium text-white">
                  facebook / react
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">
                  Your TypeScript + hooks history lines up with 12 open issues
                  here.
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <AvatarStack initials={["AI"]} />
                  <div
                    className="flex items-center gap-3 text-[11px] text-neutral-400"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <IconStar /> 231k
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <IconComment /> 12
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="animate-float-delayed absolute top-[168px] right-16 w-[340px] rounded-2xl border border-emerald-900/40 bg-[#0d0f0d] p-5 shadow-2xl shadow-black/60"
                style={{ ["--tilt" as string]: "-3deg" }}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-900/30 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                    good first issue
                  </span>
                  <span
                    className="text-[11px] text-neutral-400"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    #4821
                  </span>
                </div>
                <h3 className="mt-3 text-[15px] font-medium text-white">
                  Add WebSocket reconnect fallback
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">
                  Agent has a proposed fix, grounded in the actual client
                  source.
                </p>
                <div className="mt-4">
                  <div className="h-1 w-full rounded-full bg-white/[0.06]">
                    <div className="h-1 w-[70%] rounded-full bg-emerald-500" />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <AvatarStack initials={["AI", "MK"]} />
                  <div
                    className="flex items-center gap-3 text-[11px] text-neutral-400"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <IconComment /> 7
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <IconLink /> 1
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* board preview */}
        <section id="board" className="mx-auto w-full max-w-6xl px-6 pb-28">
          <div className="mb-8 max-w-xl">
            <p
              className="text-[11px] tracking-[0.2em] uppercase text-emerald-500 mb-3"
              style={{ fontFamily: FONT_MONO }}
            >
              The board
            </p>
            <h2
              className="text-2xl sm:text-3xl font-medium text-white"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              Every issue, tracked from first read to merged PR.
            </h2>
          </div>

          <div className="rounded-2xl border border-emerald-900/30 bg-[#0a0a0b] overflow-hidden shadow-2xl shadow-black/60">
            {/* window chrome */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 flex justify-center">
                <span
                  className="rounded-md bg-emerald-950/40 px-3 py-1 text-[11px] text-neutral-400"
                  style={{ fontFamily: FONT_MONO }}
                >
                  compass.io/board
                </span>
              </div>
              <span className="text-neutral-500 text-lg leading-none w-4 text-right">
                +
              </span>
            </div>

            <div className="flex">
              {/* sidebar */}
              <aside className="hidden sm:flex w-[190px] shrink-0 flex-col justify-between border-r border-white/[0.06] p-4">
                <div>
                  <div className="flex items-center gap-2 px-2 mb-6">
                    <MarkGlyph />
                    <span className="text-[13px] font-medium text-white">
                      Your sessions
                    </span>
                  </div>
                  <nav
                    className="space-y-1 text-[13px] text-neutral-300"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    <SidebarItem icon={<IconGrid />} label="Board" active />
                    <SidebarItem icon={<IconRepo />} label="Repositories" />
                    <SidebarItem icon={<IconList />} label="Sessions" />
                    <SidebarItem icon={<IconGear />} label="Settings" />
                  </nav>
                </div>
                <div className="flex items-center gap-2 px-2">
                  <span className="h-7 w-7 rounded-full bg-emerald-900/40 flex items-center justify-center text-[11px] text-emerald-300">
                    AC
                  </span>
                  <div className="leading-tight">
                    <p className="text-[12px] text-white">Alex Chen</p>
                    <p
                      className="text-[10px] text-neutral-400"
                      style={{ fontFamily: FONT_MONO }}
                    >
                      Contributor
                    </p>
                  </div>
                </div>
              </aside>

              {/* columns */}
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-px bg-white/[0.06] min-w-[880px]">
                  {COLUMNS.map((col) => (
                    <div
                      key={col.label}
                      className="w-[220px] shrink-0 bg-[#0a0a0b] px-3 py-4"
                    >
                      <div className="flex items-center gap-2 px-1 mb-3">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${col.dot}`}
                        />
                        <span className="text-[12px] font-medium text-neutral-200">
                          {col.label}
                        </span>
                        <span
                          className="ml-auto text-[11px] text-neutral-500"
                          style={{ fontFamily: FONT_MONO }}
                        >
                          {col.count}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {col.cards.map((card) => (
                          <div
                            key={card.refId + card.title}
                            className="bubble-btn rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-emerald-950/20 hover:border-emerald-800/40 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${TAG_STYLES[card.tag]}`}
                              >
                                {card.tag}
                              </span>
                            </div>
                            <p
                              className="mt-2 text-[10px] text-neutral-500"
                              style={{ fontFamily: FONT_MONO }}
                            >
                              {card.refId}
                            </p>
                            <h4 className="mt-1 text-[13px] leading-snug text-white">
                              {card.title}
                            </h4>
                            <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">
                              {card.desc}
                            </p>
                            <div className="mt-3 flex items-center justify-between">
                              <AvatarStack initials={card.avatars} size="sm" />
                              {card.prOpen ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                                  <IconLink /> PR open
                                </span>
                              ) : card.stat ? (
                                <span
                                  className="text-[10px] text-neutral-400"
                                  style={{ fontFamily: FONT_MONO }}
                                >
                                  {card.stat}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* how it works */}
        <div id="how-it-works" className="border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="grid sm:grid-cols-3 gap-px bg-white/[0.06]">
              <Waypoint
                bearing="N · 000°"
                title="Connect your stack"
                body="Sign in with GitHub. Compass reads your public repos, languages, and activity — nothing is written or changed."
              />
              <Waypoint
                bearing="E · 090°"
                title="Get matched to issues"
                body="An agent cross-references your stack against live, open issues, then explains each one and its fix in plain terms."
              />
              <Waypoint
                bearing="S · 180°"
                title="Approve & ship"
                body="The agent drafts the fix in a sandbox, runs the real test suite, and opens the PR the moment you approve."
              />
            </div>
          </div>
        </div>

        <footer
          className="mx-auto w-full max-w-6xl px-6 py-8 flex items-center justify-between text-[11px] text-neutral-500 border-t border-white/[0.06]"
          style={{ fontFamily: FONT_MONO }}
        >
          <span>compass.io</span>
          <span>read-only · revoke access anytime from GitHub settings</span>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Waypoint({
  bearing,
  title,
  body,
}: {
  bearing: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-black px-1 py-10 sm:py-12">
      <p
        className="text-[11px] tracking-[0.16em] text-emerald-500"
        style={{ fontFamily: FONT_MONO }}
      >
        {bearing}
      </p>
      <h3
        className="mt-3 text-lg text-white"
        style={{ fontFamily: FONT_DISPLAY }}
      >
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed max-w-xs text-neutral-400">
        {body}
      </p>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${
        active ? "bg-emerald-900/30 text-emerald-300" : ""
      }`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function AvatarStack({
  initials,
  size = "md",
}: {
  initials: string[];
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";
  return (
    <div className="flex -space-x-2">
      {initials.map((label, i) => (
        <span
          key={label + i}
          className={`${dim} rounded-full bg-emerald-900/40 ring-2 ring-[#0d0d0f] flex items-center justify-center text-emerald-300 font-medium`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Small mark used in the header, echoing the compass idea without
 * illustrating it: a circle, a single tick at true north, a center point.
 * Quiet on purpose — the signature moment lives in the copy, not a graphic.
 */
function MarkGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="7"
        stroke="#22c37a"
        strokeOpacity="0.9"
        strokeWidth="1"
      />
      <line x1="8" y1="1" x2="8" y2="3.4" stroke="#22c37a" strokeWidth="1" />
      <circle cx="8" cy="8" r="1" fill="#22c37a" />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor">
      <path d="M6 0l1.8 3.7 4.2.6-3 2.9.7 4.1L6 9.4 2.3 11.3 3 7.2 0 4.3l4.2-.6L6 0z" />
    </svg>
  );
}

function IconComment() {
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none">
      <path
        d="M1.5 2.5h11v7h-6l-3 2.5v-2.5h-2v-7z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none">
      <path
        d="M6 8l2-2M5.2 5.6l1-1a2 2 0 0 1 2.8 2.8l-1 1M8.8 8.4l-1 1a2 2 0 0 1-2.8-2.8l1-1"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
      <rect
        x="1.5"
        y="1.5"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
      />
      <rect
        x="8"
        y="1.5"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
      />
      <rect
        x="1.5"
        y="8"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
      />
      <rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" />
    </svg>
  );
}

function IconRepo() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
      <path
        d="M3 1.5h8v11H3a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 3 1.5z"
        stroke="currentColor"
      />
      <line x1="1.5" y1="10" x2="11" y2="10" stroke="currentColor" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
      <line x1="2" y1="3.5" x2="12" y2="3.5" stroke="currentColor" />
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" />
      <line x1="2" y1="10.5" x2="12" y2="10.5" stroke="currentColor" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
      <circle cx="7" cy="7" r="2.2" stroke="currentColor" />
      <circle
        cx="7"
        cy="7"
        r="5"
        stroke="currentColor"
        strokeDasharray="1.3 1.5"
      />
    </svg>
  );
}

export default Landing;
