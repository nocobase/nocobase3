import { Releases } from '../releases.js';
import { AppTabLoading, useHubAppPage } from '../app-page.js';
import type { ReactElement } from 'react';

export default function ReleasesPage(): ReactElement {
  const context = useHubAppPage();
  if (context.panelLoading) return <AppTabLoading />;
  return (
    <Releases
      app={context.app}
      selected={context.selectedReleaseId}
      canUpload={context.capabilities['upload-release']}
      onSelect={context.onRelease}
      onUpload={context.onUpload}
    />
  );
}
