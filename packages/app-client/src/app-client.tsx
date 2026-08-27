import { Refine } from '@refinedev/core';
import routerProvider from '@refinedev/react-router';
import { type ReactElement, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router';

import { normalizeAppClientBasename, type AppClientConfig } from './config.js';
import { AppClientContext } from './app-client-context.js';

export interface AppClientRootProps {
  config: AppClientConfig;
}

export function AppClientRoot({ config }: AppClientRootProps): ReactElement {
  const refine = config.refine ?? {};
  const configuredChildren =
    refine.children === undefined ? config.routes : refine.children;
  const configuredRouterProvider = refine.routerProvider ?? routerProvider;
  const providers = config.providers ?? [];
  const content = providers.reduceRight<ReactNode>(
    (children, Provider) => <Provider>{children}</Provider>,
    <Refine
      {...refine}
      routerProvider={configuredRouterProvider}
      options={{
        syncWithLocation: true,
        disableTelemetry: true,
        ...refine.options,
      }}
    >
      {configuredChildren}
    </Refine>,
  );

  return (
    <BrowserRouter basename={normalizeAppClientBasename(config.basename)}>
      <AppClientContext.Provider value={config.client}>
        {content}
      </AppClientContext.Provider>
    </BrowserRouter>
  );
}
