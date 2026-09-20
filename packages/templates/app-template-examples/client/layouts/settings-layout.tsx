import { useSidebarPreference } from './use-sidebar-preference.js';
import { useTranslation } from '@nocobase/i18n/client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { ArrowLeft, PanelLeft, X } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, Navigate, Routes, useLocation, useNavigate } from 'react-router';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { EMPTY_ARRAY } from '@/lib/constants';

import { renderRouteTree } from '../routing/route-tree.js';
import { RouteTreeProvider } from '../routing/route-context.js';
import {
  routeKey,
  matchRouteTree,
  navigationPages,
  selectedNavigationId,
  useRouteNavigation,
} from '../routing/route-navigation.js';
import { NavigationTree } from './components/navigation-tree.js';
import { LayoutHeader } from './components/layout-header.js';
import { LayoutSidebar } from './components/layout-sidebar.js';
import { SurfaceEmpty, type SurfaceCopy } from './components/surface-empty.js';
import { AppBrand } from './components/app-brand.js';
import { HeaderActions } from './components/header-actions.js';

export interface SettingsLayoutProps {
  readonly routeTree: readonly AppClientRegisteredRoute[];
  readonly routes?: readonly AppClientRegisteredRoute[];
}

export function SettingsLayout({
  routeTree,
  routes = EMPTY_ARRAY,
}: SettingsLayoutProps): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const copy: SurfaceCopy = {
    pathPrefix: '/settings',
    title: t('settings.title', { defaultValue: 'Settings' }),
    emptyTitle: t('settings.emptyTitle', {
      defaultValue: 'No settings available',
    }),
    emptyDescription: t('settings.emptyDescription', {
      defaultValue:
        'No enabled plugin contributes a settings page you have access to.',
    }),
  };

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] =
    useSidebarPreference();
  const { items: navEntries, loading, denied } = useRouteNavigation(routeTree);
  const selectedKey = selectedNavigationId(
    routeTree,
    location.pathname,
    denied,
  );
  const visible = navigationPages(navEntries);
  // The match below and every consumer of the route tree key off this, so it keeps its identity.
  const allRoutes = useMemo(
    () => [...routeTree, ...routes],
    [routeTree, routes],
  );
  const matches = matchRouteTree(allRoutes, location.pathname);
  if (loading)
    return (
      <Loading
        className='min-h-svh'
        label={t('surface.loading', {
          title: copy.title,
          defaultValue: `Loading ${copy.title}`,
        })}
      />
    );
  if (
    matches
      ?.filter(({ route }) => route.componentLoader)
      .slice(0, 1)
      .some(({ route }) => denied.has(routeKey(route))) ||
    !matches?.some(({ route }) => route.componentLoader)
  ) {
    return visible[0] ? (
      <Navigate to={visible[0].path} replace />
    ) : (
      <SurfaceEmpty copy={copy} />
    );
  }

  return (
    <div className='flex h-svh bg-background'>
      <LayoutSidebar
        aria-label={t('surface.navigation', {
          title: copy.title,
          defaultValue: `${copy.title} navigation`,
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
          aria-label={copy.title}
          className={`flex-1 min-h-0 space-y-1 overflow-x-hidden overflow-y-auto py-4 ${desktopSidebarCollapsed ? 'px-3 md:px-2' : 'px-3'}`}
        >
          {navEntries.map((entry) => (
            <NavigationTree
              key={routeKey(entry.route)}
              item={entry}
              collapsed={desktopSidebarCollapsed}
              selectedKey={selectedKey}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          ))}
        </nav>
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
              onClick={() =>
                setDesktopSidebarCollapsed((collapsed) => !collapsed)
              }
              size='icon'
              variant='ghost'
            >
              <PanelLeft />
            </Button>
            <div className='hidden h-5 w-px bg-border md:block' />
            <Link
              className='inline-flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
              to='/'
            >
              <ArrowLeft className='size-4 shrink-0' />
              <span className='truncate'>
                {t('surface.backToApp', { defaultValue: 'Back to app' })}
              </span>
            </Link>
          </div>
          <HeaderActions
            showSettings={navigationPages(navEntries).length > 0}
            showDev={import.meta.env.DEV}
          />
        </LayoutHeader>
        <main className='relative min-w-0 flex-1 overflow-hidden'>
          {/* main only positions; the page scrolls in here, so a child page layer laid over main is neither
            moved by the page's scrolling nor stretched by its height. */}
          <div className='h-full overflow-y-auto'>
            <label className='sr-only' htmlFor='surface-page'>
              {t('surface.page', {
                title: copy.title,
                defaultValue: `${copy.title} page`,
              })}
            </label>
            <select
              id='surface-page'
              className='m-3 h-9 w-[calc(100%-1.5rem)] min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm md:hidden'
              value={
                visible.find((route) => routeKey(route) === selectedKey)
                  ?.path ?? ''
              }
              onChange={(event) => {
                void navigate(event.target.value);
              }}
            >
              {visible.map((route) => (
                <option key={routeKey(route)} value={route.path}>
                  {t(route.navigation!.title, {
                    ns: route.packageName,
                    defaultValue: route.navigation!.title,
                  })}
                </option>
              ))}
            </select>
            <RouteTreeProvider routes={allRoutes}>
              <Routes>
                {renderRouteTree(routeTree, copy.pathPrefix)}
                {renderRouteTree(routes, copy.pathPrefix)}
              </Routes>
            </RouteTreeProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
