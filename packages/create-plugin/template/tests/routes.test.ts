import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import __NOCOBASE_MODULE_NAME__ApiRoutes from '../server/routes.js';
import { __NOCOBASE_MODULE_NAME__ServiceToken } from '../server/token.js';

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('registers its HTTP route', async () => {
    const router = new Hono();
    const container = new ServiceContainer();
    container.instance(__NOCOBASE_MODULE_NAME__ServiceToken, {
      getMessage: (): string => 'Test message',
    });

    await __NOCOBASE_MODULE_NAME__ApiRoutes.register(router, {
      appName: 'main',
      publicBasePath: '',
      config: { app: { name: 'main', publicBasePath: '' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router,
      apiRouter: router,
      container,
    });

    const response = await router.request(__NOCOBASE_ROUTE_PATH_LITERAL__);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plugin: __NOCOBASE_PACKAGE_NAME_LITERAL__,
      message: 'Test message',
    });
  });

  it('declares an API route contribution', () => {
    expect(__NOCOBASE_MODULE_NAME__ApiRoutes).toMatchObject({
      scope: 'api',
      name: __NOCOBASE_API_ROUTES_NAME_LITERAL__,
    });
  });
});
