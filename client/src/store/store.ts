import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import devProfileReducer from "./profileSlice";
;

export const store = configureStore({
  reducer: {
    auth: authReducer,
    devProfile: devProfileReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
