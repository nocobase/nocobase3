import { Deployments } from '../deployments.js';
import { AppTabLoading, useHubAppPage } from '../app-page.js';
import type { ReactElement } from 'react';

export default function DeploymentsPage(): ReactElement {
  const context = useHubAppPage();
  if (context.panelLoading) return <AppTabLoading />;
  return (
    <Deployments
      app={context.app}
      pagination={context.deploymentPagination}
      loading={context.deploymentsLoading}
      onPage={context.onDeploymentPage}
      busy={context.busy || context.deploymentsLoading}
      canDeploy={context.capabilities.deploy}
      canRollback={context.capabilities.rollback}
      onDeploy={context.onDeploy}
      onRollback={context.onRollback}
    />
  );
}
