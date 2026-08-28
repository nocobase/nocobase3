import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createConfigPaths } from '@nocobase/app-server-kit/config';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';

import { authorizationToken, type AppAuthorization } from '../server/index.js';
import registerAuthorizationRoutes from '../server/routes/index.js';

describe('@nocobase/app-plugin-authorization routes', () => {
  it('protects its HTTP routes with authentication', async () => {
    const router = new Hono();
    const serviceContainer = new ServiceContainer();
    serviceContainer.instance(authenticationToken, {
      required: () => (context) =>
        Promise.resolve(
          context.json(
            { code: 'UNAUTHORIZED', message: 'Authentication required' },
            401,
          ),
        ),
    } as unknown as Auth);
    serviceContainer.instance(authorizationToken, {
      middleware: () => async (_context, next) => next(),
    } as unknown as AppAuthorization);

    registerAuthorizationRoutes({
      appName: 'main',
      publicBasePath: '/main',
      router,
      runtime: createTestRuntime(),
      serviceContainer,
    });

    const response = await router.request('/api/authz/permissions');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });

  it.each([
    { existing: undefined, expected: 'create' },
    {
      existing: {
        resource: { type: 'database.collection', id: 'main.orders' },
        actions: [],
      },
      expected: 'update',
    },
  ])(
    'checks $expected when setting default access',
    async ({ existing, expected }) => {
      const router = new Hono();
      const serviceContainer = new ServiceContainer();
      const require = vi.fn(() => Promise.resolve());
      const set = vi.fn((rule: object) => Promise.resolve(rule));
      serviceContainer.instance(authenticationToken, {
        required: () => async (_context, next) => next(),
      } as unknown as Auth);
      serviceContainer.instance(authorizationToken, {
        middleware: () => async (context, next) => {
          context.set('authz', { require });
          await next();
        },
        defaultAccess: {
          get: () => Promise.resolve(existing),
          set,
        },
      } as unknown as AppAuthorization);
      registerAuthorizationRoutes({
        appName: 'main',
        publicBasePath: '/main',
        router,
        runtime: createTestRuntime(),
        serviceContainer,
      });

      const response = await router.request('/api/authz/default-access', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resource: { type: 'database.collection', id: 'main.orders' },
          actions: [{ action: 'read', scope: { type: 'all' } }],
        }),
      });

      expect(response.status).toBe(200);
      expect(require).toHaveBeenCalledWith({
        resource: { type: 'authorization.settings', id: 'default-access' },
        action: expected,
      });
      expect(set).toHaveBeenCalledOnce();
    },
  );
});

function createTestRuntime(): AppRuntime<undefined> {
  return {
    config: undefined,
    paths: createConfigPaths({ rootDir: '/missing' }),
  };
}
