import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import devProfileReducer from "./profileSlice";
import repos from "./reposSlice";


export const store = configureStore({
  reducer: {
    auth: authReducer,
    devProfile: devProfileReducer,
    repos
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
