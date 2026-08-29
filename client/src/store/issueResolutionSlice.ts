/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import {
  consumeAgentStream,
  applyEvent,
  type AuthUrl,
  type PendingQuestion,
  type StepEvent,
  type StepNode,
} from "../utils/agentStream";
import type { RootState } from "./store";

const API_ROOT = (import.meta.env.VITE_API_URL ?? "http://localhost:5000").replace(/\/+$/, "");
const API_BASE = `${API_ROOT}/api/issue-resolution`;

export type IssueResolutionPhase = "idle" | "investigating" | "awaiting_approval" | "implementing" | "done";

export type IssueResolutionRunStatus =
  | "idle" | "connecting" | "running" | "auth_required" | "question_required"
  | "succeeded" | "failed" | "cancelled";

export type SolverStatus = "IMPLEMENTED" | "PARTIALLY_IMPLEMENTED" | "BLOCKED" | "NO_CHANGE_REQUIRED" | null;

interface IssueResolutionState {
  issueUrl: string | null;
  phase: IssueResolutionPhase;
  status: IssueResolutionRunStatus;
  steps: StepNode[];
  streamingText: string;
  deepDiveReport: string | null;
  solverReport: string | null;
  solverStatus: SolverStatus;
  error: string | null;
  authUrls: AuthUrl[];
  pendingQuestion: PendingQuestion | null;
  qaHistory: { question: string; answer: string }[];
  cached: boolean;
  generatedAt: string | null;
  rawBuffer: string;
  declined: boolean;
}

const initialState: IssueResolutionState = {
  issueUrl: null,
  phase: "idle",
  status: "idle",
  steps: [],
  streamingText: "",
  deepDiveReport: null,
  solverReport: null,
  solverStatus: null,
  error: null,
  authUrls: [],
  pendingQuestion: null,
  qaHistory: [],
  cached: false,
  generatedAt: null,
  rawBuffer: "",
  declined: false,
};

function parseSolverStatus(report: string): SolverStatus {
  const m = report.match(/##\s*Status\s*\n+\s*(IMPLEMENTED|PARTIALLY_IMPLEMENTED|BLOCKED|NO_CHANGE_REQUIRED)/i);
  return m ? (m[1].toUpperCase() as SolverStatus) : null;
}

async function runTextStream(
  url: string,
  dispatch: (action: any) => void,
  body?: unknown,
): Promise<
  | { text: string } | { authUrls: AuthUrl[] } | { question: PendingQuestion } | { error: string }
> {
  const result = await consumeAgentStream<string>(
    url,
    {
      onPhase: () => dispatch(issueResolutionSlice.actions.phaseChanged("running")),
      onEvent: (event: StepEvent) => {
        if (event.type === "text_delta") {
          dispatch(issueResolutionSlice.actions.textDeltaReceived(event.delta));
        } else {
          dispatch(issueResolutionSlice.actions.stepEventReceived(event));
        }
      },
      onAuthRequired: (authUrls) => dispatch(issueResolutionSlice.actions.authRequired(authUrls)),
      onQuestionRequired: (question) => dispatch(issueResolutionSlice.actions.questionRequired(question)),
    },
    body,
    { parseAs: "text" },
  );

  if (result.kind === "error") return { error: result.message };
  if (result.kind === "auth_required") return { authUrls: result.authUrls };
  if (result.kind === "question_required") return { question: result.question };
  if (result.kind === "cancelled") return { error: "The run was cancelled before it finished." };
  return { text: result.data };
}

async function commitReport(issueUrl: string, phase: "awaiting_approval" | "done", report: string) {
  await fetch(`${API_BASE}/commit`, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ issueUrl, phase, report }),
  });
}

/** Phase A — the Deep Dive investigation. Never modifies the repo. */
export const startIssueResolution = createAsyncThunk<
  { text: string } | { authUrls: AuthUrl[] } | { question: PendingQuestion } | null,
  string,
  { rejectValue: string }
>("issueResolution/start", async (issueUrl, { dispatch, rejectWithValue }) => {
  dispatch(issueResolutionSlice.actions.streamReset(issueUrl));
  const result = await runTextStream(`${API_BASE}/stream`, dispatch, { issueUrl });
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result || "question" in result) return result;
  await commitReport(issueUrl, "awaiting_approval", result.text);
  return result;
});

/** The human approval gate — only fires from an explicit user click. */
export const approveIssueResolution = createAsyncThunk<
  { text: string } | { authUrls: AuthUrl[] } | { question: PendingQuestion } | null,
  void,
  { state: RootState; rejectValue: string }
>("issueResolution/approve", async (_, { dispatch, getState, rejectWithValue }) => {
  const issueUrl = getState().issueResolution.issueUrl;
  if (!issueUrl) return rejectWithValue("No investigation to approve");

  dispatch(issueResolutionSlice.actions.implementationApproved());
  const result = await runTextStream(`${API_BASE}/stream/continue`, dispatch, {
    issueUrl,
    message: "Implement the fix",
  });
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result || "question" in result) return result;
  await commitReport(issueUrl, "done", result.text);
  return result;
});

export const resumeIssueResolutionStream = createAsyncThunk<
  { text: string } | null,
  void,
  { state: RootState; rejectValue: string }
