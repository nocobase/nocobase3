import { Refine } from '@refinedev/core';
import routerProvider from '@refinedev/react-router';
import { type ReactElement, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router';

import { normalizeAppClientBasename, type AppClientConfig } from './config.js';

export interface AppClientRootProps {
  config: AppClientConfig;
}

export function AppClientRoot({ config }: AppClientRootProps): ReactElement {
  const refine = config.refine ?? {};
  const providers = config.providers ?? [];
  const content = providers.reduceRight<ReactNode>(
    (children, Provider) => <Provider>{children}</Provider>,
    <Refine
      {...refine}
      routerProvider={routerProvider}
      options={{
        syncWithLocation: true,
        disableTelemetry: true,
        ...refine.options,
      }}
    >
      {config.routes}
    </Refine>,
  );

  return (
    <BrowserRouter basename={normalizeAppClientBasename(config.basename)}>
      {content}
    </BrowserRouter>
  );
}
