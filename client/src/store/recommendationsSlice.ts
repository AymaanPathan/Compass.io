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

export interface RepoContributionIntent {
  projectCategory: string;
  projectSize: string;
  whatMattersMost: string;
  goal: string;
}

interface RecommendationsPayload {
  contributionIntent: RepoContributionIntent;
  matchedRepositories: MatchedRepository[];
}

export type AgentRunStatus =
  | "idle"
  | "connecting"
  | "running"
  | "auth_required"
  | "question_required"
  | "succeeded"
  | "failed"
  | "cancelled";

interface QaEntry {
  question: string;
  answer: string;
}

interface RecommendationsState {
  data: MatchedRepository[] | null;
  contributionIntent: RepoContributionIntent | null;
  streamingData: Partial<RecommendationsPayload> | null;
  steps: StepNode[];
  status: AgentRunStatus;
  error: string | null;
  authUrls: AuthUrl[];
  pendingQuestion: PendingQuestion | null;
  qaHistory: QaEntry[];
  generatedAt: string | null;
  cached: boolean;
  rawBuffer: string;
}

const initialState: RecommendationsState = {
  data: null,
  contributionIntent: null,
  streamingData: null,
  steps: [],
  status: "idle",
  error: null,
  authUrls: [],
  pendingQuestion: null,
  qaHistory: [],
  generatedAt: null,
  cached: false,
  rawBuffer: "",
};

async function runStream(
  url: string,
  dispatch: (action: any) => void,
  body?: unknown,
): Promise<
  | { payload: RecommendationsPayload; raw: string }
  | { authUrls: AuthUrl[] }
  | { question: PendingQuestion }
  | { error: string }
> {
  const result = await consumeAgentStream<RecommendationsPayload>(
    url,
    {
      onPhase: () =>
        dispatch(recommendationsSlice.actions.phaseChanged("running")),
      onEvent: (event: StepEvent) => {
        if (event.type === "text_delta") {
          dispatch(
            recommendationsSlice.actions.textDeltaReceived(event.delta),
          );
        } else {
          dispatch(recommendationsSlice.actions.stepEventReceived(event));
        }
      },
      onAuthRequired: (authUrls) =>
        dispatch(recommendationsSlice.actions.authRequired(authUrls)),
      onQuestionRequired: (question) =>
        dispatch(recommendationsSlice.actions.questionRequired(question)),
    },
    body,
  );

  if (result.kind === "error") return { error: result.message };
  if (result.kind === "auth_required") return { authUrls: result.authUrls };
  if (result.kind === "question_required")
    return { question: result.question };
  if (result.kind === "cancelled")
    return { error: "The run was cancelled before it finished." };
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
  | { question: PendingQuestion }
  | null,
  void,
  { rejectValue: string }
>("recommendations/stream", async (_, { dispatch, rejectWithValue }) => {
  dispatch(recommendationsSlice.actions.streamReset());

  const result = await runStream(`${API_BASE}/stream`, dispatch);
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result || "question" in result) return result;

  await commitRecommendations(result);
  return { ...result, generatedAt: new Date().toISOString() };
});

export const answerRecommendationsQuestion = createAsyncThunk<
  | { payload: RecommendationsPayload; raw: string; generatedAt: string }
  | { authUrls: AuthUrl[] }
  | { question: PendingQuestion }
  | null,
  string,
  { state: RootState; rejectValue: string }
>(
  "recommendations/answer",
  async (answer, { dispatch, getState, rejectWithValue }) => {
    const pending = getState().repos.pendingQuestion;
    if (!pending) return rejectWithValue("No pending question to answer");

    dispatch(recommendationsSlice.actions.answerSubmitted({ answer }));

    const result = await runStream(`${API_BASE}/stream/answer`, dispatch, {
      toolCallId: pending.toolCallId,
      threadId: pending.threadId,
      answer,
    });
    if ("error" in result) return rejectWithValue(result.error);
    if ("authUrls" in result || "question" in result) return result;

    await commitRecommendations(result);
    return { ...result, generatedAt: new Date().toISOString() };
  },
);

export const resumeRecommendationsStream = createAsyncThunk<
  { payload: RecommendationsPayload; raw: string; generatedAt: string } | null,
  void,
  { rejectValue: string }
>("recommendations/resumeStream", async (_, { dispatch, rejectWithValue }) => {
  const result = await runStream(`${API_BASE}/stream/resume`, dispatch);
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result || "question" in result)
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

function applyFinalPayload(
  state: RecommendationsState,
  payload: RecommendationsPayload,
  generatedAt: string,
) {
  state.status = "succeeded";
  state.data = payload.matchedRepositories;
  state.contributionIntent = payload.contributionIntent ?? null;
  state.generatedAt = generatedAt;
  state.cached = false;
  state.pendingQuestion = null;
}

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
      state.pendingQuestion = null;
    },
    questionRequired(state, action: PayloadAction<PendingQuestion>) {
      state.status = "question_required";
      state.pendingQuestion = action.payload;
    },
    answerSubmitted(state, action: PayloadAction<{ answer: string }>) {
      if (state.pendingQuestion) {
        state.qaHistory.push({
          question: state.pendingQuestion.question,
          answer: action.payload.answer,
        });
      }
      state.pendingQuestion = null;
      state.status = "running";
    },
    streamReset(state) {
      state.steps = [];
      state.streamingData = null;
      state.rawBuffer = "";
      state.error = null;
      state.authUrls = [];
      state.pendingQuestion = null;
      state.qaHistory = [];
      state.data = null;
      state.contributionIntent = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runRecommendationsStream.pending, (state) => {
        state.status = "connecting";
      })
      .addCase(runRecommendationsStream.fulfilled, (state, action) => {
        if (action.payload && "payload" in action.payload) {
          applyFinalPayload(
            state,
            action.payload.payload,
            action.payload.generatedAt,
          );
        }
      })
      .addCase(runRecommendationsStream.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to match repositories.";
      })
      .addCase(answerRecommendationsQuestion.pending, (state) => {
        state.status = "running";
      })
      .addCase(answerRecommendationsQuestion.fulfilled, (state, action) => {
        if (action.payload && "payload" in action.payload) {
          applyFinalPayload(
            state,
            action.payload.payload,
            action.payload.generatedAt,
          );
        }
      })
      .addCase(answerRecommendationsQuestion.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to submit your answer.";
      })
      .addCase(resumeRecommendationsStream.pending, (state) => {
        state.status = "running";
      })
      .addCase(resumeRecommendationsStream.fulfilled, (state, action) => {
        if (action.payload) {
          applyFinalPayload(
            state,
            action.payload.payload,
            action.payload.generatedAt,
          );
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