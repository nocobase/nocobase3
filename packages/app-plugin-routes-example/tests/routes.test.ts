import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { Hono, type MiddlewareHandler } from 'hono';
import { describe, expect, it } from 'vitest';

import registerRoutes from '../server/routes/index.js';

describe('routes example plugin', () => {
  it('requires authentication for the plugin API route', async () => {
    const app = new Hono();

    registerRoutes({
      app,
      config: undefined,
      deps: { auth: { required: () => authenticatedOnly } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      services: undefined,
    });

    const denied = await app.request('/api/routes-example');
    const response = await app.request('/api/routes-example', {
      headers: { 'x-test-auth': 'allowed' },
    });

    expect(denied.status).toBe(401);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    });
  });
});

const authenticatedOnly: MiddlewareHandler = async (context, next) => {
  if (context.req.header('x-test-auth') !== 'allowed') {
    return context.json({ code: 'UNAUTHORIZED' }, 401);
  }
  await next();
};
