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
 */

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

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
    window.location.href = `${
      import.meta.env.VITE_API_URL || "http://localhost:5000"
    }/api/auth/github`;
  };

  if (status === "loading" || status === "idle") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-800 border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* header */}
      <header className="mx-auto w-full max-w-6xl px-6 py-6 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <MarkGlyph />
          <span
            className="text-xs tracking-[0.2em] uppercase text-white"
            style={{ fontFamily: FONT_MONO }}
          >
            Compass
          </span>
        </div>
        <span
          className="hidden sm:block text-[11px] tracking-wide text-neutral-600"
          style={{ fontFamily: FONT_MONO }}
        >
          find your next commit
        </span>
      </header>

      {/* hero */}
      <main className="mx-auto w-full max-w-6xl px-6">
        <div className="pt-20 pb-16 lg:pt-28 lg:pb-24 max-w-2xl">
          <p
            className="text-[11px] tracking-[0.22em] uppercase mb-6 text-neutral-500"
            style={{ fontFamily: FONT_MONO }}
          >
            Bearing — unset
          </p>
          <h1
            className="text-[2.5rem] leading-[1.1] sm:text-[3.5rem] sm:leading-[1.06] font-medium tracking-tight text-white"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            Your first open source
            <br />
            contribution, plotted.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-neutral-400">
            Compass reads your GitHub stack, then charts a course to real, open
            issues in repos you're already equipped to help with — no digging
            through hundreds of repos yourself.
          </p>

          <div className="mt-10 flex items-center gap-4">
            <button
              onClick={handleFindFirstContribution}
              className="inline-flex items-center gap-2.5 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              <GithubGlyph />
              Find my first contribution
            </button>
          </div>
          <p
            className="mt-3 text-[11px] tracking-wide text-neutral-600"
            style={{ fontFamily: FONT_MONO }}
          >
            connects with github · read-only access
          </p>
        </div>

        {/* waypoints — a real 3-step sequence, framed as bearings */}
        <div className="border-t border-white/[0.06]">
          <div className="grid sm:grid-cols-3 gap-px bg-white/[0.06]">
            <Waypoint
              bearing="N · 000°"
              title="Connect your stack"
              body="Sign in with GitHub. Compass reads your public repos, languages, and activity — nothing is written or changed."
            />
            <Waypoint
              bearing="E · 090°"
              title="Get your heading"
              body="An agent cross-references your stack against live, open issues across GitHub to find genuine matches."
            />
            <Waypoint
              bearing="S · 180°"
              title="Pick a course"
              body="Sort candidates on a board, open the ones that fit, and land on an issue worth your first PR."
            />
          </div>
        </div>
      </main>

      <footer
        className="mx-auto w-full max-w-6xl px-6 py-8 flex items-center justify-between text-[11px] text-neutral-600 border-t border-white/[0.06]"
        style={{ fontFamily: FONT_MONO }}
      >
        <span>compass</span>
        <span>read-only · revoke access anytime from GitHub settings</span>
      </footer>
    </div>
  );
}

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
        className="text-[11px] tracking-[0.16em] text-neutral-500"
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
      <p className="mt-2 text-[13px] leading-relaxed max-w-xs text-neutral-500">
        {body}
      </p>
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
        stroke="white"
        strokeOpacity="0.8"
        strokeWidth="1"
      />
      <line x1="8" y1="1" x2="8" y2="3.4" stroke="white" strokeWidth="1" />
      <circle cx="8" cy="8" r="1" fill="white" />
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

export default Landing;
