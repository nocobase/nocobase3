import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  apiRoutes,
  registerRoutesExampleRoutes,
} from '../server/routes/index.js';

describe('routes example plugin', () => {
  it('serves the route after its own authentication boundary allows the request', async () => {
    const router = new Hono();
    registerRoutesExampleRoutes(router, {
      required: () => async (_context, next) => next(),
    });

    const response = await router.request('/routes-example');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    });
  });

  it('rejects anonymous requests before executing the handler', async () => {
    const router = new Hono();
    registerRoutesExampleRoutes(router, {
      required: () => (context) =>
        context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        ),
    });

    const response = await router.request('/routes-example');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });

  it('declares an API route contribution', () => {
    expect(apiRoutes).toMatchObject({ scope: 'api' });
  });

  it('does not apply its authentication boundary to later Route contributions', async () => {
    const application = new Hono();
    const pluginRouter = new Hono();
    registerRoutesExampleRoutes(pluginRouter, {
      required: () => (context) => context.json({ code: 'UNAUTHORIZED' }, 401),
    });
    application.route('/api', pluginRouter);
    application.get('/api/later-plugin', (context) => context.text('later'));

    const protectedResponse = await application.request('/api/routes-example');
    const laterResponse = await application.request('/api/later-plugin');
    expect(protectedResponse.status).toBe(401);
    await expect(laterResponse.text()).resolves.toBe('later');
  });
});
