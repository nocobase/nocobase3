import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import type { ReactElement } from 'react';

import { SurfaceLayout, type SurfaceCopy } from './surface-layout.js';

const SETTINGS_COPY: SurfaceCopy = {
  surface: 'settings',
  title: 'Settings',
  pathPrefix: '/settings',
  emptyTitle: 'No settings available',
  emptyDescription:
    'No enabled plugin contributes a settings page you have access to.',
};

export interface SettingsLayoutProps {
  readonly routeTree: readonly AppClientRegisteredRoute[];
  /** Authenticated plugin routes nested below a setting page, such as a record detail page. */
  readonly routes?: readonly AppClientRegisteredRoute[];
}

/**
 * The settings centre. It is the shared surface layout with settings copy; the dev tools reuse the same layout.
 */
export function SettingsLayout({
  routes = [],
  routeTree,
}: SettingsLayoutProps): ReactElement {
  return (
    <SurfaceLayout copy={SETTINGS_COPY} routes={routes} routeTree={routeTree} />
  );
}
