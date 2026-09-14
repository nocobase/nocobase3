import { Development } from '../detail.js';
import { useHubAppPage } from '../app-page.js';
import type { ReactElement } from 'react';

export default function DevelopmentPage(): ReactElement {
  const { app } = useHubAppPage();
  return <Development appId={app.app.id} />;
}
