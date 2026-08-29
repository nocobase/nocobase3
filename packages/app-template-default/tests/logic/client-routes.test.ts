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
      {
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        routeId: '@nocobase/app-plugin-workflow:workflow-list',
      },
      {
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        routeId: '@nocobase/app-plugin-workflow:workflow-detail',
      },
      {
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        routeId: '@nocobase/app-plugin-workflow:workflow-run-list',
      },
      {
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        routeId: '@nocobase/app-plugin-workflow:workflow-run-detail',
      },
    ]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares the application home route as a lazy required route', async () => {
    expect(applicationRoutes.routes).toMatchObject([
      {
        auth: 'required',
        name: 'home',
        path: '/',
      },
    ]);
    expect(Object.isFrozen(applicationRoutes)).toBe(true);
    await expect(
      applicationRoutes.routes[0].componentLoader(),
    ).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
