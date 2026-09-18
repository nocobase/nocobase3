import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';
import { Boxes, ShieldCheck, KeyRound } from 'lucide-react';

import type { HubClientOptions } from './plugin.js';

export const HUB_APPLICATIONS_ACCESS = {
  resource: { type: 'page', id: 'hub' },
  action: 'access',
} as const;
export const HUB_USER_ACCESS = {
  resource: { type: 'page', id: 'users' },
  action: 'access',
} as const;

export function createHubRoutes(
  options: HubClientOptions = {},
): AppClientAppRoutesContribution {
  const routes: AppClientRouteDefinition[] = [
    {
      name: 'hub',
      path: normalizeHubRoutePath(options.applicationsPath ?? '/hub'),
      auth: 'required',
      authz: HUB_APPLICATIONS_ACCESS,
      navigation: { title: 'navigation.applications', icon: Boxes },
      componentLoader: () => import('./pages/hub-page.js'),
      children: [
        {
          name: 'hub-app-detail',
          path: ':appId',
          componentLoader: () => import('./pages/hub/app-page.js'),
          children: [
            {
              name: 'hub-app-deployments',
              path: 'deployments',
              authz: {
                resource: { type: 'hub.app', id: '*' },
                action: 'read-deployment',
              },
              componentLoader: () =>
                import('./pages/hub/tabs/deployments-page.js'),
              children: [
                {
                  name: 'hub-deployment-logs',
                  path: ':deploymentId/logs',
                  authz: {
                    resource: { type: 'hub.app', id: '*' },
                    action: 'read-deployment',
                  },
                  componentLoader: () =>
                    import('./pages/hub/tabs/deployment-logs-page.js'),
                },
              ],
            },
            {
              name: 'hub-app-logs',
              path: 'logs',
              authz: {
                resource: { type: 'hub.app', id: '*' },
                action: 'read-log',
              },
              componentLoader: () => import('./pages/hub/tabs/logs-page.js'),
            },
            {
              name: 'hub-app-releases',
              path: 'releases',
              authz: {
                resource: { type: 'hub.app', id: '*' },
                action: 'read-release',
              },
              componentLoader: () =>
                import('./pages/hub/tabs/releases-page.js'),
            },
            {
              name: 'hub-app-development',
              path: 'development',
              authz: {
                resource: { type: 'hub.app', id: '*' },
                action: 'upload-release',
              },
              componentLoader: () =>
                import('./pages/hub/tabs/development-page.js'),
            },
            {
              name: 'hub-app-resources',
              path: 'resources',
              authz: {
                resource: { type: 'hub.app', id: '*' },
                action: 'read-config',
              },
              componentLoader: () =>
                import('./pages/hub/tabs/resources-page.js'),
            },
            {
              name: 'hub-app-configuration',
              path: 'configuration',
              authz: {
                resource: { type: 'hub.app', id: '*' },
                action: 'read-config',
              },
              componentLoader: () =>
                import('./pages/hub/tabs/configuration-page.js'),
            },
            {
              name: 'hub-app-settings',
              path: 'settings',
              componentLoader: () =>
                import('./pages/hub/tabs/settings-page.js'),
            },
          ],
        },
      ],
    },
  ];
  if (options.rolesPath) {
    routes.push({
      name: 'hub-roles',
      path: normalizeHubRoutePath(options.rolesPath),
      auth: 'required',
      authz: HUB_USER_ACCESS,
      navigation: { title: 'navigation.roles', icon: ShieldCheck },
      componentLoader: () => import('./pages/roles-page.js'),
    });
  }
  routes.push({
    name: 'hub-api-keys',
    path: normalizeHubRoutePath(options.apiKeysPath ?? '/api-keys'),
    auth: 'required',
    authz: {
      resource: { type: 'hub.app', id: '*' },
      action: 'manage-api-keys',
    },
    navigation: { title: 'navigation.apiKeys', icon: KeyRound },
    componentLoader: () => import('./pages/api-keys-page.js'),
  });
  return defineAppRoutes(routes);
}

function normalizeHubRoutePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    throw new TypeError('Hub route path must contain a path segment');
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

const defaultRoutes: AppClientAppRoutesContribution = createHubRoutes();

export default defaultRoutes;
