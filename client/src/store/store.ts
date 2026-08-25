import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import ossReducer from "./ossSlice";
import issuesReducer from "./issuesSlice";
import investigationReducer from "./investigationSlice";
import fileContentReducer from "./fileContentSlice";
import devProfileReducer from "./devProfileSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    oss: ossReducer,
    issues: issuesReducer,
    fileContent: fileContentReducer,
    devProfile: devProfileReducer,
    investigation: investigationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
