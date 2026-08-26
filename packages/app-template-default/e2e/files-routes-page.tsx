import {
  applyClientRouteComponentOverrides,
  resolveAppClientContributions,
} from '@nocobase/app-client/plugins';
import filesRoutes from '@nocobase/app-plugin-files/client/routes';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';

import filesPageUiExtension from '@nocobase/e2e-files-page-ui';

import '../client/styles.css';

const parameters = new URLSearchParams(window.location.search);
const useRegistryPage = parameters.get('source') === 'registry';
const registeredRoutes = resolveAppClientContributions([
  {
    packageName: '@nocobase/app-plugin-files',
    source: 'plugin',
    routes: filesRoutes,
  },
]).routes;
const resolvedRoutes = applyClientRouteComponentOverrides(
  registeredRoutes,
  useRegistryPage ? (filesPageUiExtension.routeComponentOverrides ?? []) : [],
);
const filesRoute = resolvedRoutes.find(
  (route) => route.id === '@nocobase/app-plugin-files:index',
);

if (!filesRoute) {
  throw new Error('The Files index route is unavailable.');
}

const FilesPage = lazy(filesRoute.componentLoader);
const portalBase = normalizePortalBase(window.NOCOBASE_PORTAL_BASE);
window.history.replaceState(null, '', `${portalBase}files`);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Files route E2E root is unavailable.');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter
      basename={portalBase === '/' ? undefined : portalBase.replace(/\/$/u, '')}
    >
      <Routes>
        <Route
          path={filesRoute.path}
          element={
            <Suspense fallback={<p>Loading Files page</p>}>
              <FilesPage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

function normalizePortalBase(value: unknown): string {
  if (typeof value !== 'string' || value === '/') return '/';
  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}
