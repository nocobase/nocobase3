import { useSyncServerLocale } from '@nocobase/app-plugin-i18n/client';
import { useState, type ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet } from 'react-router';

import { RouteTreeProvider } from '../routing/route-context.js';

import { AppHeader } from './app-header.js';
import { AppSidebar } from './app-sidebar.js';

export function AppShell({
  routes,
}: {
  readonly routes: readonly AppClientRegisteredRoute[];
}): ReactElement {
  // The browser decides what it renders; this tells the server the same language so its messages match.
  useSyncServerLocale();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  return (
    // The shell owns the business route tree used by its pages and navigation.
    <RouteTreeProvider routes={routes}>
      <div className='flex h-svh bg-background'>
        <AppSidebar
          routes={routes}
          desktopCollapsed={desktopSidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <div className='flex min-w-0 flex-1 flex-col'>
          <AppHeader
            desktopSidebarCollapsed={desktopSidebarCollapsed}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onToggleDesktopSidebar={() =>
              setDesktopSidebarCollapsed((collapsed) => !collapsed)
            }
          />
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
