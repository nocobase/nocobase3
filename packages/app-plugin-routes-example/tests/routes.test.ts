import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import registerRoutes from '../server/routes/index.js';

describe('routes example plugin', () => {
  it('registers a route without application dependencies or services', async () => {
    const app = new Hono();

    registerRoutes({
      app,
      config: undefined,
      deps: undefined,
      paths: createConfigPaths({ rootDir: '/missing' }),
      services: undefined,
    });

    const response = await app.request('/api/routes-example');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    });
  });
});
