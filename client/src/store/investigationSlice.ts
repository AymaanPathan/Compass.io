/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "./store";
import api from "../api/axios";

export interface IssueDeepDive {
  repository: string;
  issueNumber: number;
  title: string;
  author: string;
  state: string;
  whatIsTheIssue: string;
  whatIsHappeningNow: string;
  whatShouldHappen: string;
  whyItMatters: string;
  whoWhatIsAffected: string;
  whereInTheProject: string;
  technicalConcepts: string[];
  backgroundContext: string;
}

interface InvestigationState {
  key: string | null; // `${repoFullName}#${issueNumber}`
  data: IssueDeepDive | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: InvestigationState = {
  key: null,
  data: null,
  status: "idle",
  error: null,
};

function makeKey(repoFullName: string, issueNumber: number) {
  return `${repoFullName}#${issueNumber}`;
}

export const fetchIssueDeepDive = createAsyncThunk<
  IssueDeepDive,
  { repoFullName: string; issueNumber: number },
  { state: RootState; rejectValue: string }
>(
  "investigation/fetchDeepDive",
  async ({ repoFullName, issueNumber }, { rejectWithValue }) => {
    try {
      const res = await api.post("/api/issues/deep-dive", {
        repoFullName,
        issueNumber,
      });
      return res.data as IssueDeepDive;
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to run deep dive",
      );
    }
  },
);

const investigationSlice = createSlice({
  name: "investigation",
  initialState,
  reducers: {
    resetInvestigation: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIssueDeepDive.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.key = makeKey(
          action.meta.arg.repoFullName,
          action.meta.arg.issueNumber,
        );
        state.data = null;
      })
      .addCase(fetchIssueDeepDive.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
      })
      .addCase(fetchIssueDeepDive.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || "Failed to run deep dive";
      });
  },
});

export const { resetInvestigation } = investigationSlice.actions;
export default investigationSlice.reducer;