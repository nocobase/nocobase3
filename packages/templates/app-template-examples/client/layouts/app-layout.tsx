import { useSyncServerLocale } from '@nocobase/app-plugin-i18n/client';
import { useState, type ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet, useLocation } from 'react-router';

import { RouteTreeProvider } from '../routing/route-context.js';

import { useClientApplication } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PanelLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayoutHeader } from './components/layout-header.js';
import { LayoutSidebar } from './components/layout-sidebar.js';
import { NavigationTree } from './components/navigation-tree.js';
import { AppBrand } from './components/app-brand.js';
import { HeaderActions } from './components/header-actions.js';
import { SidebarFooter } from './components/sidebar-footer.js';
import {
  useRouteNavigation,
  selectedNavigationId,
  routeKey,
  navigationPages,
} from '../routing/route-navigation.js';

export function AppLayout({
  routes,
}: {
  readonly routes: readonly AppClientRegisteredRoute[];
}): ReactElement {
  // The browser decides what it renders; this tells the server the same language so its messages match.
  useSyncServerLocale();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  const { t } = useTranslation();
  const { items: menuItems, denied } = useRouteNavigation(routes);
  const selectedKey = selectedNavigationId(
    routes,
    useLocation().pathname,
    denied,
  );
  const settingsNavigation = useRouteNavigation(
    useClientApplication().runtime.settingsRouteTree,
  );

  return (
    // The shell owns the business route tree used by its pages and navigation.
    <RouteTreeProvider routes={routes}>
      <div className='flex h-svh bg-background'>
        <LayoutSidebar
          aria-label={t('navigation.label', {
            defaultValue: 'Application navigation',
          })}
          desktopState={desktopSidebarCollapsed ? 'collapsed' : 'expanded'}
          mobileOpen={mobileSidebarOpen}
          onMobileOpenChange={setMobileSidebarOpen}
        >
          <div
            className={`flex h-16 shrink-0 items-center justify-between overflow-hidden border-b border-sidebar-border/70 px-5 ${desktopSidebarCollapsed ? 'md:justify-center md:px-0' : ''}`}
          >
            <div className='md:hidden'>
              <AppBrand />
            </div>
            <div className='hidden md:block'>
              <AppBrand compact={desktopSidebarCollapsed} />
            </div>
            <Button
              aria-label={t('navigation.close', {
                defaultValue: 'Close navigation',
              })}
              className='md:hidden hover:bg-sidebar-accent dark:hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring'
              onClick={() => setMobileSidebarOpen(false)}
              size='icon'
              variant='ghost'
            >
              <X />
            </Button>
          </div>
          <nav
            aria-label={t('navigation.label', {
              defaultValue: 'Application navigation',
            })}
            className={`flex-1 min-h-0 space-y-1 overflow-x-hidden overflow-y-auto py-3 ${desktopSidebarCollapsed ? 'px-3 md:px-2' : 'px-3'}`}
          >
            {menuItems.map((item) => (
              <NavigationTree
                collapsed={desktopSidebarCollapsed}
                item={item}
                key={routeKey(item.route)}
                onNavigate={() => setMobileSidebarOpen(false)}
                selectedKey={selectedKey}
              />
            ))}
          </nav>
          <SidebarFooter collapsed={desktopSidebarCollapsed} />
        </LayoutSidebar>
        <div className='flex min-w-0 flex-1 flex-col'>
          <LayoutHeader className='sticky top-0 z-40 justify-between'>
            <div className='flex min-w-0 items-center gap-3'>
              <Button
                aria-label={t('navigation.open', {
                  defaultValue: 'Open navigation',
                })}
                className='size-9 rounded-xl text-muted-foreground md:hidden'
                onClick={() => setMobileSidebarOpen(true)}
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
                    ? t('navigation.expand', {
                        defaultValue: 'Expand navigation',
                      })
                    : t('navigation.collapse', {
                        defaultValue: 'Collapse navigation',
                      })
                }
                aria-pressed={desktopSidebarCollapsed}
                className='hidden size-9 rounded-xl text-muted-foreground hover:text-foreground md:inline-flex'
                onClick={() => setDesktopSidebarCollapsed((value) => !value)}
                size='icon'
                variant='ghost'
              >
                <PanelLeft />
              </Button>
              <div className='hidden h-5 w-px bg-border md:block' />
              <p className='hidden truncate text-sm font-medium text-muted-foreground md:block'>
                {t('shell.workspace', {
                  defaultValue: 'AI application workspace',
                })}
              </p>
            </div>
            <HeaderActions
              showSettings={
                navigationPages(settingsNavigation.items).length > 0
              }
              showDev={import.meta.env.DEV}
            />
          </LayoutHeader>
          <main className='relative min-w-0 flex-1 overflow-hidden'>
            {/* main only positions; the page scrolls in here, so a child page layer laid over main is neither
            moved by the page's scrolling nor stretched by its height. */}
            <div className='h-full overflow-y-auto'>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </RouteTreeProvider>
  );
}
