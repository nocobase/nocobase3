import type {
  AppClientRegisteredDevRoute,
  AppClientRegisteredDevRouteGroup,
  AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import type { ReactElement } from 'react';

import { SurfaceLayout, type SurfaceCopy } from './surface-layout.js';

const DEV_COPY: SurfaceCopy = {
  surface: 'dev',
  title: 'Dev tools',
  pathPrefix: '/dev',
  emptyTitle: 'No dev tools available',
  emptyDescription:
    'No enabled plugin contributes a dev page you have access to.',
};

export interface DevLayoutProps {
  readonly devRoutes: readonly AppClientRegisteredDevRoute[];
  readonly groups: readonly AppClientRegisteredDevRouteGroup[];
  /** Authenticated plugin routes nested below a dev page. */
  readonly routes?: readonly AppClientRegisteredRoute[];
}

/**
 * The dev tools centre. It is the same navigation surface the settings centre uses, with dev copy.
 *
 * This module is only ever reached from a `import.meta.env.DEV` branch in the router, so a production build drops it
 * along with every page it would have rendered.
 */
export function DevLayout({
  devRoutes,
  groups,
  routes = [],
}: DevLayoutProps): ReactElement {
  return (
    <SurfaceLayout
      copy={DEV_COPY}
      groups={groups}
      routes={routes}
      settings={devRoutes}
    />
  );
}
