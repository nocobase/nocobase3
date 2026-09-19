import { useSyncServerLocale } from '@nocobase/app-plugin-i18n/client';
import { type ComponentProps, type ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet, useLocation } from 'react-router';

import { RouteTreeProvider } from '../routing/route-context.js';

import { useClientApplication } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayoutHeader } from './components/layout-header.js';
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarFooter as SidebarFooterContainer,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
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

export function AppLayout(
  props: ComponentProps<typeof AppLayoutContent>,
): ReactElement {
  return (
    <SidebarProvider className='h-svh overflow-hidden'>
      <AppLayoutContent {...props} />
    </SidebarProvider>
  );
}

function AppLayoutContent({
  routes,
}: {
  readonly routes: readonly AppClientRegisteredRoute[];
}): ReactElement {
  // The browser decides what it renders; this tells the server the same language so its messages match.
  useSyncServerLocale();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const desktopSidebarCollapsed = !isMobile && state === 'collapsed';

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
      <div className='flex h-svh w-full bg-background'>
        <Sidebar
          collapsible='icon'
          role={isMobile ? undefined : 'complementary'}
          aria-label={t('navigation.label', {
            defaultValue: 'Application navigation',
          })}
        >
          <SidebarHeader
            className={`flex flex-row h-16 shrink-0 items-center justify-between overflow-hidden border-b border-sidebar-border/70 px-5 ${desktopSidebarCollapsed ? 'md:justify-center md:px-0' : ''}`}
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
              onClick={() => setOpenMobile(false)}
              size='icon'
              variant='ghost'
            >
              <X />
            </Button>
          </SidebarHeader>
          <SidebarContent
            role='navigation'
            aria-label={t('navigation.label', {
              defaultValue: 'Application navigation',
            })}
            className='overflow-x-hidden overflow-y-auto group-data-[collapsible=icon]:overflow-y-auto p-2'
          >
            <SidebarMenu>
              {menuItems.map((item) => (
                <NavigationTree
                  item={item}
                  key={routeKey(item.route)}
                  onNavigate={() => setOpenMobile(false)}
                  selectedKey={selectedKey}
                />
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooterContainer className='p-0'>
            <SidebarFooter collapsed={desktopSidebarCollapsed} />
          </SidebarFooterContainer>
        </Sidebar>
        <div className='flex min-w-0 flex-1 flex-col'>
          <LayoutHeader className='sticky top-0 z-40 justify-between'>
            <div className='flex min-w-0 items-center gap-3'>
              {isMobile ? <SidebarTrigger /> : null}
              <div className='md:hidden'>
                <AppBrand />
              </div>
              {!isMobile ? <SidebarTrigger /> : null}
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
