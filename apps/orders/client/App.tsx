import { AppClientRoot } from '@nocobase/app-client';
import type { ReactElement } from 'react';

import { OrdersRouter } from './router.js';
import type { OrdersClientRuntime } from './runtime.js';

export function App({
  runtime,
}: {
  runtime: OrdersClientRuntime;
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
            title: { text: '订单运营中心' },
          },
        },
        routes: <OrdersRouter routes={runtime.routes} />,
      }}
    />
  );
}
