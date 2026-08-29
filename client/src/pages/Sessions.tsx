import AppLayout from "../components/AppLayout";
import ProfileStage from "../components/ProfileStage";
import { useAppDispatch, useAppSelector } from "../store/storeHook";
import { runProfileStream, resumeProfileStream } from "../store/profileSlice";

function SessionContent() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => s.devProfile);

  return (
    <ProfileStage
      status={profile.status}
      profile={profile.data}
      streamingProfile={profile.streamingProfile}
      steps={profile.steps}
      authUrls={profile.authUrls}
      error={profile.error}
      cached={profile.cached}
      onStart={() => dispatch(runProfileStream())}
      onResume={() => dispatch(resumeProfileStream())}
      onAdvance={() => {}}
    />
  );
}

export default function Session() {
  return (
    <AppLayout>
      <SessionContent />
    </AppLayout>
  );
}
