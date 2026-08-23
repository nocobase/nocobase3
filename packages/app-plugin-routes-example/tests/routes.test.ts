import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import registerRoutes from '../server/routes/index.js';

describe('routes example plugin', () => {
  it('registers a route without application dependencies or services', async () => {
    const app = new Hono();

    registerRoutes({
      app,
      deps: undefined,
      services: undefined,
    });

    const response = await app.request('/routes-example');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    });
  });
});
