import { Refine } from '@refinedev/core';
import routerProvider from '@refinedev/react-router';
import { type ReactElement, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router';

import type { ClientApplication } from './application.js';
import { ClientApplicationContext } from './application-context.js';
import { normalizeAppClientBasename } from './config.js';

export interface AppClientRootProps {
  readonly app: ClientApplication;
}

export function AppClientRoot({ app }: AppClientRootProps): ReactElement {
  const config = app.renderConfig;
  const refine = app.refineConfig;
  const configuredChildren =
    refine.children === undefined ? config.routes : refine.children;
  const configuredRouterProvider = refine.routerProvider ?? routerProvider;
  const reactWrappers = config.reactWrappers ?? [];
  const content = reactWrappers.reduceRight<ReactNode>(
    (children, ReactWrapper) => <ReactWrapper>{children}</ReactWrapper>,
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
    <ClientApplicationContext.Provider value={app}>
      <BrowserRouter basename={normalizeAppClientBasename(config.basename)}>
        {content}
      </BrowserRouter>
    </ClientApplicationContext.Provider>
  );
}
