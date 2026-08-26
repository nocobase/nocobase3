import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { AppAuthorization } from '../server/authorization.js';
import registerAuthorizationRoutes from '../server/routes/index.js';

describe('@nocobase/app-plugin-authorization routes', () => {
  it('protects its HTTP routes with authentication', async () => {
    const app = new Hono();

    registerAuthorizationRoutes({
      app,
      deps: {
        auth: {
          required: () => (context) =>
            Promise.resolve(
              context.json(
                { code: 'UNAUTHORIZED', message: 'Authentication required' },
                401,
              ),
            ),
        },
        authz: {
          middleware: () => async (_context, next) => next(),
        } as unknown as AppAuthorization,
      },
      services: undefined,
    });

    const response = await app.request('/api/authz/permissions');

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
      const app = new Hono();
      const require = vi.fn(() => Promise.resolve());
      const set = vi.fn((rule: object) => Promise.resolve(rule));
      registerAuthorizationRoutes({
        app,
        deps: {
          auth: { required: () => async (_context, next) => next() },
          authz: {
            middleware: () => async (context, next) => {
              context.set('authz', { require });
              await next();
            },
            defaultAccess: {
              get: () => Promise.resolve(existing),
              set,
            },
          } as unknown as AppAuthorization,
        },
        services: undefined,
      });

      const response = await app.request('/api/authz/default-access', {
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
