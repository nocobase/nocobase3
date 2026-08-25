import { Navigate, useParams } from 'react-router';

export default function AppStorageSettings() {
  const { appId = '' } = useParams();
  return (
    <Navigate to={`/apps/${encodeURIComponent(appId)}/resources`} replace />
  );
}
