import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

import type { HubClientOptions } from './plugin.js';

export const HUB_APPLICATIONS_ACCESS = {
  resource: 'hub',
  action: 'access',
} as const;
export const HUB_USER_ACCESS = {
  resource: 'users',
  action: 'access',
} as const;
export const HUB_USER_ACCESS_NAVIGATION = 'hub-user-access';

export function createHubRoutes(
  options: HubClientOptions = {},
): AppClientAppRoutesContribution {
  const routes: AppClientRouteDefinition[] = [
    {
      name: 'hub',
      path: normalizeHubRoutePath(options.applicationsPath ?? '/hub'),
      auth: 'required',
      access: HUB_APPLICATIONS_ACCESS,
      componentLoader: () => import('./pages/hub-page.js'),
    },
  ];
  if (options.rolesPath) {
    routes.push({
      name: 'hub-roles',
      path: normalizeHubRoutePath(options.rolesPath),
      auth: 'required',
      access: HUB_USER_ACCESS,
      componentLoader: () => import('./pages/roles-page.js'),
    });
  }
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
