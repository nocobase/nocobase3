import type { ReactElement } from 'react';
import { useHubAppPage } from '../app-page.js';
import { ApiKeys } from '../api-keys.js';

export default function ApiKeysPage(): ReactElement {
  const { app, capabilities } = useHubAppPage();
  return (
    <ApiKeys
      key={app.app.id}
      appId={app.app.id}
      appName={app.app.name}
      capabilities={capabilities}
    />
  );
}
