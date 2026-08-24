import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';

describe('app client routes', () => {
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

  it('declares the application home route as a lazy required route', async () => {
    expect(applicationRoutes).toMatchObject([
      {
        auth: 'required',
        name: 'home',
        path: '/',
      },
    ]);
    expect(Object.isFrozen(applicationRoutes)).toBe(true);
    await expect(applicationRoutes[0].componentLoader()).resolves.toMatchObject(
      {
        default: expect.any(Function),
      },
    );
  });
});
