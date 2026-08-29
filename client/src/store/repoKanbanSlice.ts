import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { RootState } from "./store";

const API_ROOT = (
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");
const API_BASE = `${API_ROOT}/api/kanban`;

export type KanbanStatus = "selected" | "in_progress" | "contributed";

export const KANBAN_COLUMNS: { value: KanbanStatus; label: string }[] = [
  { value: "selected", label: "Selected" },
  { value: "in_progress", label: "In Progress" },
  { value: "contributed", label: "Contributed" },
];

export interface KanbanItem {
  _id: string;
  name: string;
  url: string;
  description: string;
  repoType: string;
  whyItMatches: string;
  status: KanbanStatus;
  createdAt: string;
  updatedAt: string;
}

interface KanbanState {
  items: KanbanItem[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  // url of the repo currently being added, so a single card can show a
  // per-card loading state instead of a global spinner.
  addingUrl: string | null;
}

const initialState: KanbanState = {
  items: [],
  status: "idle",
  error: null,
  addingUrl: null,
};

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
    "Content-Type": "application/json",
  };
}

export const fetchKanbanItems = createAsyncThunk<KanbanItem[]>(
  "kanban/fetchAll",
  async () => {
    const res = await fetch(API_BASE, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await res.json();
    return (data.items ?? []) as KanbanItem[];
  },
);

export const addToKanban = createAsyncThunk<
  KanbanItem,
  {
    name: string;
    url: string;
    description: string;
    repoType: string;
    whyItMatches: string;
    status: KanbanStatus;
  },
  { rejectValue: string }
>("kanban/add", async (payload, { rejectWithValue }) => {
  const res = await fetch(API_BASE, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    return rejectWithValue(data.error ?? "Failed to add repo to board");
  }
  return data.item as KanbanItem;
});

export const moveKanbanItem = createAsyncThunk<
  KanbanItem,
  { id: string; status: KanbanStatus },
  { rejectValue: string }
>("kanban/move", async ({ id, status }, { rejectWithValue }) => {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    return rejectWithValue(data.error ?? "Failed to move card");
  }
  return data.item as KanbanItem;
});

export const removeFromKanban = createAsyncThunk<string, string>(
  "kanban/remove",
  async (id) => {
    await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders(),
    });
    return id;
  },
);

const kanbanSlice = createSlice({
  name: "kanban",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchKanbanItems.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchKanbanItems.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchKanbanItems.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load board";
      })
      .addCase(addToKanban.pending, (state, action) => {
        state.addingUrl = action.meta.arg.url;
      })
      .addCase(
        addToKanban.fulfilled,
        (state, action: PayloadAction<KanbanItem>) => {
          state.addingUrl = null;
          const idx = state.items.findIndex(
            (i) => i._id === action.payload._id,
          );
          if (idx >= 0) state.items[idx] = action.payload;
          else state.items.unshift(action.payload);
        },
      )
      .addCase(addToKanban.rejected, (state, action) => {
        state.addingUrl = null;
        state.error = action.payload ?? "Failed to add repo to board";
      })
      .addCase(moveKanbanItem.fulfilled, (state, action) => {
        const idx = state.items.findIndex((i) => i._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(removeFromKanban.fulfilled, (state, action) => {
        state.items = state.items.filter((i) => i._id !== action.payload);
      });
  },
});

export default kanbanSlice.reducer;
export const selectKanban = (state: RootState) => state.repoKanban;
// Convenience: which repo urls are already on the board (any column).
export const selectKanbanUrls = (state: RootState) =>
  new Set(state.repoKanban.items.map((i) => i.url));
