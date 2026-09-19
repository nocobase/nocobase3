import { Configuration } from '../configuration.js';
import { AppTabLoading, useHubAppPage } from '../app-page.js';
import type { ReactElement } from 'react';

export default function ConfigurationPage(): ReactElement {
  const context = useHubAppPage();
  if (context.panelLoading) return <AppTabLoading />;
  return (
    <Configuration
      key={`${context.app.app.id}:${context.app.app.currentDeploymentId}`}
      mode={context.configMode}
      content={context.configContent}
      busy={context.busy || context.app.hasPendingDeployment}
      canUpdate={context.capabilities['update-config']}
      onSave={context.onSaveConfiguration}
    />
  );
}
