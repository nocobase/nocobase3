import { AppClientRoot, type AppClientConfig } from '@nocobase/app-client';
import type { ReactElement } from 'react';

export interface AppProps {
  config: AppClientConfig;
}

export function App({ config }: AppProps): ReactElement {
  return <AppClientRoot config={config} />;
}
