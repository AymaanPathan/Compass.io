import { useState } from "react";
import AppLayout from "../components/AppLayout";
import ProfileStage from "../components/ProfileStage";
import RecommendationsStage from "../components/RecommendationsStage";
import IssueFinderStage from "../components/issueFinderStage";
import IssueResolutionStage from "../components/IssueResolutionStage";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import { runProfileStream, resumeProfileStream } from "../store/profileSlice";
import {
  runRecommendationsStream,
  resumeRecommendationsStream,
  selectRecommendations,
  type MatchedRepository,
  answerRecommendationsQuestion,
} from "../store/recommendationsSlice";
import {
  startIssueFinder,
  answerIssueFinderQuestion,
  resumeIssueFinderStream,
  selectRepositoryForIssues,
  selectIssueFinder,
  type MatchedIssue,
} from "../store/issueFinderSlice";
import {
  startIssueResolution,
  approveIssueResolution,
  declineImplementation,
  answerIssueResolutionQuestion,
  resumeIssueResolutionStream,
  selectIssueForResolution,
  selectIssueResolution,
} from "../store/issueResolutionSlice";

type Step = "profile" | "recommendations" | "issues" | "resolve";

const STEPS: { key: Step; label: string }[] = [
  { key: "profile", label: "1 · Profile" },
  { key: "recommendations", label: "2 · Recommend repos" },
  { key: "issues", label: "3 · Find issues" },
  { key: "resolve", label: "4 · Resolve" },
];

function SessionContent() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => s.devProfile);
  const recommendations = useAppSelector(selectRecommendations);
  const issueFinder = useAppSelector(selectIssueFinder);
  const issueResolution = useAppSelector(selectIssueResolution);

  const [step, setStep] = useState<Step>("profile");

  // A step is reachable once its prerequisite data exists, so people can
  // click back to an earlier step (or jump ahead if they already have a
  // repo picked from a previous run) without losing anything.
  const canReach = (key: Step) => {
    if (key === "profile") return true;
    if (key === "recommendations")
      return profile.status === "succeeded" || !!profile.data;
    if (key === "issues")
      return !!issueFinder.selectedRepository || !!issueFinder.data;
    if (key === "resolve") return !!issueResolution.issueUrl;
    return false;
  };

  const handleFindIssues = (repo: MatchedRepository) => {
    // Component-level navigation: pre-load the repo into issueFinderSlice's
    // state and just flip the local `step`, no route change.
    dispatch(
      selectRepositoryForIssues({
        name: repo.name,
        url: repo.url,
        description: repo.description,
      }),
    );
    setStep("issues");
  };

  const handleResolveIssue = (issue: MatchedIssue) => {
    // Same pattern as handleFindIssues: pre-load the picked issue into
    // issueResolutionSlice and navigate to the resolve step locally.
    dispatch(selectIssueForResolution(issue.url));
    setStep("resolve");
  };

  return (
    <div className="flex h-full flex-col">
      <StepTabs step={step} onChange={setStep} canReach={canReach} />

      <div className="min-h-0 flex-1">
        {step === "profile" && (
          <ProfileStage
            status={profile.status}
            profile={profile.data}
            streamingProfile={profile.streamingProfile}
            steps={profile.steps}
            authUrls={profile.authUrls}
            error={profile.error}
            cached={profile.cached}
            onStart={() => dispatch(runProfileStream())}
            onResume={() => dispatch(resumeProfileStream())}
            onAdvance={() => setStep("recommendations")}
          />
        )}

        {step === "recommendations" && (
          <RecommendationsStage
            status={recommendations.status}
            repos={recommendations.data}
            steps={recommendations.steps}
            authUrls={recommendations.authUrls}
            pendingQuestion={recommendations.pendingQuestion}
            qaHistory={recommendations.qaHistory}
            error={recommendations.error}
            cached={recommendations.cached}
            onStart={() => dispatch(runRecommendationsStream())}
            onAnswer={(answer) =>
              dispatch(answerRecommendationsQuestion(answer))
            }
            onResume={() => dispatch(resumeRecommendationsStream())}
            onFindIssues={handleFindIssues}
          />
        )}

        {step === "issues" && (
          <IssueFinderStage
            selectedRepository={issueFinder.selectedRepository}
            status={issueFinder.status}
            issues={issueFinder.data?.matchedIssues ?? null}
            steps={issueFinder.steps}
            authUrls={issueFinder.authUrls}
            pendingQuestion={issueFinder.pendingQuestion}
            qaHistory={issueFinder.qaHistory}
            error={issueFinder.error}
            cached={issueFinder.cached}
            onStart={() =>
              issueFinder.selectedRepository &&
              dispatch(startIssueFinder(issueFinder.selectedRepository))
            }
            onAnswer={(answer) => dispatch(answerIssueFinderQuestion(answer))}
            onResume={() => dispatch(resumeIssueFinderStream())}
            onResolve={handleResolveIssue}
          />
        )}

        {step === "resolve" && (
          <IssueResolutionStage
            issueUrl={issueResolution.issueUrl}
            phase={issueResolution.phase}
            status={issueResolution.status}
            steps={issueResolution.steps}
            streamingText={issueResolution.streamingText}
            deepDiveReport={issueResolution.deepDiveReport}
            solverReport={issueResolution.solverReport}
            solverStatus={issueResolution.solverStatus}
            authUrls={issueResolution.authUrls}
            pendingQuestion={issueResolution.pendingQuestion}
            error={issueResolution.error}
            declined={issueResolution.declined}
            cached={issueResolution.cached}
            onStart={() =>
              issueResolution.issueUrl &&
              dispatch(startIssueResolution(issueResolution.issueUrl))
            }
            onApprove={() => dispatch(approveIssueResolution())}
            onDecline={() => dispatch(declineImplementation())}
            onAnswer={(answer) =>
              dispatch(answerIssueResolutionQuestion(answer))
            }
            onResume={() => dispatch(resumeIssueResolutionStream())}
            onStartOver={() =>
              issueResolution.issueUrl &&
              dispatch(startIssueResolution(issueResolution.issueUrl))
            }
          />
        )}
      </div>
    </div>
  );
}

function StepTabs({
  step,
  onChange,
  canReach,
}: {
  step: Step;
  onChange: (s: Step) => void;
  canReach: (s: Step) => boolean;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-white/[0.08] bg-[#14120B] px-5 py-2">
      {STEPS.map((s) => {
        const active = s.key === step;
        const reachable = canReach(s.key);
        return (
          <button
            key={s.key}
            onClick={() => reachable && onChange(s.key)}
            disabled={!reachable}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
              active
                ? "bg-[#D39237] text-[#14120B]"
                : reachable
                  ? "text-[#EDECEC]/60 hover:bg-white/[0.06] hover:text-[#EDECEC]/90"
                  : "cursor-not-allowed text-[#EDECEC]/25"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Sessions() {
  return (
    <AppLayout>
      <SessionContent />
    </AppLayout>
  );
}
