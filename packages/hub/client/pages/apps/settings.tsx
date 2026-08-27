import { Navigate, useParams } from 'react-router';

export default function LegacyAppSettingsRedirect() {
  const { appId = '' } = useParams();
  return (
    <Navigate to={`/apps/${encodeURIComponent(appId)}/resources`} replace />
  );
}
