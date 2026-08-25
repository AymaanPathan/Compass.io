import { TrueForge } from "@truefoundry/trueforge-sdk";

const trueforgeBaseUrl = process.env.TRUEFORGE_BASE_URL;

if (!trueforgeBaseUrl) {
  throw new Error("TRUEFORGE_BASE_URL is not configured");
}

export const agentClient = new TrueForge({
  baseUrl: trueforgeBaseUrl,
  timeoutInSeconds: 600,
});

export const OSS_AGENT_NAME = "oss-discover-agent";
export const DEV_PROFILE_AGENT_NAME = "developer-profile-agent";
export const OSS_ISSUES_AGENT_NAME = "oss-issue-fetcher";
export const OSS_ISSUE_DEEP_DIVE_AGENT_NAME = "oss-issue-deep-dive";
export const OSS_CODE_EXPLORER_AGENT_NAME = "oss-issue-code-explorer";
export const SOLVER_AGENT_NAME = "solver-agent";
