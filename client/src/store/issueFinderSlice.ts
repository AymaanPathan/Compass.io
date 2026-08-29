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
  type PendingQuestion,
  type StepEvent,
  type StepNode,
} from "../utils/agentStream";
import { parsePartialJson } from "../utils/partialJson";
import type { RootState } from "./store";

const API_ROOT = (
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");
const API_BASE = `${API_ROOT}/api/issue-finder`;

export interface SelectedRepository {
  name: string;
  url: string;
  description?: string;
}

export interface ContributionIntent {
  contributionTypes: string[];
  difficulty: string;
  timeAvailable: string;
  goal: string;
}

export interface MatchedIssue {
  number: number;
  title: string;
  url: string;
  labels: string[];
  status: string;
  difficultySignal: string;
  whyItMatches: string;
}

interface IssueFinderPayload {
  repository: string;
  contributionIntent: ContributionIntent;
  matchedIssues: MatchedIssue[];
}

export type IssueFinderRunStatus =
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

interface IssueFinderState {
  selectedRepository: SelectedRepository | null;
  data: IssueFinderPayload | null;
  streamingData: Partial<IssueFinderPayload> | null;
  steps: StepNode[];
  status: IssueFinderRunStatus;
  error: string | null;
  authUrls: AuthUrl[];
  pendingQuestion: PendingQuestion | null;
  qaHistory: QaEntry[];
  generatedAt: string | null;
  cached: boolean;
  rawBuffer: string;
}

const initialState: IssueFinderState = {
  selectedRepository: null,
  data: null,
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
  | { payload: IssueFinderPayload; raw: string }
  | { authUrls: AuthUrl[] }
  | { question: PendingQuestion }
  | { error: string }
> {
  const result = await consumeAgentStream<IssueFinderPayload>(
    url,
    {
      onPhase: () => dispatch(issueFinderSlice.actions.phaseChanged("running")),
      onEvent: (event: StepEvent) => {
        if (event.type === "text_delta") {
          dispatch(issueFinderSlice.actions.textDeltaReceived(event.delta));
        } else {
          dispatch(issueFinderSlice.actions.stepEventReceived(event));
        }
      },
      onAuthRequired: (authUrls) =>
        dispatch(issueFinderSlice.actions.authRequired(authUrls)),
      onQuestionRequired: (question) =>
        dispatch(issueFinderSlice.actions.questionRequired(question)),
    },
    body,
  );

  if (result.kind === "error") return { error: result.message };
  if (result.kind === "auth_required") return { authUrls: result.authUrls };
  if (result.kind === "question_required") return { question: result.question };
  if (result.kind === "cancelled")
    return { error: "The run was cancelled before it finished." };
  return { payload: result.data, raw: result.raw };
}

async function commitIssueFinderResult(payload: {
  payload: IssueFinderPayload;
  raw: string;
}) {
  const res = await fetch(`${API_BASE}/commit`, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: payload.payload, raw: payload.raw }),
  });

  if (!res.ok) {
    let message = `Commit failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response body wasn't JSON — fall back to the status message above
    }
    throw new Error(message);
  }
}

/**
 * Wraps commitIssueFinderResult so every call site turns a thrown commit
 * failure into a plain { error } shape instead of letting it reject the
 * thunk with an unhandled exception. Keeps the three thunks below symmetric.
 */
async function commitOrError(result: {
  payload: IssueFinderPayload;
  raw: string;
}): Promise<{ error: string } | null> {
  try {
    await commitIssueFinderResult(result);
    return null;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save results",
    };
  }
}

/**
 * Kicks off a fresh run against the already-selected repository. Ends in one
 * of: final payload, waiting on GitHub auth, or waiting on the agent's first
 * question (contribution type / difficulty / time / goal).
 */
export const startIssueFinder = createAsyncThunk<
  | { payload: IssueFinderPayload; raw: string; generatedAt: string }
  | { authUrls: AuthUrl[] }
  | { question: PendingQuestion }
  | null,
  SelectedRepository,
  { rejectValue: string }
>(
  "issueFinder/start",
  async (selectedRepository, { dispatch, rejectWithValue }) => {
    dispatch(issueFinderSlice.actions.streamReset(selectedRepository));

    const result = await runStream(`${API_BASE}/stream`, dispatch, {
      selectedRepository,
    });
    if ("error" in result) return rejectWithValue(result.error);
    if ("authUrls" in result || "question" in result) return result;

    const commitError = await commitOrError(result);
    if (commitError) return rejectWithValue(commitError.error);

    return { ...result, generatedAt: new Date().toISOString() };
  },
);

/**
 * Submits the user's answer to the currently pending question and continues
 * the same paused session. May itself end by asking the *next* question.
 */
export const answerIssueFinderQuestion = createAsyncThunk<
  | { payload: IssueFinderPayload; raw: string; generatedAt: string }
  | { authUrls: AuthUrl[] }
  | { question: PendingQuestion }
  | null,
  string,
  { state: RootState; rejectValue: string }
>(
  "issueFinder/answer",
  async (answer, { dispatch, getState, rejectWithValue }) => {
    const pending = getState().issueFinder.pendingQuestion;
    if (!pending) return rejectWithValue("No pending question to answer");

    dispatch(issueFinderSlice.actions.answerSubmitted({ answer }));

    const result = await runStream(`${API_BASE}/stream/answer`, dispatch, {
      toolCallId: pending.toolCallId,
      answer,
    });
    if ("error" in result) return rejectWithValue(result.error);
    if ("authUrls" in result || "question" in result) return result;

    const commitError = await commitOrError(result);
    if (commitError) return rejectWithValue(commitError.error);

    return { ...result, generatedAt: new Date().toISOString() };
  },
);

export const resumeIssueFinderStream = createAsyncThunk<
  { payload: IssueFinderPayload; raw: string; generatedAt: string } | null,
  void,
  { rejectValue: string }
>("issueFinder/resume", async (_, { dispatch, rejectWithValue }) => {
  const result = await runStream(`${API_BASE}/stream/resume`, dispatch);
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result || "question" in result)
    return rejectWithValue("Still waiting on GitHub authorization");

  const commitError = await commitOrError(result);
  if (commitError) return rejectWithValue(commitError.error);

  return { ...result, generatedAt: new Date().toISOString() };
});

export const fetchCachedIssues = createAsyncThunk(
  "issueFinder/fetchCached",
  async () => {
    const res = await fetch(API_BASE, {
      credentials: "include",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });
    return res.json() as Promise<{
      success: boolean;
      matchedIssues: MatchedIssue[] | null;
      repository: string | null;
      contributionIntent: ContributionIntent | null;
      cached: boolean;
      generatedAt: string | null;
    }>;
  },
);

function applyFinalPayload(
  state: IssueFinderState,
  payload: IssueFinderPayload,
  generatedAt: string,
) {
  state.status = "succeeded";
  state.data = payload;
  state.generatedAt = generatedAt;
  state.cached = false;
  state.pendingQuestion = null;
}

const issueFinderSlice = createSlice({
  name: "issueFinder",
  initialState,
  reducers: {
    phaseChanged(state, action: PayloadAction<IssueFinderRunStatus>) {
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
      state.streamingData = parsePartialJson<IssueFinderPayload>(
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
    streamReset(state, action: PayloadAction<SelectedRepository>) {
      state.selectedRepository = action.payload;
      state.steps = [];
      state.streamingData = null;
      state.rawBuffer = "";
      state.error = null;
      state.authUrls = [];
      state.pendingQuestion = null;
      state.qaHistory = [];
      state.data = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startIssueFinder.pending, (state) => {
        state.status = "connecting";
      })
      .addCase(startIssueFinder.fulfilled, (state, action) => {
        if (action.payload && "payload" in action.payload) {
          applyFinalPayload(
            state,
            action.payload.payload,
            action.payload.generatedAt,
          );
        }
      })
      .addCase(startIssueFinder.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ?? action.error.message ?? "Failed to find issues.";
      })
      .addCase(answerIssueFinderQuestion.pending, (state) => {
        state.status = "running";
      })
      .addCase(answerIssueFinderQuestion.fulfilled, (state, action) => {
        if (action.payload && "payload" in action.payload) {
          applyFinalPayload(
            state,
            action.payload.payload,
            action.payload.generatedAt,
          );
        }
      })
      .addCase(answerIssueFinderQuestion.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to submit your answer.";
      })
      .addCase(resumeIssueFinderStream.pending, (state) => {
        state.status = "running";
      })
      .addCase(resumeIssueFinderStream.fulfilled, (state, action) => {
        if (action.payload) {
          applyFinalPayload(
            state,
            action.payload.payload,
            action.payload.generatedAt,
          );
        }
      })
      .addCase(resumeIssueFinderStream.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to resume issue matching.";
      })
      .addCase(fetchCachedIssues.fulfilled, (state, action) => {
        if (action.payload.matchedIssues?.length) {
          state.data = {
            repository: action.payload.repository ?? "",
            contributionIntent: action.payload.contributionIntent ?? {
              contributionTypes: [],
              difficulty: "",
              timeAvailable: "",
              goal: "",
            },
            matchedIssues: action.payload.matchedIssues,
          };
          state.cached = action.payload.cached;
          state.generatedAt = action.payload.generatedAt;
          state.status = "succeeded";
        }
      });
  },
});

export const {
  resetIssueFinder,
  // Dispatched from RecommendationsStage's "Find issues" button — pre-loads
  // the picked repo and clears any previous run before navigating to /issues.
  selectRepositoryForIssues,
} = {
  resetIssueFinder: issueFinderSlice.actions.streamReset,
  selectRepositoryForIssues: issueFinderSlice.actions.streamReset,
};
export default issueFinderSlice.reducer;
export const selectIssueFinder = (state: RootState) => state.issueFinder;
