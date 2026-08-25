import { Menu, Settings2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Button } from '@nocobase/ui';

import { ThemeSettings } from '../theme/index.js';
import { AppBrand } from './app-brand.js';
import { UserMenu } from './user-menu.js';

export interface AppHeaderProps {
  readonly onOpenSidebar: () => void;
}

export function AppHeader({ onOpenSidebar }: AppHeaderProps): ReactElement {
  return (
    <header className='sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl md:px-6'>
      <div className='flex min-w-0 items-center gap-3'>
        <Button
          aria-label='Open navigation'
          className='md:hidden'
          onClick={onOpenSidebar}
          size='icon'
          variant='ghost'
        >
          <Menu />
        </Button>
        <div className='md:hidden'>
          <AppBrand compact />
        </div>
        <p className='hidden truncate text-sm font-medium text-muted-foreground md:block'>
          NocoBase application
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <Button
          aria-label='App settings'
          render={<Link to='/settings' />}
          size='sm'
          variant='outline'
        >
          <Settings2 />
          <span className='hidden sm:inline'>App settings</span>
        </Button>
        <ThemeSettings />
        <UserMenu />
      </div>
    </header>
  );
}
