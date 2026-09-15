import { Resources } from '../resources.js';
import { AppTabLoading, useHubAppPage } from '../app-page.js';
import type { ReactElement } from 'react';

export default function ResourcesPage(): ReactElement {
  const context = useHubAppPage();
  if (context.panelLoading) return <AppTabLoading />;
  return (
    <Resources mode={context.configMode} content={context.configContent} />
  );
}
