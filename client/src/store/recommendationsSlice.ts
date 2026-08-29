/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  consumeAgentStream,
  applyEvent,
  type AuthUrl,
  type StepEvent,
  type StepNode,
  type PendingQuestion,
} from "../utils/agentStream";
import { parsePartialJson } from "../utils/partialJson";
import type { RootState } from "./store";

const API_ROOT = (
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");
const API_BASE = `${API_ROOT}/api/oss/recommendations`;

export interface MatchedRepository {
  name: string;
  url: string;
  description: string;
  repoType: string;
  whyItMatches: string;
}

interface RecommendationsPayload {
  matchedRepositories: MatchedRepository[];
}

export type AgentRunStatus =
  | "idle"
  | "connecting"
  | "running"
  | "auth_required"
  | "question_required"
  | "succeeded"
  | "failed";

interface RecommendationsState {
  data: MatchedRepository[] | null;
  streamingData: Partial<RecommendationsPayload> | null;
  steps: StepNode[];
  status: AgentRunStatus;
  error: string | null;
  authUrls: AuthUrl[];
  pendingQuestion: PendingQuestion | null;
  generatedAt: string | null;
  cached: boolean;
  rawBuffer: string;
}

const initialState: RecommendationsState = {
  data: null,
  streamingData: null,
  steps: [],
  status: "idle",
  error: null,
  authUrls: [],
  pendingQuestion: null,
  generatedAt: null,
  cached: false,
  rawBuffer: "",
};

async function runStream(
  url: string,
  dispatch: (action: any) => void,
): Promise<
  | { payload: RecommendationsPayload; raw: string }
  | { authUrls: AuthUrl[] }
  | { error: string }
> {
  const result = await consumeAgentStream<RecommendationsPayload>(url, {
    onPhase: () =>
      dispatch(recommendationsSlice.actions.phaseChanged("running")),
    onEvent: (event: StepEvent) => {
      if (event.type === "text_delta") {
        dispatch(recommendationsSlice.actions.textDeltaReceived(event.delta));
      } else {
        dispatch(recommendationsSlice.actions.stepEventReceived(event));
      }
    },
    onAuthRequired: (authUrls) =>
      dispatch(recommendationsSlice.actions.authRequired(authUrls)),
  });

  if (result.kind === "error") return { error: result.message };
  if (result.kind === "auth_required") return { authUrls: result.authUrls };
  if (result.kind === "question_required") {
    // The repo recommender flow doesn't handle mid-run questions today —
    // surface it as a failure rather than silently hanging, so the UI's
    // FailedCard/retry path picks it up.
    return { error: "The agent asked a question this flow can't answer yet." };
  }
  return { payload: result.data, raw: result.raw };
}

async function commitRecommendations(payload: {
  payload: RecommendationsPayload;
  raw: string;
}) {
  await fetch(`${API_BASE}/commit`, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: payload.payload, raw: payload.raw }),
  });
}

export const runRecommendationsStream = createAsyncThunk<
  | { payload: RecommendationsPayload; raw: string; generatedAt: string }
  | { authUrls: AuthUrl[] }
  | null,
  void,
  { rejectValue: string }
>("recommendations/stream", async (_, { dispatch, rejectWithValue }) => {
  dispatch(recommendationsSlice.actions.streamReset());

  const result = await runStream(`${API_BASE}/stream`, dispatch);
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result) return result;

  await commitRecommendations(result);
  return { ...result, generatedAt: new Date().toISOString() };
});

export const resumeRecommendationsStream = createAsyncThunk<
  { payload: RecommendationsPayload; raw: string; generatedAt: string } | null,
  void,
  { rejectValue: string }
>("recommendations/resumeStream", async (_, { dispatch, rejectWithValue }) => {
  const result = await runStream(`${API_BASE}/stream/resume`, dispatch);
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result)
    return rejectWithValue("Still waiting on GitHub authorization");

  await commitRecommendations(result);
  return { ...result, generatedAt: new Date().toISOString() };
});

export const fetchCachedRecommendations = createAsyncThunk(
  "recommendations/fetchCached",
  async () => {
    const res = await fetch(API_BASE, {
      credentials: "include",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });
    return res.json() as Promise<{
      success: boolean;
      matchedRepositories: MatchedRepository[] | null;
      cached: boolean;
      generatedAt: string | null;
    }>;
  },
);

const recommendationsSlice = createSlice({
  name: "recommendations",
  initialState,
  reducers: {
    phaseChanged(state, action: PayloadAction<AgentRunStatus>) {
      state.status = action.payload;
    },
    stepEventReceived(state, action: PayloadAction<StepEvent>) {
      const next = applyEvent(
        {
          steps: state.steps,
          status: state.status,
          error: state.error,
          authUrls: state.authUrls,
          pendingQuestion: state.pendingQuestion,
        },
        action.payload,
      );
      state.steps = next.steps;
      state.status = next.status;
      state.error = next.error;
      state.authUrls = next.authUrls;
      state.pendingQuestion = next.pendingQuestion;
    },
    textDeltaReceived(state, action: PayloadAction<string>) {
      state.rawBuffer += action.payload;
      state.streamingData = parsePartialJson<RecommendationsPayload>(
        state.rawBuffer,
      );
    },
    authRequired(state, action: PayloadAction<AuthUrl[]>) {
      state.status = "auth_required";
      state.authUrls = action.payload;
    },
    streamReset(state) {
      state.steps = [];
      state.streamingData = null;
      state.rawBuffer = "";
      state.error = null;
      state.authUrls = [];
      state.pendingQuestion = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runRecommendationsStream.pending, (state) => {
        state.status = "connecting";
      })
      .addCase(runRecommendationsStream.fulfilled, (state, action) => {
        if (action.payload && "payload" in action.payload) {
          state.status = "succeeded";
          state.data = action.payload.payload.matchedRepositories;
          state.generatedAt = action.payload.generatedAt;
          state.cached = false;
        }
      })
      .addCase(runRecommendationsStream.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to match repositories.";
      })
      .addCase(resumeRecommendationsStream.pending, (state) => {
        state.status = "running";
      })
      .addCase(resumeRecommendationsStream.fulfilled, (state, action) => {
        if (action.payload) {
          state.status = "succeeded";
          state.data = action.payload.payload.matchedRepositories;
          state.generatedAt = action.payload.generatedAt;
          state.cached = false;
        }
      })
      .addCase(resumeRecommendationsStream.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to resume repo matching.";
      })
      .addCase(fetchCachedRecommendations.fulfilled, (state, action) => {
        if (action.payload.matchedRepositories?.length) {
          state.data = action.payload.matchedRepositories;
          state.cached = action.payload.cached;
          state.generatedAt = action.payload.generatedAt;
          state.status = "succeeded";
        }
      });
  },
});

export const { resetRecommendations } = {
  resetRecommendations: recommendationsSlice.actions.streamReset,
};
export default recommendationsSlice.reducer;
export const selectRecommendations = (state: RootState) => state.repos;
