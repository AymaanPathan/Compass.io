/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import {
  fetchRepoRecommendations,
  resumeRepoRecommendations,
} from "../api/axios";

import type { MatchedRepository } from "../types";

interface AuthUrl {
  name: string;
  authUrl: string;
}

interface RepoRecommendationsResponse {
  success: true;
  status: "done";
  matchedRepositories: MatchedRepository[];
  cached: boolean;
  generatedAt?: string;
}

interface RepoAuthRequiredResponse {
  success: false;
  status: "auth_required";
  sessionId: string;
  authUrls: AuthUrl[];
}

type RepoAgentResponse = RepoRecommendationsResponse | RepoAuthRequiredResponse;

interface ReposState {
  data: MatchedRepository[] | null;

  status: "idle" | "running" | "auth_required" | "succeeded" | "failed";

  error: string | null;

  generatedAt: string | null;

  cached: boolean;

  sessionId: string | null;

  authUrls: AuthUrl[];
}

const initialState: ReposState = {
  data: null,
  status: "idle",
  error: null,
  generatedAt: null,
  cached: false,
  sessionId: null,
  authUrls: [],
};

export const runRepoAgent = createAsyncThunk<
  RepoAgentResponse,
  boolean | undefined,
  {
    rejectValue: string;
  }
>("repos/run", async (force = false, { rejectWithValue }) => {
  try {
    return await fetchRepoRecommendations(force);
  } catch (error: any) {
    return rejectWithValue(
      error?.response?.data?.error ?? "Failed to fetch recommendations.",
    );
  }
});

export const resumeRepoAgent = createAsyncThunk<
  RepoAgentResponse,
  void,
  {
    rejectValue: string;
  }
>("repos/resume", async (_, { rejectWithValue }) => {
  try {
    return await resumeRepoRecommendations();
  } catch (error: any) {
    return rejectWithValue(
      error?.response?.data?.error ?? "Failed to resume recommendations.",
    );
  }
});

const reposSlice = createSlice({
  name: "repos",

  initialState,

  reducers: {
    resetRepos: () => initialState,
  },

  extraReducers: (builder) => {
    builder

      // ─────────────────────────────────────────────
      // Initial recommendation run
      // ─────────────────────────────────────────────

      .addCase(runRepoAgent.pending, (state) => {
        state.status = "running";
        state.error = null;
      })

      .addCase(runRepoAgent.fulfilled, (state, action) => {
        const result = action.payload;

        // Agent needs OAuth/MCP authorization.
        if (result.status === "auth_required") {
          state.status = "auth_required";
          state.sessionId = result.sessionId;
          state.authUrls = result.authUrls;
          state.error = null;

          return;
        }

        // Agent completed successfully.
        state.status = "succeeded";
        state.data = result.matchedRepositories;
        state.cached = result.cached;
        state.generatedAt = result.generatedAt ?? null;

        state.sessionId = null;
        state.authUrls = [];
        state.error = null;
      })

      .addCase(runRepoAgent.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to fetch recommendations.";
      })

      // ─────────────────────────────────────────────
      // Resume after authorization
      // ─────────────────────────────────────────────

      .addCase(resumeRepoAgent.pending, (state) => {
        state.status = "running";
        state.error = null;
      })

      .addCase(resumeRepoAgent.fulfilled, (state, action) => {
        const result = action.payload;

        // Agent may request authorization again.
        if (result.status === "auth_required") {
          state.status = "auth_required";
          state.sessionId = result.sessionId;
          state.authUrls = result.authUrls;
          state.error = null;

          return;
        }

        // Resume completed successfully.
        state.status = "succeeded";
        state.data = result.matchedRepositories;
        state.cached = result.cached;
        state.generatedAt = result.generatedAt ?? null;

        state.sessionId = null;
        state.authUrls = [];
        state.error = null;
      })

      .addCase(resumeRepoAgent.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "Failed to resume recommendations.";
      });
  },
});

export const { resetRepos } = reposSlice.actions;

export default reposSlice.reducer;
