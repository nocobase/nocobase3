import { AppClientRoot } from '@nocobase/app-client';
import type { ReactElement } from 'react';

import { ServiceDeskRouter } from './router.js';
import type { ServiceDeskClientRuntime } from './runtime.js';

export function App({
  runtime,
}: {
  runtime: ServiceDeskClientRuntime;
}): ReactElement {
  return (
    <AppClientRoot
      config={{
        basename: runtime.basename,
        client: runtime.appClient,
        providers: runtime.providers.map((provider) => provider.component),
        refine: {
          authProvider: runtime.authProvider,
          dataProvider: runtime.dataProvider,
          notificationProvider: runtime.notificationProvider,
          resources: runtime.resources,
          options: {
            disableTelemetry: true,
            syncWithLocation: true,
            title: { text: '客户服务中心' },
          },
        },
        routes: <ServiceDeskRouter routes={runtime.routes} />,
      }}
    />
  );
}
