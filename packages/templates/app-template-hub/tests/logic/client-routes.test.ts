import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

describe('app client routes', () => {
  it('discovers application-owned authentication page overrides', () => {
    expect(
      sourceExtensions
        .flatMap((extension) => extension.routeComponentOverrides ?? [])
        .map(({ componentEntry, routeId }) => ({
          componentEntry,
          routeId,
        })),
    ).toEqual([
      {
        componentEntry: './client/extensions/nocobase-auth-ui/pages/login-page',
        routeId: '@nocobase/app-plugin-authentication:login',
      },
      {
        componentEntry:
          './client/extensions/nocobase-auth-ui/pages/register-page',
        routeId: '@nocobase/app-plugin-authentication:register',
      },
      {
        componentEntry:
          './client/extensions/nocobase-auth-ui/pages/forgot-password-page',
        routeId: '@nocobase/app-plugin-authentication:forgot-password',
      },
      {
        componentEntry:
          './client/extensions/nocobase-auth-ui/pages/reset-password-page',
        routeId: '@nocobase/app-plugin-authentication:reset-password',
      },
    ]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', async () => {
    expect(applicationRoutes).toHaveLength(2);
    expect(applicationRoutes[0]).toMatchObject({
      parent: 'app',
      routes: [
        {
          auth: 'required',
          name: 'applications-root',
          path: '/',
        },
      ],
    });
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);
    await expect(
      applicationRoutes[0].routes[0].componentLoader(),
    ).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
