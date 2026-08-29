import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import { __NOCOBASE_MODULE_NAME__ServiceToken } from '../server/tokens.js';

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('registers its HTTP route', async () => {
    const container = new ServiceContainer();
    container.instance(__NOCOBASE_MODULE_NAME__ServiceToken, {
      getMessage: (): string => 'Test message',
    });

    const router = await apiRoutes.createRouter({
      appName: 'main',
      publicBasePath: '',
      config: { app: { name: 'main', publicBasePath: '' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
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
    expect(apiRoutes).toMatchObject({
      scope: 'api',
    });
    expect(apiRoutes.createRouter).toBeTypeOf(
      'function',
    );
  });
});
