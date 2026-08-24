import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

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
});
