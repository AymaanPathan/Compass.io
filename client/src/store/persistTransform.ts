/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTransform } from "redux-persist";

// Statuses that mean "a stream was actively running" — meaningless after
// a hard reload since the SSE connection is gone. Anything else (idle,
// succeeded, failed) is safe to restore as-is.
const TRANSIENT_STATUSES = new Set([
  "connecting",
  "running",
  "auth_required",
  "question_required",
]);

/**
 * Applies to profile/recommendations/issueFinder/issueResolution slices.
 * On rehydrate: if we were mid-stream when the page closed, fall back to
 * "idle" (if no prior successful data) or "succeeded" (if we do), and
 * drop the ephemeral trace/auth/question fields so the UI doesn't render
 * a phantom running state.
 */
export const dropTransientRunState = createTransform(
  // inbound (state -> storage): store as-is
  (inboundState) => inboundState,
  // outbound (storage -> state): sanitize on load
  (outboundState: any) => {
    if (!outboundState) return outboundState;
    const hasData = !!(
      outboundState.data ||
      outboundState.deepDiveReport ||
      outboundState.solverReport
    );
    return {
      ...outboundState,
      status: TRANSIENT_STATUSES.has(outboundState.status)
        ? hasData
          ? "succeeded"
          : "idle"
        : outboundState.status,
      steps: [],
      authUrls: [],
      pendingQuestion: null,
      streamingData: null,
      streamingProfile: null,
      streamingText:
        outboundState.solverReport ?? outboundState.deepDiveReport ?? "",
      rawBuffer: "",
    };
  },
);
