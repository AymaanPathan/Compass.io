import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import devProfileReducer from "./profileSlice";
import repos from "./recommendationsSlice";
import repoKanbanReducer from "./repoKanbanSlice";
import issueFinderReducer from "./issueFinderSlice";


export const store = configureStore({
  reducer: {
    auth: authReducer,
    devProfile: devProfileReducer,
    repos,
    repoKanban: repoKanbanReducer,
    issueFinder: issueFinderReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
