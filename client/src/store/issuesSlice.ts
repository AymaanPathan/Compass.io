/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "./store";
import api from "../api/axios";

export interface GithubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: string[];
  createdAt: string;
}

interface IssuesState {
  repoFullName: string | null;
  issues: GithubIssue[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: IssuesState = {
  repoFullName: null,
  issues: [],
  status: "idle",
  error: null,
};

export const fetchIssuesForRepo = createAsyncThunk<
  { issues: GithubIssue[]; repository: string; repoFullName: string },
  string,
  { state: RootState; rejectValue: string }
>("issues/fetch", async (repoFullName, { getState, rejectWithValue }) => {
  const existing = getState().issues;
  console.log(
    `[issues/fetch] dispatch for ${repoFullName}, existing state:`,
    existing,
  );

  try {
    const res = await api.post("/api/issues/fetch", { repoFullName });
    return { ...res.data, repoFullName };
  } catch (err: any) {
    return rejectWithValue(
      err.response?.data?.error || "Failed to fetch issues",
    );
  }
});

const issuesSlice = createSlice({
  name: "issues",
  initialState,
  reducers: {
    resetIssues: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIssuesForRepo.pending, (state, action) => {
        // Mark which repo is in-flight immediately so a second dispatch
        // for the same repo (see the guard above) reads accurate state.
        state.status = "loading";
        state.error = null;
        state.repoFullName = action.meta.arg;
        state.issues = [];
      })
      .addCase(fetchIssuesForRepo.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.repoFullName = action.payload.repoFullName;
        state.issues = action.payload.issues;
      })
      .addCase(fetchIssuesForRepo.rejected, (state, action) => {
        // A "__SKIP__" rejection means we deliberately didn't fire a
        // duplicate request — leave whatever state is already in place
        // (loading or succeeded) instead of surfacing it as an error.
        if (action.payload === "__SKIP__") return;

        state.status = "failed";
        state.error = action.payload || "Failed to fetch issues";
      });
  },
});

export const { resetIssues } = issuesSlice.actions;
export default issuesSlice.reducer;
