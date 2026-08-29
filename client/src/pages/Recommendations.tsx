import { useEffect } from "react";
import AppLayout from "../components/AppLayout";
import RecommendationsStage from "../components/RecommendationsStage";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import {
  runRecommendationsStream,
  resumeRecommendationsStream,
  fetchCachedRecommendations,
  selectRecommendations,
} from "../store/recommendationsSlice";

function RecommendationsContent() {
  const dispatch = useAppDispatch();
  const recommendations = useAppSelector(selectRecommendations);

  useEffect(() => {
    if (recommendations.status === "idle") {
      dispatch(fetchCachedRecommendations());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RecommendationsStage
      status={recommendations.status}
      repos={recommendations.data}
      steps={recommendations.steps}
      authUrls={recommendations.authUrls}
      error={recommendations.error}
      cached={recommendations.cached}
      onStart={() => dispatch(runRecommendationsStream())}
      onResume={() => dispatch(resumeRecommendationsStream())}
    />
  );
}

export default function Recommendations() {
  return (
    <AppLayout>
      <RecommendationsContent />
    </AppLayout>
  );
}
