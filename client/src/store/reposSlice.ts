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
} from "../utils/agentStream";
import { parsePartialJson } from "../utils/partialJson";
import type { MatchedRepository } from "../types";
import type { AgentRunStatus } from "./profileSlice";

const API_ROOT = (
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");
const API_BASE = `${API_ROOT}/api/oss`;

interface RepoRecommendations {
  matchedRepositories: MatchedRepository[];
}

interface OssState {
  data: MatchedRepository[] | null;
  streamingRepos: Partial<RepoRecommendations> | null;
  steps: StepNode[];
  status: AgentRunStatus;
  error: string | null;
  authUrls: AuthUrl[];
  generatedAt: string | null;
  cached: boolean;
  rawBuffer: string;
  /** Has the user ever kicked off a run this session — drives idle-vs-never-started UI. */
  hasStarted: boolean;
}

const initialState: OssState = {
  data: null,
  streamingRepos: null,
  steps: [],
  status: "idle",
  error: null,
  authUrls: [],
  generatedAt: null,
  cached: false,
  rawBuffer: "",
  hasStarted: false,
};

async function runStream(
  url: string,
  dispatch: (action: any) => void,
): Promise<
  | { recs: RepoRecommendations; raw: string }
  | { authUrls: AuthUrl[] }
  | { error: string }
> {
  const result = await consumeAgentStream<RepoRecommendations>(url, {
    onPhase: () => dispatch(ossSlice.actions.phaseChanged("running")),
    onEvent: (event: StepEvent) => {
      if (event.type === "text_delta") {
        dispatch(ossSlice.actions.textDeltaReceived(event.delta));
      } else {
        dispatch(ossSlice.actions.stepEventReceived(event));
      }
    },
    onAuthRequired: (authUrls) =>
      dispatch(ossSlice.actions.authRequired(authUrls)),
  });

  if (result.kind === "error") return { error: result.message };
  if (result.kind === "auth_required") return { authUrls: result.authUrls };
  return { recs: result.data, raw: result.raw };
}

async function commitRecommendations(payload: {
  data: RepoRecommendations;
  raw: string;
}) {
  await fetch(`${API_BASE}/recommendations/commit`, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export const runOssStream = createAsyncThunk<
  | { matchedRepositories: MatchedRepository[]; generatedAt: string }
  | { authUrls: AuthUrl[] }
  | null,
  void,
  { rejectValue: string }
>("oss/stream", async (_, { dispatch, rejectWithValue }) => {
  dispatch(ossSlice.actions.streamReset());

  const result = await runStream(
    `${API_BASE}/recommendations/stream`,
    dispatch,
  );
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result) return result;

  await commitRecommendations({ data: result.recs, raw: result.raw });
  return {
    matchedRepositories: result.recs.matchedRepositories,
    generatedAt: new Date().toISOString(),
  };
});

export const resumeOssStream = createAsyncThunk<
  { matchedRepositories: MatchedRepository[]; generatedAt: string } | null,
  void,
  { rejectValue: string }
>("oss/resumeStream", async (_, { dispatch, rejectWithValue }) => {
  const result = await runStream(
    `${API_BASE}/recommendations/stream/resume`,
    dispatch,
  );
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result)
    return rejectWithValue("Still waiting on GitHub authorization");

  await commitRecommendations({ data: result.recs, raw: result.raw });
  return {
    matchedRepositories: result.recs.matchedRepositories,
    generatedAt: new Date().toISOString(),
  };
});

const ossSlice = createSlice({
  name: "oss",
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
        },
        action.payload,
      );
      state.steps = next.steps;
      state.status = next.status;
      state.error = next.error;
      state.authUrls = next.authUrls;
    },
    textDeltaReceived(state, action: PayloadAction<string>) {
      state.rawBuffer += action.payload;
      state.streamingRepos = parsePartialJson<RepoRecommendations>(
        state.rawBuffer,
      );
    },
    authRequired(state, action: PayloadAction<AuthUrl[]>) {
      state.status = "auth_required";
      state.authUrls = action.payload;
    },
    streamReset(state) {
      state.steps = [];
      state.streamingRepos = null;
      state.rawBuffer = "";
      state.error = null;
      state.authUrls = [];
      state.hasStarted = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runOssStream.pending, (state) => {
        state.status = "connecting";
      })
      .addCase(runOssStream.fulfilled, (state, action) => {
        if (action.payload && "matchedRepositories" in action.payload) {
          state.status = "succeeded";
          state.data = action.payload.matchedRepositories;
          state.generatedAt = action.payload.generatedAt;
          state.cached = false;
        }
      })
      .addCase(runOssStream.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to find repo matches.";
      })
      .addCase(resumeOssStream.pending, (state) => {
        state.status = "running";
      })
      .addCase(resumeOssStream.fulfilled, (state, action) => {
        if (action.payload) {
          state.status = "succeeded";
          state.data = action.payload.matchedRepositories;
          state.generatedAt = action.payload.generatedAt;
          state.cached = false;
        }
      })
      .addCase(resumeOssStream.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to resume repo matching.";
      });
  },
});

export const { resetOss } = { resetOss: ossSlice.actions.streamReset };
export default ossSlice.reducer;
