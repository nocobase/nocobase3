import { useParams } from 'react-router';
import { useReleaseManagement } from '@nocobase/hub-release-management/client';

import { ReleaseManagementDashboard } from '@/features/deployments/release-management-dashboard';

export default function AppDeploymentsPage() {
  const { appId = '' } = useParams();
  const { scopedOverview, busy, error, refresh, run, decide } =
    useReleaseManagement({ appId });

  return (
    <ReleaseManagementDashboard
      overview={scopedOverview}
      scope='app'
      busy={busy}
      error={error}
      onRefresh={() => void refresh()}
      onExecute={(input) => void run(input)}
      onDecide={(input) => void decide(input)}
    />
  );
}
