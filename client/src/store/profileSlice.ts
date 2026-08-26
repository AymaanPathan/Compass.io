import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchDeveloperProfile } from "../api/axios";
import type { DeveloperProfile } from "../types";

interface ProfileState {
  data: DeveloperProfile | null;
  parseFailed: boolean;
  raw: string | null;
  status: "idle" | "running" | "succeeded" | "failed";
  error: string | null;
  generatedAt: string | null;
  cached: boolean;
}

const initialState: ProfileState = {
  data: null,
  parseFailed: false,
  raw: null,
  status: "idle",
  error: null,
  generatedAt: null,
  cached: false,
};

export const runProfileAgent = createAsyncThunk(
  "profile/run",
  async (force: boolean = false) => {
    return await fetchDeveloperProfile(force);
  },
);

const profileSlice = createSlice({
  name: "profile",
  initialState,
  reducers: {
    resetProfile: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(runProfileAgent.pending, (state) => {
        state.status = "running";
        state.error = null;
      })
      .addCase(runProfileAgent.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload.profile;
        state.raw = action.payload.raw;
        state.parseFailed = action.payload.parseFailed;
        state.cached = action.payload.cached;
        state.generatedAt = action.payload.generatedAt ?? null;
      })
      .addCase(runProfileAgent.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.error.message ?? "Failed to analyze GitHub profile.";
      });
  },
});

export const { resetProfile } = profileSlice.actions;
export default profileSlice.reducer;
