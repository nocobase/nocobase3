import { Navigate, Outlet, Route, Routes } from 'react-router';

import { ErrorComponent } from '@/components/app-shell/error-component';
import { Layout } from '@/components/app-shell/layout';
import { hasHubCapability } from '@/features/hub/api';
import { HubLoginPage, HubSetupPage } from '@/features/hub/auth-pages';
import { HubAuthGate } from '@/features/hub/gate';
import { HubRuntimeProvider, useHubRuntime } from '@/features/hub/provider';
import { configuredRouteElements } from './extensions';

export function AppRoutes() {
  return (
    <HubAuthGate publicPaths={['/login', '/setup']}>
      <Routes>
        <Route path='/login' element={<HubLoginPage />} />
        <Route path='/setup' element={<HubSetupPage />} />
        <Route
          element={
            <HubRuntimeProvider>
              <Outlet />
            </HubRuntimeProvider>
          }
        >
          <Route
            element={
              <Layout>
                <Outlet />
              </Layout>
            }
          >
            <Route index element={<HubHomeRedirect />} />
            {configuredRouteElements}
            <Route path='*' element={<ErrorComponent />} />
          </Route>
        </Route>
      </Routes>
    </HubAuthGate>
  );
}

function HubHomeRedirect() {
  const { me } = useHubRuntime();
  if (hasHubCapability(me.capabilities, 'hub.app', 'read')) {
    return <Navigate to='/apps' replace />;
  }
  const scopedApplication = (me.capabilities.application ?? []).find((entry) =>
    hasHubCapability(me.capabilities, 'hub.app', 'read', entry.applicationId),
  );
  if (scopedApplication) {
    return (
      <Navigate
        to={`/apps/${encodeURIComponent(scopedApplication.applicationId)}`}
        replace
      />
    );
  }
  if (hasHubCapability(me.capabilities, 'hub.deployment', 'read')) {
    return <Navigate to='/deployments' replace />;
  }
  const deploymentScope = (me.capabilities.application ?? []).find((entry) =>
    hasHubCapability(
      me.capabilities,
      'hub.deployment',
      'read',
      entry.applicationId,
    ),
  );
  if (deploymentScope) {
    return <Navigate to='/deployments' replace />;
  }
  return <Navigate to='/apps' replace />;
}
