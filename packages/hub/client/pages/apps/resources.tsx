import { useParams } from 'react-router';

import AppResourceBindings from '@/features/apps/app-resource-bindings';
import { displayAppName } from '@/features/apps/presentation';
import { useReleaseManagement } from '@nocobase/hub-release-management/client';

export default function AppRuntimeResources() {
  const { appId = '' } = useParams();
  const { scopedOverview, busy, error, refresh } = useReleaseManagement({
    appId,
  });
  const app = scopedOverview.apps[0];

  return (
    <AppResourceBindings
      appId={appId}
      appName={app?.name ?? displayAppName(appId)}
      accessUrl={app?.accessUrl}
      runtimeResources={app?.resources}
      loading={busy}
      error={error}
      onRefresh={() => void refresh()}
    />
  );
}
