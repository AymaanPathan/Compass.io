/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppDispatch } from "./store";

export interface SolverInput {
  matchedRepository: {
    name: string;
    url: string;
    description: string;
    whyItMatches: string;
  };
  issue: { title: string; url: string };
  explanation: {
    whatIsHappening: string;
    whyItMatters: string;
    howToThinkAboutFixingIt: string;
    thingsToKeepInMind: string[];
  };
  solveApproach: {
    summary: string;
    steps: string[];
    risks: string[];
    testingNotes: string;
  };
  relevantFiles: {
    path: string;
    url: string;
    whyRelevant: string;
    keySymbols: string[];
  }[];
}

export interface SolverAgentResult {
  status: "success" | "blocked" | "failed";
  reason?: string;
  issue?: { title: string; url: string };
  implementation?: {
    summary: string;
    filesChanged: { path: string; change: string }[];
  };
  validation?: {
    testsRun: { command: string; result: string }[];
    testSummary: string;
    diffCheck: string;
  };
  finalDiff?: { filesChanged: number; insertions: number; deletions: number };
  raw?: string;
}

export interface SolverLog {
  ts: number;
  level: "info" | "warn" | "error";
  message: string;
}

export interface SolverStep {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  detail?: string;
  ts: number;
}

export interface SolverWaiting {
  reason: "rate_limited" | "retryable" | "cancelled";
  waitMs: number;
  attempt: number;
  maxAttempts: number;
  startedAt: number;
}

type SolverStreamEvent =
  | {
      type: "log";
      ts: number;
      level: "info" | "warn" | "error";
      message: string;
    }
  | {
      type: "step";
      ts: number;
      stepId: string;
      label: string;
      status: "running" | "done" | "error";
      detail?: string;
    }
  | { type: "reasoning"; ts: number; text: string }
  | {
      type: "waiting";
      ts: number;
      reason: "rate_limited" | "retryable" | "cancelled";
      waitMs: number;
      attempt: number;
      maxAttempts: number;
    }
  | { type: "result"; ts: number; result: SolverAgentResult }
  | { type: "fatal"; ts: number; error: string };

interface SolverState {
  input: SolverInput | null;
  status: "idle" | "running" | "succeeded" | "failed";
  logs: SolverLog[];
  steps: SolverStep[];
  reasoning: string;
  waiting: SolverWaiting | null;
  result: SolverAgentResult | null;
  error: string | null;
}

const initialState: SolverState = {
  input: null,
  status: "idle",
  logs: [],
  steps: [],
  reasoning: "",
  waiting: null,
  result: null,
  error: null,
};

const MAX_LOGS = 300;

const solverSlice = createSlice({
  name: "solver",
  initialState,
  reducers: {
    resetSolver: () => initialState,

    solverStarted(state, action: PayloadAction<SolverInput>) {
      state.input = action.payload;
      state.status = "running";
      state.logs = [];
      state.steps = [];
      state.reasoning = "";
      state.waiting = null;
      state.result = null;
      state.error = null;
    },

    logAppended(state, action: PayloadAction<SolverLog>) {
      state.waiting = null; // forward progress implies any prior wait is over
      state.logs.push(action.payload);
      if (state.logs.length > MAX_LOGS) {
        state.logs.splice(0, state.logs.length - MAX_LOGS);
      }
    },

    stepUpserted(
      state,
      action: PayloadAction<{
        id: string;
        label: string;
        status: "running" | "done" | "error";
        detail?: string;
        ts: number;
      }>,
    ) {
      state.waiting = null;
      const existing = state.steps.find((s) => s.id === action.payload.id);
      if (existing) {
        existing.status = action.payload.status;
        existing.detail = action.payload.detail ?? existing.detail;
        existing.ts = action.payload.ts;
      } else {
        state.steps.push({
          id: action.payload.id,
          label: action.payload.label,
          status: action.payload.status,
          detail: action.payload.detail,
          ts: action.payload.ts,
        });
      }
    },

    reasoningAppended(state, action: PayloadAction<string>) {
      state.reasoning += action.payload;
    },

    waitingSet(state, action: PayloadAction<Omit<SolverWaiting, "startedAt">>) {
      state.waiting = { ...action.payload, startedAt: Date.now() };
    },

    resultReceived(state, action: PayloadAction<SolverAgentResult>) {
      state.waiting = null;
      state.result = action.payload;
      state.status =
        action.payload.status === "success" ? "succeeded" : "failed";
    },

    fatalErrorReceived(state, action: PayloadAction<string>) {
      state.waiting = null;
      state.status = "failed";
      state.error = action.payload;
    },
  },
});

export const {
  resetSolver,
  solverStarted,
  logAppended,
  stepUpserted,
  reasoningAppended,
  waitingSet,
  resultReceived,
  fatalErrorReceived,
} = solverSlice.actions;

export default solverSlice.reducer;

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

function dispatchSolverEvent(
  dispatch: AppDispatch,
  payload: SolverStreamEvent,
) {
  switch (payload.type) {
    case "log":
      dispatch(
        logAppended({
          ts: payload.ts,
          level: payload.level,
          message: payload.message,
        }),
      );
      return;
    case "step":
      dispatch(
        stepUpserted({
          id: payload.stepId,
          label: payload.label,
          status: payload.status,
          detail: payload.detail,
          ts: payload.ts,
        }),
      );
      return;
    case "reasoning":
      dispatch(reasoningAppended(payload.text));
      return;
    case "waiting":
      dispatch(
        waitingSet({
          reason: payload.reason,
          waitMs: payload.waitMs,
          attempt: payload.attempt,
          maxAttempts: payload.maxAttempts,
        }),
      );
      return;
    case "result":
      dispatch(resultReceived(payload.result));
      return;
    case "fatal":
      dispatch(fatalErrorReceived(payload.error));
      return;
  }
}

/**
 * Runs the solver agent as a streaming SSE request. Not a createAsyncThunk
 * since results arrive incrementally over the connection rather than as one
 * settle — each `data: ...` frame from the server is dispatched as it lands.
 */
export function runSolverAgent(input: SolverInput) {
  return async (dispatch: AppDispatch) => {
    dispatch(solverStarted(input));

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/solver/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
    } catch (err: any) {
      dispatch(
        fatalErrorReceived(err?.message || "Failed to reach solver agent"),
      );
      return;
    }

    if (!res.ok || !res.body) {
      const errBody = await res.json().catch(() => null);
      dispatch(
        fatalErrorReceived(
          errBody?.error || `Request failed with status ${res.status}`,
        ),
      );
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);

          if (!rawEvent.startsWith("data:")) continue; // skip heartbeat comments

          const jsonStr = rawEvent.replace(/^data:\s*/, "");
          try {
            const payload = JSON.parse(jsonStr) as SolverStreamEvent;
            dispatchSolverEvent(dispatch, payload);
          } catch {
            console.warn("[solver] failed to parse SSE payload:", jsonStr);
          }
        }
      }
    } catch (err: any) {
      dispatch(fatalErrorReceived(err?.message || "Stream connection lost"));
    }
  };
}
