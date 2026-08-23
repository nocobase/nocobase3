import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import {
  createRenderablePluginRoutes,
  groupRenderablePluginRoutes,
} from '../../client/plugin-routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';

describe('app client plugin route groups', () => {
  it('declares application-owned authentication page overrides', () => {
    expect(
      routeComponentOverrides.map(({ componentEntry, routeId }) => ({
        componentEntry,
        routeId,
      })),
    ).toEqual([
      {
        componentEntry: './client/auth/pages/login-page',
        routeId: '@nocobase/app-plugin-authentication:login',
      },
      {
        componentEntry: './client/auth/pages/register-page',
        routeId: '@nocobase/app-plugin-authentication:register',
      },
      {
        componentEntry: './client/auth/pages/forgot-password-page',
        routeId: '@nocobase/app-plugin-authentication:forgot-password',
      },
      {
        componentEntry: './client/auth/pages/reset-password-page',
        routeId: '@nocobase/app-plugin-authentication:reset-password',
      },
    ]);
  });

  it('separates required, guest, and optional routes', () => {
    const renderable = createRenderablePluginRoutes([
      createRoute('private', '/private', 'required'),
      createRoute('login', '/login', 'guest'),
      createRoute('help', '/help', 'optional'),
    ]);
    const groups = groupRenderablePluginRoutes(renderable);

    expect(groups.required.map((route) => route.name)).toEqual(['private']);
    expect(groups.guest.map((route) => route.name)).toEqual(['login']);
    expect(groups.optional.map((route) => route.name)).toEqual(['help']);
    expect(Object.isFrozen(groups)).toBe(true);
    expect(Object.isFrozen(groups.required)).toBe(true);
    expect(Object.isFrozen(groups.guest)).toBe(true);
    expect(Object.isFrozen(groups.optional)).toBe(true);
  });
});

function createRoute(
  name: string,
  path: string,
  auth: AppClientRegisteredRoute['auth'],
): AppClientRegisteredRoute {
  return {
    auth,
    componentLoader: async () => ({ default: () => null }),
    id: `@nocobase/app-plugin-test:${name}`,
    name,
    packageName: '@nocobase/app-plugin-test',
    path,
  };
}
