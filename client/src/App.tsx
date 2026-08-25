import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { Routes, Route } from "react-router-dom";
import type { AppDispatch } from "./store/store";
import { fetchCurrentUser } from "./store/authSlice";
import Landing from "./pages/Landing";
import Analysis from "./pages/Analysis";
import RepoDetailPage from "./pages/RepoDetailPage";
import AgentPage from "./pages/AgentPage";
import IssueDetailPage from "./pages/IssueDetailPage";

function App() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/analysis" element={<Analysis />} />
      <Route path="/agent" element={<AgentPage />} />
      <Route path="/repo/:owner/:repo" element={<RepoDetailPage />} />
      <Route
        path="/repo/:owner/:repo/issue/:issueNumber"
        element={<IssueDetailPage />}
      />
    </Routes>
  );
}

export default App;
