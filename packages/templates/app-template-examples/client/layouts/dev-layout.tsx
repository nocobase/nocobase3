import { useTranslation } from '@nocobase/i18n/client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import type { ReactElement } from 'react';

import { EMPTY_ARRAY } from '@/lib/constants';

import { SurfaceLayout, type SurfaceCopy } from './surface-layout.js';

export interface DevLayoutProps {
  readonly routeTree: readonly AppClientRegisteredRoute[];
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
  routeTree,
  routes = EMPTY_ARRAY,
}: DevLayoutProps): ReactElement {
  const { t } = useTranslation();
  const copy: SurfaceCopy = {
    pathPrefix: '/dev',
    title: t('dev.title', { defaultValue: 'Dev tools' }),
    emptyTitle: t('dev.emptyTitle', { defaultValue: 'No dev tools available' }),
    emptyDescription: t('dev.emptyDescription', {
      defaultValue:
        'No enabled plugin contributes a dev page you have access to.',
    }),
  };
  return <SurfaceLayout copy={copy} routes={routes} routeTree={routeTree} />;
}
