import { TrueForge } from "@truefoundry/trueforge-sdk";

export const agentClient = new TrueForge({
  baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8791",
  timeoutInSeconds: 600,
});

export const OSS_AGENT_NAME = "oss-discover-agent";
export const DEV_PROFILE_AGENT_NAME = "developer-profile-agent";
export const OSS_ISSUES_AGENT_NAME = "oss-issue-fetcher";
export const OSS_ISSUE_DEEP_DIVE_AGENT_NAME = "oss-issue-deep-dive";
export const OSS_CODE_EXPLORER_AGENT_NAME = "oss-issue-code-explorer";