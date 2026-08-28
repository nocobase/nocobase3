import { Settings } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ThemeSettings } from '../theme/index.js';
import { UserMenu } from './user-menu.js';

export interface HeaderActionsProps {
  /**
   * Whether to offer the settings entry. The settings centre itself sets this to false: it is already the
   * destination, and its own header would otherwise link to where the user is standing.
   */
  readonly showSettings?: boolean;
}

/** The controls in the top-right of every header, so the settings centre matches the application shell. */
export function HeaderActions({
  showSettings = true,
}: HeaderActionsProps): ReactElement {
  return (
    <div className='flex shrink-0 items-center gap-2'>
      {showSettings ? (
        <Link
          aria-label='Settings'
          className='inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
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
