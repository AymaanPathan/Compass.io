import { useEffect, type JSX } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "./store/storeHook";
import { loadCurrentUser } from "./store/authSlice";
import Landing from "./pages/Landing";
import Sessions from "./pages/Sessions";
import Repositories from "./pages/RepositoriesKanban";
import Issues from "./pages/Issues";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { status } = useAppSelector((s) => s.auth);

  if (status === "idle" || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-800 border-t-emerald-500 animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(loadCurrentUser());
  }, [dispatch]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/sessions"
          element={
            <RequireAuth>
              <Sessions />
            </RequireAuth>
          }
        />
        <Route
          path="/repositories"
          element={
            <RequireAuth>
              <Repositories />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
        <Route
          path="/issues"
          element={
            <RequireAuth>
              <Issues />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
