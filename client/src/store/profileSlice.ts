/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { consumeAgentStream, type AuthUrl } from "./agentStream";
import { applyEvent, type StepNode } from "../hooks/useAgentStep";
import { parsePartialJson } from "../utils/partialJson";
import type { DeveloperProfile } from "../types";
import type { StepEvent } from "../utils/agentEvents";

const API_ROOT = (
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");
const API_BASE = `${API_ROOT}/api/github`;

export type AgentRunStatus =
  | "idle"
  | "connecting"
  | "running"
  | "auth_required"
  | "succeeded"
  | "failed";

interface DevProfileState {
  data: DeveloperProfile | null;
  streamingProfile: Partial<DeveloperProfile> | null;
  steps: StepNode[];
  status: AgentRunStatus;
  error: string | null;
  authUrls: AuthUrl[];
  generatedAt: string | null;
  cached: boolean;
  rawBuffer: string;
}

const initialState: DevProfileState = {
  data: null,
  streamingProfile: null,
  steps: [],
  status: "idle",
  error: null,
  authUrls: [],
  generatedAt: null,
  cached: false,
  rawBuffer: "",
};

async function runStream(
  url: string,
  dispatch: (action: any) => void,
): Promise<
  | { profile: DeveloperProfile; raw: string }
  | { authUrls: AuthUrl[] }
  | { error: string }
> {
  const result = await consumeAgentStream<DeveloperProfile>(url, {
    onPhase: () => dispatch(devProfileSlice.actions.phaseChanged("running")),
    onEvent: (event: StepEvent) => {
      if (event.type === "text_delta") {
        dispatch(devProfileSlice.actions.textDeltaReceived(event.delta));
      } else {
        dispatch(devProfileSlice.actions.stepEventReceived(event));
      }
    },
    onAuthRequired: (authUrls) =>
      dispatch(devProfileSlice.actions.authRequired(authUrls)),
  });

  if (result.kind === "error") return { error: result.message };
  if (result.kind === "auth_required") return { authUrls: result.authUrls };
  return { profile: result.data, raw: result.raw };
}

async function commitProfile(payload: {
  profile: DeveloperProfile;
  raw: string;
}) {
  await fetch(`${API_BASE}/profile/commit`, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export const runProfileStream = createAsyncThunk<
  | { profile: DeveloperProfile; raw: string; generatedAt: string }
  | { authUrls: AuthUrl[] }
  | null,
  void,
  { rejectValue: string }
>("devProfile/stream", async (_, { dispatch, rejectWithValue }) => {
  dispatch(devProfileSlice.actions.streamReset());

  const result = await runStream(`${API_BASE}/profile/stream`, dispatch);
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result) return result;

  await commitProfile(result);
  return { ...result, generatedAt: new Date().toISOString() };
});

export const resumeProfileStream = createAsyncThunk<
  { profile: DeveloperProfile; raw: string; generatedAt: string } | null,
  void,
  { rejectValue: string }
>("devProfile/resumeStream", async (_, { dispatch, rejectWithValue }) => {
  const result = await runStream(`${API_BASE}/profile/stream/resume`, dispatch);
  if ("error" in result) return rejectWithValue(result.error);
  if ("authUrls" in result)
    return rejectWithValue("Still waiting on GitHub authorization");

  await commitProfile(result);
  return { ...result, generatedAt: new Date().toISOString() };
});

const devProfileSlice = createSlice({
  name: "devProfile",
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
      state.streamingProfile = parsePartialJson<DeveloperProfile>(
        state.rawBuffer,
      );
    },
    authRequired(state, action: PayloadAction<AuthUrl[]>) {
      state.status = "auth_required";
      state.authUrls = action.payload;
    },
    streamReset(state) {
      state.steps = [];
      state.streamingProfile = null;
      state.rawBuffer = "";
      state.error = null;
      state.authUrls = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runProfileStream.pending, (state) => {
        state.status = "connecting";
      })
      .addCase(runProfileStream.fulfilled, (state, action) => {
        if (action.payload && "profile" in action.payload) {
          state.status = "succeeded";
          state.data = action.payload.profile;
          state.generatedAt = action.payload.generatedAt;
          state.cached = false;
        }
      })
      .addCase(runProfileStream.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to analyze GitHub profile.";
      })
      .addCase(resumeProfileStream.pending, (state) => {
        state.status = "running";
      })
      .addCase(resumeProfileStream.fulfilled, (state, action) => {
        if (action.payload) {
          state.status = "succeeded";
          state.data = action.payload.profile;
          state.generatedAt = action.payload.generatedAt;
          state.cached = false;
        }
      })
      .addCase(resumeProfileStream.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to resume profile analysis.";
      });
  },
});

export const { resetProfile } = {
  resetProfile: devProfileSlice.actions.streamReset,
};
export default devProfileSlice.reducer;