>("issueResolution/resume", async (_, { dispatch, getState, rejectWithValue }) => {
  const issueUrl = getState().issueResolution.issueUrl;
  const result = await runTextStream(`${API_BASE}/stream/resume`, dispatch, { issueUrl });
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result || "question" in result) return rejectWithValue("Still waiting on authorization");
  if (!issueUrl) return result;
  const phase = getState().issueResolution.phase;
  await commitReport(issueUrl, phase === "implementing" ? "done" : "awaiting_approval", result.text);
  return result;
});

export const answerIssueResolutionQuestion = createAsyncThunk<
  { text: string } | { authUrls: AuthUrl[] } | { question: PendingQuestion } | null,
  string,
  { state: RootState; rejectValue: string }
>("issueResolution/answer", async (answer, { dispatch, getState, rejectWithValue }) => {
  const pending = getState().issueResolution.pendingQuestion;
  const issueUrl = getState().issueResolution.issueUrl;
  if (!pending) return rejectWithValue("No pending question to answer");

  dispatch(issueResolutionSlice.actions.answerSubmitted({ answer }));
  const result = await runTextStream(`${API_BASE}/stream/answer`, dispatch, {
    issueUrl,
    toolCallId: pending.toolCallId,
    threadId: pending.threadId,
    answer,
  });
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result || "question" in result) return result;
  if (issueUrl) {
    const phase = getState().issueResolution.phase;
    await commitReport(issueUrl, phase === "implementing" ? "done" : "awaiting_approval", result.text);
  }
  return result;
});

export const fetchCachedIssueResolution = createAsyncThunk(
  "issueResolution/fetchCached",
  async (issueUrl: string) => {
    const res = await fetch(`${API_BASE}?issueUrl=${encodeURIComponent(issueUrl)}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
    });
    return res.json() as Promise<{
      success: boolean;
      run: {
        issueUrl: string;
        phase: IssueResolutionPhase;
        deepDiveReport: string | null;
        solverReport: string | null;
        solverStatus: SolverStatus;
        generatedAt: string;
      } | null;
    }>;
  },
);

function applyResult(state: IssueResolutionState, text: string, nextPhase: "awaiting_approval" | "done") {
  state.status = "succeeded";
  state.phase = nextPhase;
  state.pendingQuestion = null;
  state.cached = false;
  state.generatedAt = new Date().toISOString();
  if (nextPhase === "awaiting_approval") {
    state.deepDiveReport = text;
  } else {
    state.solverReport = text;
    state.solverStatus = parseSolverStatus(text);
  }
}

const issueResolutionSlice = createSlice({
  name: "issueResolution",
  initialState,
  reducers: {
    phaseChanged(state, action: PayloadAction<IssueResolutionRunStatus>) {
      state.status = action.payload;
    },
    stepEventReceived(state, action: PayloadAction<StepEvent>) {
      const next = applyEvent(
        { steps: state.steps, status: state.status, error: state.error, authUrls: state.authUrls, pendingQuestion: state.pendingQuestion },
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
      state.streamingText = state.rawBuffer;
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
        state.qaHistory.push({ question: state.pendingQuestion.question, answer: action.payload.answer });
      }
      state.pendingQuestion = null;
      state.status = "running";
    },
    implementationApproved(state) {
      state.phase = "implementing";
      state.status = "connecting";
      state.steps = [];
      state.rawBuffer = "";
      state.streamingText = "";
      state.declined = false;
    },
    declineImplementation(state) {
      state.declined = true;
    },
    streamReset(state, action: PayloadAction<string>) {
      Object.assign(state, initialState);
      state.issueUrl = action.payload;
      state.phase = "investigating";
    },
    resetIssueResolution() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startIssueResolution.pending, (state) => { state.status = "connecting"; })
      .addCase(startIssueResolution.fulfilled, (state, action) => {
        if (action.payload && "text" in action.payload) applyResult(state, action.payload.text, "awaiting_approval");
      })
      .addCase(startIssueResolution.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? action.error.message ?? "Investigation failed.";
      })
      .addCase(approveIssueResolution.fulfilled, (state, action) => {
        if (action.payload && "text" in action.payload) applyResult(state, action.payload.text, "done");
      })
      .addCase(approveIssueResolution.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? action.error.message ?? "Implementation failed.";
      })
      .addCase(resumeIssueResolutionStream.fulfilled, (state, action) => {
        if (action.payload && "text" in action.payload) {
          applyResult(state, action.payload.text, state.phase === "implementing" ? "done" : "awaiting_approval");
        }
      })
      .addCase(resumeIssueResolutionStream.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? action.error.message ?? "Failed to resume.";
      })
      .addCase(answerIssueResolutionQuestion.fulfilled, (state, action) => {
        if (action.payload && "text" in action.payload) {
          applyResult(state, action.payload.text, state.phase === "implementing" ? "done" : "awaiting_approval");
        }
      })
      .addCase(fetchCachedIssueResolution.fulfilled, (state, action) => {
        const run = action.payload.run;
        if (run) {
          state.issueUrl = run.issueUrl;
          state.phase = run.phase;
          state.deepDiveReport = run.deepDiveReport;
          state.solverReport = run.solverReport;
          state.solverStatus = run.solverStatus;
          state.generatedAt = run.generatedAt;
          state.cached = true;
          state.status = "succeeded";
        }
      });
  },
});

export const { resetIssueResolution, declineImplementation, streamReset: selectIssueForResolution } =
  issueResolutionSlice.actions;
export default issueResolutionSlice.reducer;
export const selectIssueResolution = (state: RootState) => state.issueResolution;