import { Authenticated } from '@refinedev/core';
import type {
  AppClientRegisteredDevRoute,
  AppClientRegisteredDevRouteGroup,
  AppClientRegisteredRoute,
  AppClientRegisteredSetting,
  AppClientRegisteredSettingGroup,
} from '@nocobase/app-client/plugins';
import { lazy, Suspense, useMemo, type ReactElement } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { Loading } from '@/components/loading';

import { AppShell } from '../shell/index.js';
import { ClientRoute } from './client-route.js';
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
  readonly clientRoutes: readonly AppClientRegisteredRoute[];
  readonly clientSettings: readonly AppClientRegisteredSetting[];
  readonly clientSettingGroups: readonly AppClientRegisteredSettingGroup[];
  readonly clientDevRoutes: readonly AppClientRegisteredDevRoute[];
  readonly clientDevRouteGroups: readonly AppClientRegisteredDevRouteGroup[];
}

export function AppRouter({
  clientRoutes,
  clientSettings,
  clientSettingGroups,
  clientDevRoutes,
  clientDevRouteGroups,
}: AppRouterProps): ReactElement {
  const settingsRoutes = useMemo(
    () =>
      clientRoutes.filter(
        (route) =>
          route.auth === 'required' && route.path.startsWith('/settings/'),
      ),
    [clientRoutes],
  );
  const devRoutes = useMemo(
    () =>
      clientRoutes.filter(
        (route) => route.auth === 'required' && route.path.startsWith('/dev/'),
      ),
    [clientRoutes],
  );
  const routeGroups = useMemo(
    () => ({
      guest: clientRoutes.filter((route) => route.auth === 'guest'),
      optional: clientRoutes.filter((route) => route.auth === 'optional'),
      required: clientRoutes.filter(
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
        <Route element={<AppShell />}>
          {routeGroups.required.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={<ClientRoute route={route} />}
            />
          ))}
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
                groups={clientSettingGroups}
                routes={settingsRoutes}
                settings={clientSettings}
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
                <DevLayout
                  devRoutes={clientDevRoutes}
                  groups={clientDevRouteGroups}
                  routes={devRoutes}
                />
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
          {routeGroups.guest.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={<ClientRoute route={route} />}
            />
          ))}
        </Route>
      </Route>

      <Route element={<StandalonePageLayout />}>
        {routeGroups.optional.map((route) => (
          <Route
            key={route.id}
            path={route.path}
            element={<ClientRoute route={route} />}
          />
        ))}
      </Route>

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
}
