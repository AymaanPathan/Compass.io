import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "./store";

export interface OssRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string;
  primaryTechnology: string;
  fitScore: number;
  whyItMatches: string;
  difficulty: "intermediate";
}

interface DiscoverResult {
  success: boolean;
  repository: OssRepository | null;
  raw?: string;
  sessionId?: string;
}

interface OssState {
  repository: OssRepository | null;
  sessionId: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: OssState = {
  repository: null,
  sessionId: null,
  status: "idle",
  error: null,
};

export const findOssRepository = createAsyncThunk<
  DiscoverResult,
  void,
  {
    state: RootState;
    rejectValue: string;
  }
>("oss/discover", async (_, { getState, rejectWithValue }) => {
  const { profile } = getState().devProfile;

  if (!profile) {
    return rejectWithValue("Developer profile not loaded yet");
  }

  try {
    const response = await fetch(
      `${
        import.meta.env.VITE_API_URL || "http://localhost:5000"
      }/api/oss/discover`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          developerProfile: profile,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return rejectWithValue(data.error || "Failed to discover repository");
    }

    return data;
  } catch {
    return rejectWithValue("Couldn't reach the agent service");
  }
});

const ossSlice = createSlice({
  name: "oss",

  initialState,

  reducers: {
    resetOssRecommendation: (state) => {
      state.repository = null;
      state.sessionId = null;
      state.status = "idle";
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(findOssRepository.pending, (state) => {
        state.status = "loading";
        state.repository = null;
        state.error = null;
      })

      .addCase(findOssRepository.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.repository = action.payload.repository;
        state.sessionId = action.payload.sessionId ?? null;
      })

      .addCase(findOssRepository.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || "Failed to discover repository";
      });
  },
});

export const { resetOssRecommendation } = ossSlice.actions;

export default ossSlice.reducer;
