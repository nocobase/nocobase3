import { useTranslation } from '@nocobase/i18n/client';
import { PanelLeft } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

import { AppBrand } from './app-brand.js';
import { HeaderActions } from './header-actions.js';

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
  const { t } = useTranslation();

  return (
    <header className='sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl md:px-4'>
      <div className='flex min-w-0 items-center gap-3'>
        <Button
          aria-label={t('navigation.open', { defaultValue: 'Open navigation' })}
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
              ? t('navigation.expand', { defaultValue: 'Expand navigation' })
              : t('navigation.collapse', {
                  defaultValue: 'Collapse navigation',
                })
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
      <HeaderActions />
    </header>
  );
}
