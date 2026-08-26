import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchMe, logout as logoutRequest } from "../api/axios";

export interface AuthUser {
  _id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email?: string;
}

interface AuthState {
  user: AuthUser | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
}

const initialState: AuthState = {
  user: null,
  status: "idle",
};

export const loadCurrentUser = createAsyncThunk(
  "auth/loadCurrentUser",
  async () => {
    return await fetchMe();
  },
);

export const logout = createAsyncThunk("auth/logout", async () => {
  await logoutRequest();
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadCurrentUser.pending, (state) => {
        state.status = "loading";
      })
      .addCase(loadCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = "authenticated";
      })
      .addCase(loadCurrentUser.rejected, (state) => {
        state.user = null;
        state.status = "unauthenticated";
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.status = "unauthenticated";
      });
  },
});

export default authSlice.reducer;
