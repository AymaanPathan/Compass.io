/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";

interface FileContentPayload {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

interface FileContentState {
  path: string | null;
  content: string | null;
  isTruncated: boolean;
  isBinary: boolean;
  isOpen: boolean;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  currentRequestId: string | null;
}

const initialState: FileContentState = {
  path: null,
  content: null,
  isTruncated: false,
  isBinary: false,
  isOpen: false,
  status: "idle",
  error: null,
  currentRequestId: null,
};

export const fetchFileContent = createAsyncThunk(
  "fileContent/fetch",
  async (payload: FileContentPayload, { rejectWithValue }) => {
    try {
      const res = await api.post("/api/mcp/github/file-contents", payload);
      return res.data.file as {
        content: string;
        isTruncated: boolean;
        isBinary: boolean;
        path: string;
      };
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.error || "Failed to fetch file",
      );
    }
  },
);

const fileContentSlice = createSlice({
  name: "fileContent",
  initialState,
  reducers: {
    closeFileViewer: (state) => {
      state.isOpen = false;
      // Invalidate any in-flight request so a late response can't
      // reopen the modal or overwrite state after it's been closed.
      state.currentRequestId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFileContent.pending, (state, action) => {
        // This is now the only request whose response we'll accept.
        state.currentRequestId = action.meta.requestId;
        state.status = "loading";
        state.error = null;
        state.isOpen = true;
        state.path = action.meta.arg.path;
        state.content = null;
      })
      .addCase(fetchFileContent.fulfilled, (state, action) => {
        // Ignore stale responses from superseded requests.
        if (action.meta.requestId !== state.currentRequestId) return;
        state.status = "succeeded";
        state.content = action.payload.content;
        state.isTruncated = action.payload.isTruncated;
        state.isBinary = action.payload.isBinary;
        state.path = action.payload.path;
      })
      .addCase(fetchFileContent.rejected, (state, action) => {
        if (action.meta.requestId !== state.currentRequestId) return;
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export const { closeFileViewer } = fileContentSlice.actions;
export default fileContentSlice.reducer;
