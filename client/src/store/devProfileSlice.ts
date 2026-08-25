/* eslint-disable no-useless-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "./store";

interface TechConfidence {
  name: string;
  confidence: number;
}

export interface DeveloperProfile {
  builderArchetype: string;
  developerType: string;
  summary: string;
  githubVibe: string;
  experienceLevel:
    | "Beginner"
    | "Early Intermediate"
    | "Intermediate"
    | "Advanced";
  strongestTechnologies: TechConfidence[];
  strengths: string[];
  engineeringPatterns: string[];
  contributionAreas: string[];
  funInsights: string[];
}

interface ProfileResult {
  profile: DeveloperProfile | null;
  raw: string;
  parseFailed: boolean;
  cached?: boolean;
  generatedAt?: string;
}

interface DevProfileState {
  profile: DeveloperProfile | null;
  parseFailed: boolean;
  raw: string | null;

  // Live streamed agent reasoning
  thinking: string;

  // Live streamed final answer
  liveOutput: string;

  sessionId: string | null;

  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: DevProfileState = {
  profile: null,
  parseFailed: false,
  raw: null,

  thinking: "",
  liveOutput: "",

  sessionId: localStorage.getItem("developer_profile_session_id") ?? null,

  status: "idle",
  error: null,
};

export const fetchDeveloperProfile = createAsyncThunk<
  ProfileResult,
  { refresh?: boolean } | undefined,
  {
    state: RootState;
    rejectValue: string;
  }
>(
  "devProfile/fetch",

  async (opts, { dispatch, rejectWithValue, signal }) => {
    const refresh = opts?.refresh ?? false;

    let res: Response;

    try {
      const url = new URL(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:5000"
        }/api/github/profile`,
      );

      if (refresh) {
        url.searchParams.set("refresh", "true");
      }

      res = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        signal,
      });
    } catch (err) {
      console.error("[fetchDeveloperProfile] fetch failed:", err);

      return rejectWithValue("Couldn't reach the developer profile service");
    }

    if (!res.ok) {
      try {
        const data = await res.json();

        return rejectWithValue(
          data.error || "Failed to analyze GitHub profile",
        );
      } catch {
        return rejectWithValue(`Profile request failed (${res.status})`);
      }
    }

    if (!res.body) {
      return rejectWithValue("Profile response did not contain a stream");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    let result: ProfileResult | null = null;
    let streamError: string | null = null;

    const handleEvent = (rawEvent: string) => {
      const lines = rawEvent.split("\n");

      const eventLine = lines.find((line) => line.startsWith("event:"));

      const dataLine = lines.find((line) => line.startsWith("data:"));

      let event = "done";
      let data: any;

      try {
        // Normal SSE event
        if (dataLine) {
          event = eventLine
            ? eventLine.replace("event:", "").trim()
            : "message";

          data = JSON.parse(dataLine.replace("data:", "").trim());
        } else {
          // Support raw JSON response
          data = JSON.parse(rawEvent.trim());
          event = "done";
        }
      } catch {
        console.warn(
          "[fetchDeveloperProfile] failed to parse event:",
          rawEvent,
        );

        return;
      }

      console.log("[fetchDeveloperProfile] event:", event, data);

      if (event === "session") {
        dispatch(streamProfileSession(data.sessionId ?? null));
      }

      if (event === "thinking") {
        dispatch(streamProfileThinking(data.content ?? ""));
      }

      if (event === "chunk") {
        dispatch(streamProfileChunk(data.content ?? ""));
      }

      if (event === "error") {
        streamError = data.error || "Developer profile agent failed";
      }

      if (event === "done") {
        // Handle backend response shape
        result = {
          profile: data.profile ?? null,
          raw: data.raw ?? "",
          parseFailed: data.parseFailed ?? false,
          cached: data.cached,
          generatedAt: data.generatedAt,
        };
      }
    };

    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;

      try {
        readResult = await reader.read();
      } catch (err) {
        console.error("[fetchDeveloperProfile] stream disconnected:", err);

        return rejectWithValue("Connection to developer profile agent lost");
      }

      const { value, done } = readResult;

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const events = buffer.split("\n\n");

      buffer = events.pop() || "";

      for (const rawEvent of events) {
        handleEvent(rawEvent);
      }
    }

    // Handle remaining buffered event
    if (buffer.trim()) {
      handleEvent(buffer);
    }

    if (streamError) {
      return rejectWithValue(streamError);
    }
    if (!result) {
      console.error("[fetchDeveloperProfile] stream ended without a result");
      console.log("[fetchDeveloperProfile] last buffer:", buffer);

      return rejectWithValue(
        "Developer profile stream ended without a final result",
      );
    }

    return result;
  },
);

const devProfileSlice = createSlice({
  name: "devProfile",

  initialState,

  reducers: {
    resetDevProfile: (state) => {
      state.profile = null;
      state.parseFailed = false;
      state.raw = null;

      state.thinking = "";
      state.liveOutput = "";

      state.sessionId = null;

      state.status = "idle";
      state.error = null;

      localStorage.removeItem("developer_profile_session_id");
    },

    streamProfileSession: (state, action: { payload: string | null }) => {
      state.sessionId = action.payload;

      if (action.payload) {
        localStorage.setItem("developer_profile_session_id", action.payload);
      } else {
        localStorage.removeItem("developer_profile_session_id");
      }
    },

    streamProfileThinking: (state, action: { payload: string }) => {
      state.thinking += action.payload;
    },

    streamProfileChunk: (state, action: { payload: string }) => {
      state.liveOutput += action.payload;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchDeveloperProfile.pending, (state) => {
        state.status = "loading";

        state.error = null;
        state.profile = null;

        state.thinking = "";
        state.liveOutput = "";
      })

      .addCase(fetchDeveloperProfile.fulfilled, (state, action) => {
        if (!action.payload) {
          state.status = "failed";
          state.error = "Developer profile returned no result";
          return;
        }

        state.status = "succeeded";

        state.profile = action.payload.profile;
        state.raw = action.payload.raw;
        state.parseFailed = action.payload.parseFailed;
      })

      .addCase(fetchDeveloperProfile.rejected, (state, action) => {
        state.status = "failed";

        state.error = action.payload || "Failed to analyze GitHub profile";
      });
  },
});

export const {
  resetDevProfile,
  streamProfileSession,
  streamProfileThinking,
  streamProfileChunk,
} = devProfileSlice.actions;

export default devProfileSlice.reducer;
