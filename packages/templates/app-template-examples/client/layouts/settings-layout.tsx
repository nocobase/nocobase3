import { useTranslation } from '@nocobase/i18n/client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import type { ReactElement } from 'react';

import { EMPTY_ARRAY } from '@/lib/constants';

import { SurfaceLayout, type SurfaceCopy } from './surface-layout.js';

export interface SettingsLayoutProps {
  readonly routeTree: readonly AppClientRegisteredRoute[];
  /** Authenticated plugin routes nested below a setting page, such as a record detail page. */
  readonly routes?: readonly AppClientRegisteredRoute[];
}

/**
 * The settings centre. It is the shared surface layout with settings copy; the dev tools reuse the same layout.
 */
export function SettingsLayout({
  routes = EMPTY_ARRAY,
  routeTree,
}: SettingsLayoutProps): ReactElement {
  const { t } = useTranslation();
  const copy: SurfaceCopy = {
    pathPrefix: '/settings',
    title: t('settings.title', { defaultValue: 'Settings' }),
    emptyTitle: t('settings.emptyTitle', {
      defaultValue: 'No settings available',
    }),
    emptyDescription: t('settings.emptyDescription', {
      defaultValue:
        'No enabled plugin contributes a settings page you have access to.',
    }),
  };
  return <SurfaceLayout copy={copy} routes={routes} routeTree={routeTree} />;
}
