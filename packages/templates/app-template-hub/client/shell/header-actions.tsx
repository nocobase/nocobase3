import { MonitorCog, Settings } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ThemeSettings } from '../theme/index.js';
import { UserMenu } from './user-menu.js';

const ACTION_LINK_CLASS =
  'inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * The surface the header is being rendered inside, or `app` for the application shell. A surface drops its own entry:
 * it is already the destination, and linking to where the user is standing is the one link that can do nothing.
 */
export type HeaderSurface = 'app' | 'settings' | 'dev';

export interface HeaderActionsProps {
  readonly surface?: HeaderSurface;
}

/** The controls in the top-right of every header, so every surface matches the application shell. */
export function HeaderActions({
  surface = 'app',
}: HeaderActionsProps): ReactElement {
  return (
    <div className='flex shrink-0 items-center gap-2'>
      {/* The dev entry sits left of settings and exists only while developing: a production build evaluates this to
          false and drops the link along with the whole dev surface it points at. */}
      {import.meta.env.DEV && surface !== 'dev' ? (
        <Link
          aria-label='Dev tools'
          className={ACTION_LINK_CLASS}
          title='Dev tools'
          to='/dev'
        >
          <MonitorCog className='size-5' />
        </Link>
      ) : null}
      {surface !== 'settings' ? (
        <Link
          aria-label='Settings'
          className={ACTION_LINK_CLASS}
          title='Settings'
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
