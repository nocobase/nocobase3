import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import { auditLogServiceToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-audit-log', () => {
  it('registers its HTTP route', async () => {
    const container = new ServiceContainer();
    container.instance(auditLogServiceToken, {
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

    const response = await router.request('/audit-log');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plugin: '@nocobase/app-plugin-audit-log',
      message: 'Test message',
    });
  });

  it('declares an API route contribution', () => {
    expect(apiRoutes).toMatchObject({
      scope: 'api',
    });
    expect(apiRoutes.createRouter).toBeTypeOf('function');
  });
});
