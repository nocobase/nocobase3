import { describe, expect, it } from 'vitest';

import hub from '@nocobase/app-plugin-hub/client';
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

  it('redirects the root and legacy Hub path to Applications', async () => {
    expect(applicationRoutes).toHaveLength(2);
    expect(applicationRoutes[0]).toMatchObject({
      parent: 'app',
      routes: [
        {
          access: { resource: 'hub', action: 'access' },
          auth: 'required',
          name: 'applications-root',
          path: '/',
        },
        {
          access: { resource: 'hub', action: 'access' },
          auth: 'required',
          name: 'applications-legacy',
          path: '/hub',
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

  it('keeps configured Hub App details and Tabs addressable under Applications', () => {
    const registration = hub({
      applicationsPath: '/apps',
      rolesPath: '/roles',
    });
    const applications = registration.routes[0]?.routes[0];
    expect(applications).toMatchObject({
      path: '/apps',
      children: [
        {
          name: 'hub-app-detail',
          path: ':appId',
          children: [
            { path: 'deployments' },
            { path: 'releases' },
            { path: 'development' },
            { path: 'resources' },
            { path: 'configuration' },
            { path: 'settings' },
          ],
        },
      ],
    });
  });
});
