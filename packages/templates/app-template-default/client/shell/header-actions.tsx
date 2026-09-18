import { useTranslation } from '@nocobase/i18n/client';
import { useClientApplication } from '@nocobase/app-client';
import { MonitorCog, Settings } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import {
  navigationPages,
  useRouteNavigation,
} from '../routing/route-navigation.js';

import { ThemeSettings } from '../theme/index.js';
import { UserMenu } from './user-menu.js';

const ACTION_LINK_CLASS =
  'inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** Keep header entries visible on their destination pages so navigation stays consistent across surfaces. */
export function HeaderActions(): ReactElement {
  const { t } = useTranslation();
  const routes = useClientApplication().runtime.settingsRouteTree;
  // Use the same access checks as Settings navigation so the entry never opens an empty surface.
  const { items } = useRouteNavigation(routes);
  const hasSettings = navigationPages(items).length > 0;

  return (
    <div className='flex shrink-0 items-center gap-2'>
      {/* The dev entry sits left of settings and exists only while developing: a production build evaluates this to
          false and drops the link along with the whole dev surface it points at. */}
      {import.meta.env.DEV ? (
        <Link
          aria-label={t('dev.title', { defaultValue: 'Dev tools' })}
          className={ACTION_LINK_CLASS}
          title={t('dev.title', { defaultValue: 'Dev tools' })}
          to='/dev'
        >
          <MonitorCog className='size-5' />
        </Link>
      ) : null}
      {hasSettings ? (
        <Link
          aria-label={t('settings.title', { defaultValue: 'Settings' })}
          className={ACTION_LINK_CLASS}
          title={t('settings.title', { defaultValue: 'Settings' })}
          to='/settings'
        >
          <Settings className='size-5' />
        </Link>
      ) : null}
      <ThemeSettings />
      <UserMenu />
    </div>
  );
}
