import { createConfigPaths } from '@nocobase/app-server-kit/config';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import registerRoutes from '../server/routes/index.js';

describe('routes example plugin', () => {
  it('registers a route without application dependencies or services', async () => {
    const router = new Hono();

    registerRoutes({
      appName: 'main',
      publicBasePath: '/main',
      router,
      runtime: createTestRuntime(),
      serviceContainer: new ServiceContainer(),
    });

    const response = await router.request('/api/routes-example');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    });
  });
});

function createTestRuntime(): AppRuntime<undefined> {
  return {
    config: undefined,
    paths: createConfigPaths({ rootDir: '/missing' }),
  };
}
