import { useState } from "react";
import AppLayout from "../components/AppLayout";
import OrchestrationHeader, {
  type SessionStage,
} from "../components/OrchestrationHeader";
import ProfileStage from "../components/ProfileStage";
import RepoStage from "../components/RepoStage";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import {
  runProfileStream,
  resumeProfileStream,
} from "../store/profileSlice";
import { runOssStream, resumeOssStream } from "../store/reposSlice";

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

export default function Session() {
  const dispatch = useAppDispatch();
  const [stage, setStage] = useState<SessionStage>("profile");
  // Direction drives which way the stage content slides in.
  const [_, setDirection] = useState<"forward" | "back">("forward");

  const profile = useAppSelector((s) => s.devProfile);
  const oss = useAppSelector((s) => s.repos);

  function goToStage(next: SessionStage) {
    setDirection(next === "repos" ? "forward" : "back");
    setStage(next);
  }

  function handleFindRepos() {
    goToStage("repos");
    dispatch(runOssStream());
  }

  return (
    <AppLayout>
      <style>{`
        .bubble-btn {
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
            background-color 0.2s ease, box-shadow 0.25s ease;
        }
        .bubble-btn:hover { transform: translateY(-2px) scale(1.03); }
        .bubble-btn:active { transform: translateY(0) scale(0.97); }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 122, 0); }
          50% { box-shadow: 0 0 22px 2px rgba(34, 197, 122, 0.18); }
        }
        .animate-glow { animation: glowPulse 3.2s ease-in-out infinite; }

        @keyframes stageInForward {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes stageInBack {
          from { opacity: 0; transform: translateX(-24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .stage-forward { animation: stageInForward 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .stage-back { animation: stageInBack 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @media (prefers-reduced-motion: reduce) {
          .stage-forward, .stage-back, .animate-glow { animation: none !important; }
        }
      `}</style>

      {/* ambient background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="pointer-events-none fixed -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-900/[0.12] blur-[120px]" />

      <main className="relative mx-auto max-w-6xl px-6 py-10">
        <p
          className="mb-2 text-[11px] uppercase tracking-[0.22em] text-emerald-500"
          style={{ fontFamily: FONT_MONO }}
        >
          Session · Agent pipeline
        </p>
        <h1
          className="mb-8 text-3xl font-medium text-white"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Your first-contribution run
        </h1>

        <OrchestrationHeader
          stage={stage}
          profileStatus={profile.status}
          repoStatus={oss.status}
          onSelectStage={goToStage}
        />

        <div
          key={stage}
          className={stage === "repos" ? "stage-forward" : "stage-back"}
        >
          {stage === "profile" && (
            <ProfileStage
              status={profile.status}
              profile={profile.data}
              streamingProfile={profile.streamingProfile}
              activity={profile.activity}
              authUrls={profile.authUrls}
              error={profile.error}
              cached={profile.cached}
              onStart={() => dispatch(runProfileStream())}
              onResume={() => dispatch(resumeProfileStream())}
              onAdvance={handleFindRepos}
            />
          )}

          {stage === "repos" && (
            <RepoStage
              status={oss.status}
              repos={oss.data}
              activity={oss.activity}
              authUrls={oss.authUrls}
              error={oss.error}
              cached={oss.cached}
              onResume={() => dispatch(resumeOssStream())}
              onRetry={() => dispatch(runOssStream())}
              onBack={() => goToStage("profile")}
            />
          )}
        </div>
      </main>
    </AppLayout>
  );
}
