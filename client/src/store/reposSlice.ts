import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchRepoRecommendations } from "../api/axios";
import type { MatchedRepository } from "../types";

interface ReposState {
  data: MatchedRepository[] | null;
  status: "idle" | "running" | "succeeded" | "failed";
  error: string | null;
  generatedAt: string | null;
  cached: boolean;
}

const initialState: ReposState = {
  data: null,
  status: "idle",
  error: null,
  generatedAt: null,
  cached: false,
};

export const runRepoAgent = createAsyncThunk(
  "repos/run",
  async (force: boolean = false) => {
    return await fetchRepoRecommendations(force);
  },
);

const reposSlice = createSlice({
  name: "repos",
  initialState,
  reducers: {
    resetRepos: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(runRepoAgent.pending, (state) => {
        state.status = "running";
        state.error = null;
      })
      .addCase(runRepoAgent.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload.matchedRepositories;
        state.cached = action.payload.cached;
        state.generatedAt = action.payload.generatedAt ?? null;
      })
      .addCase(runRepoAgent.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.error.message ?? "Failed to fetch recommendations.";
      });
  },
});

export const { resetRepos } = reposSlice.actions;
export default reposSlice.reducer;
