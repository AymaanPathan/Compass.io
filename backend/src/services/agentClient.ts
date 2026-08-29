import { TrueForge } from "@truefoundry/trueforge-sdk";

export const trueforge = new TrueForge({
  baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8791",
  timeoutInSeconds: 600,
});

export const DEV_PROFILE_AGENT_NAME = "developer-profile-agent";
export const REPO_RECOMMENDER_AGENT_NAME = "repo-recommender-agent";
export const ISSUE_EXPLAINER_AGENT_NAME = "issue-explainer-agent";
export const SOLVE_APPROACH_AGENT_NAME = "solve-approach-agent";
export const BOUNDED_SOLVER_AGENT_NAME = "bounded-solver";
export const ISSUE_FINDER_AGENT_NAME = "issue-finder-agent";

export const OSS_AGENT_NAME = REPO_RECOMMENDER_AGENT_NAME;
export const OSS_ISSUES_AGENT_NAME = ISSUE_EXPLAINER_AGENT_NAME;
export const OSS_ISSUE_DEEP_DIVE_AGENT_NAME = ISSUE_EXPLAINER_AGENT_NAME;
export const OSS_CODE_EXPLORER_AGENT_NAME = SOLVE_APPROACH_AGENT_NAME;
export const SOLVER_AGENT_NAME = BOUNDED_SOLVER_AGENT_NAME;
