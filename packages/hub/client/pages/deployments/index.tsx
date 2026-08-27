import { useReleaseManagement } from '@nocobase/hub-release-management/client';

import { ReleaseManagementDashboard } from '@/features/deployments/release-management-dashboard';

export default function DeploymentsPage() {
  const { overview, busy, error, refresh, run } = useReleaseManagement();

  return (
    <ReleaseManagementDashboard
      overview={overview}
      busy={busy}
      error={error}
      onRefresh={() => void refresh()}
      onExecute={(input) => void run(input)}
    />
  );
}
