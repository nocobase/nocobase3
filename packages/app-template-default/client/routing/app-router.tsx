import { Authenticated } from '@refinedev/core';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { useMemo, type ReactElement } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { AppShell } from '../shell/index.js';
import { ClientRoute } from './client-route.js';
import { StandalonePageLayout } from './standalone-page-layout.js';

export interface AppRouterProps {
  readonly clientRoutes: readonly AppClientRegisteredRoute[];
}

export function AppRouter({ clientRoutes }: AppRouterProps): ReactElement {
  const routeGroups = useMemo(
    () => ({
      guest: clientRoutes.filter((route) => route.auth === 'guest'),
      optional: clientRoutes.filter((route) => route.auth === 'optional'),
      requiredApplication: clientRoutes.filter(
        (route) => route.auth === 'required' && route.surface === 'application',
      ),
      requiredStandalone: clientRoutes.filter(
        (route) => route.auth === 'required' && route.surface === 'standalone',
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
          {routeGroups.requiredApplication.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={<ClientRoute route={route} />}
            />
          ))}
        </Route>
        <Route element={<StandalonePageLayout />}>
          {routeGroups.requiredStandalone.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={<ClientRoute route={route} />}
            />
          ))}
        </Route>
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
