import { resolveNocoBaseSettingsUrl } from '@nocobase/app-portal-sdk/runtime';
import { PanelLeft, Settings, Settings2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

import { ThemeSettings } from '../theme/index.js';
import { AppBrand } from './app-brand.js';
import { UserMenu } from './user-menu.js';

export interface AppHeaderProps {
  readonly desktopSidebarCollapsed: boolean;
  readonly onOpenSidebar: () => void;
  readonly onToggleDesktopSidebar: () => void;
}

export function AppHeader({
  desktopSidebarCollapsed,
  onOpenSidebar,
  onToggleDesktopSidebar,
}: AppHeaderProps): ReactElement {
  return (
    <header className='sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl md:px-4'>
      <div className='flex min-w-0 items-center gap-3'>
        <Button
          aria-label='Open navigation'
          className='size-9 rounded-xl text-muted-foreground md:hidden'
          onClick={onOpenSidebar}
          size='icon'
          variant='ghost'
        >
          <PanelLeft />
        </Button>
        <div className='md:hidden'>
          <AppBrand />
        </div>
        <Button
          aria-label={
            desktopSidebarCollapsed
              ? 'Expand navigation'
              : 'Collapse navigation'
          }
          aria-pressed={desktopSidebarCollapsed}
          className='hidden size-9 rounded-xl text-muted-foreground hover:text-foreground md:inline-flex'
          onClick={onToggleDesktopSidebar}
          size='icon'
          variant='ghost'
        >
          <PanelLeft />
        </Button>
        <div className='hidden h-5 w-px bg-border md:block' />
        <p className='hidden truncate text-sm font-medium text-muted-foreground md:block'>
          AI application workspace
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <Link
          aria-label='App settings'
          className='inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
          to='/settings'
        >
          <Settings2 className='size-4' />
          <span className='hidden sm:inline'>App settings</span>
        </Link>
        <a
          aria-label='Settings'
          className='inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
          href={resolveNocoBaseSettingsUrl()}
          rel='noopener noreferrer'
          target='_blank'
          title='Settings'
        >
          <Settings className='size-5' />
        </a>
        <ThemeSettings />
        <UserMenu />
      </div>
    </header>
  );
}
