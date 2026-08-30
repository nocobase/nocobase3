import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  apiRoutes,
  registerRoutesExampleApiRoutes,
} from '../server/routes/api.js';
import routes from '../server/routes/index.js';
import {
  registerRoutesExampleRootRoutes,
  rootRoutes,
} from '../server/routes/root.js';

const allowAuthentication = {
  required: () => async (_context, next) => next(),
};

const denyAuthentication = {
  required: () => (context) =>
    context.json(
      { code: 'UNAUTHORIZED', message: 'Authentication required' },
      401,
    ),
};

describe('routes example plugin', () => {
  it('serves API and Root Routes after their own authentication boundaries allow the request', async () => {
    const router = new Hono();
    registerRoutesExampleApiRoutes(router, allowAuthentication);
    registerRoutesExampleRootRoutes(router, allowAuthentication);

    const apiResponse = await router.request('/routes-example');
    const rootResponse = await router.request('/routes-example/root');

    expect(apiResponse.status).toBe(200);
    await expect(apiResponse.json()).resolves.toEqual({
      scope: 'api',
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example API route',
    });
    expect(rootResponse.status).toBe(200);
    await expect(rootResponse.json()).resolves.toEqual({
      scope: 'root',
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example root route',
    });
  });

  it.each([
    ['api', registerRoutesExampleApiRoutes, '/routes-example'],
    ['root', registerRoutesExampleRootRoutes, '/routes-example/root'],
  ] as const)(
    'rejects anonymous requests at the %s Route boundary',
    async (_scope, register, path) => {
      const router = new Hono();
      register(router, denyAuthentication);

      const response = await router.request(path);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    },
  );

  it('declares one ordered Route array with Root and API scopes', () => {
    expect(routes).toEqual([rootRoutes, apiRoutes]);
    expect(routes.map(({ scope }) => scope)).toEqual(['root', 'api']);
  });

  it.each([
    ['api', registerRoutesExampleApiRoutes, '/api/routes-example'],
    ['root', registerRoutesExampleRootRoutes, '/routes-example/root'],
  ] as const)(
    'does not leak the %s authentication boundary into a later contribution',
    async (_scope, register, protectedPath) => {
      const application = new Hono();
      const pluginRouter = new Hono();
      register(pluginRouter, denyAuthentication);
      application.route(
        protectedPath.startsWith('/api') ? '/api' : '/',
        pluginRouter,
      );
      application.get('/later-plugin', (context) => context.text('later'));

      const protectedResponse = await application.request(protectedPath);
      const laterResponse = await application.request('/later-plugin');
      expect(protectedResponse.status).toBe(401);
      await expect(laterResponse.text()).resolves.toBe('later');
    },
  );
});
