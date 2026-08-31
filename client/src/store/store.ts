import {
  combineReducers,
  configureStore,
  type Reducer,
} from "@reduxjs/toolkit";
import {
  persistStore,
  persistReducer,
  type PersistConfig,
} from "redux-persist";
import authReducer from "./authSlice";
import devProfileReducer from "./profileSlice";
import repos from "./recommendationsSlice";
import repoKanbanReducer from "./repoKanbanSlice";
import issueFinderReducer from "./issueFinderSlice";
import issueResolutionReducer from "./issueResolutionSlice";
import { dropTransientRunState } from "./persistTransform";
import storage from "./localStorageEngine";
import type { PersistPartial } from "redux-persist/es/persistReducer";

const rootReducer = combineReducers({
  auth: authReducer,
  devProfile: devProfileReducer,
  repos,
  repoKanban: repoKanbanReducer,
  issueFinder: issueFinderReducer,
  issueResolution: issueResolutionReducer,
});

type RootReducerState = ReturnType<typeof rootReducer>;

const persistConfig: PersistConfig<RootReducerState> = {
  key: "compass",
  storage,
  whitelist: ["devProfile", "repos", "issueFinder", "issueResolution"],
  transforms: [dropTransientRunState],
};

// persistReducer genuinely injects a `_persist` field into state at
// runtime, so RootState below reflects that honestly instead of casting
// it away — casting away a real field is what caused the previous error.
const persistedReducer = persistReducer(persistConfig, rootReducer) as Reducer<
  RootReducerState & PersistPartial
>;

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = RootReducerState & PersistPartial;
export type AppDispatch = typeof store.dispatch;
