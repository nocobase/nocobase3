import { Authenticated } from '@refinedev/core';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { lazy, Suspense, useMemo, type ReactElement } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { Loading } from '@/components/loading';

import { AppShell } from '../shell/index.js';
import { renderRouteTree } from './route-tree.js';
import { StandalonePageLayout } from './standalone-page-layout.js';

// The settings centre brings its own chrome and navigation, none of which the application needs until someone opens
// it. Loading it lazily keeps it out of the entry chunk, the same way every page it hosts stays out.
const SettingsLayout = lazy(async () => ({
  default: (await import('../layouts/settings-layout.js')).SettingsLayout,
}));

// The dev tools exist only while developing the application. Resolving the import inside an `import.meta.env.DEV`
// branch lets a production build prove the module is unreachable and drop it, along with every dev page and any
// module only those pages import.
const DevLayout = import.meta.env.DEV
  ? lazy(async () => ({
      default: (await import('../layouts/dev-layout.js')).DevLayout,
    }))
  : undefined;

export interface AppRouterProps {
  readonly settingsRouteTree: readonly AppClientRegisteredRoute[];
  readonly devRouteTree: readonly AppClientRegisteredRoute[];
  readonly clientRoutes: readonly AppClientRegisteredRoute[];
}

export function AppRouter({
  settingsRouteTree,
  devRouteTree,
  clientRoutes,
}: AppRouterProps): ReactElement {
  const settingsRoutes = useMemo(
    () =>
      filterRouteTree(
        clientRoutes,
        (route) =>
          route.auth === 'required' && route.path.startsWith('/settings/'),
      ),
    [clientRoutes],
  );
  const devRoutes = useMemo(
    () =>
      filterRouteTree(
        clientRoutes,
        (route) => route.auth === 'required' && route.path.startsWith('/dev/'),
      ),
    [clientRoutes],
  );
  const routeGroups = useMemo(
    () => ({
      guest: clientRoutes.filter((route) => route.auth === 'guest'),
      optional: clientRoutes.filter((route) => route.auth === 'optional'),
      required: filterRouteTree(
        clientRoutes,
        (route) =>
          route.auth === 'required' &&
          !route.path.startsWith('/settings/') &&
          !route.path.startsWith('/dev/'),
      ),
    }),
    [clientRoutes],
  );

  return (
    <Routes>
      <Route
        element={
          <Authenticated
            key='authenticated-inner'
            fallback={<Navigate to='/login' replace />}
          >
            <Outlet />
          </Authenticated>
        }
      >
        <Route element={<AppShell routes={routeGroups.required} />}>
          {renderRouteTree(routeGroups.required)}
        </Route>
        <Route
          path='/settings/*'
          element={
            <Suspense
              fallback={
                <Loading className='min-h-svh' label='Loading settings' />
              }
            >
              <SettingsLayout
                routeTree={settingsRouteTree}
                routes={settingsRoutes}
              />
            </Suspense>
          }
        />
        {import.meta.env.DEV && DevLayout ? (
          <Route
            path='/dev/*'
            element={
              <Suspense
                fallback={
                  <Loading className='min-h-svh' label='Loading dev tools' />
                }
              >
                <DevLayout routeTree={devRouteTree} routes={devRoutes} />
              </Suspense>
            }
          />
        ) : null}
      </Route>

      <Route
        element={
          <Authenticated key='authenticated-outer' fallback={<Outlet />}>
            <Navigate to='/' replace />
          </Authenticated>
        }
      >
        <Route element={<StandalonePageLayout />}>
          {renderRouteTree(routeGroups.guest)}
        </Route>
      </Route>

      <Route element={<StandalonePageLayout />}>
        {renderRouteTree(routeGroups.optional)}
      </Route>

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
}

/** Pure groups can span surfaces; a page and its descendants always share their shell. */
function filterRouteTree(
  routes: readonly AppClientRegisteredRoute[],
  predicate: (route: AppClientRegisteredRoute) => boolean,
): AppClientRegisteredRoute[] {
  return routes.flatMap((route) => {
    if (route.componentLoader) return predicate(route) ? [route] : [];
    const children = filterRouteTree(route.children ?? [], predicate);
    return children.length ? [{ ...route, children }] : [];
  });
}
