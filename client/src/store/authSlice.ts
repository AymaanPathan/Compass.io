/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk,type PayloadAction } from "@reduxjs/toolkit";
import api from "../api/axios";

interface User {
  _id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email?: string;
}

interface AuthState {
  user: User | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  status: "idle",
  error: null,
};

export const fetchCurrentUser = createAsyncThunk(
  "auth/fetchCurrentUser",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get("/api/auth/me");
      return res.data.user as User;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error || "Not authenticated");
    }
  },
);

export const logoutUser = createAsyncThunk("auth/logoutUser", async () => {
  await api.post("/api/auth/logout");
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.pending, (state) => {
        state.status = "loading";
      })
      .addCase(
        fetchCurrentUser.fulfilled,
        (state, action: PayloadAction<User>) => {
          state.status = "authenticated";
          state.user = action.payload;
          state.error = null;
        },
      )
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.status = "unauthenticated";
        state.user = null;
        state.error = action.payload as string;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.status = "unauthenticated";
        state.user = null;
      });
  },
});

export default authSlice.reducer;
