import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import registerServiceProviderExampleRoutes from '../server/routes/index.js';
import { HeartbeatService } from '../server/service.js';
import { heartbeatServiceToken } from '../server/token.js';

describe('@nocobase/app-plugin-service-provider-example routes', () => {
  it('registers its HTTP route', async () => {
    const router = new Hono();
    const container = new ServiceContainer();
    const heartbeat = new HeartbeatService();
    heartbeat.start();
    heartbeat.ready();
    container.instance(heartbeatServiceToken, heartbeat);

    registerServiceProviderExampleRoutes(
      {
        appName: 'main',
        publicBasePath: '',
        config: { app: { name: 'main', publicBasePath: '' } },
        paths: createConfigPaths({ rootDir: '/missing' }),
        router,
        apiRouter: router,
        container,
      },
      router,
    );

    const response = await router.request('/service-provider-example/status');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: '@nocobase/app-plugin-service-provider-example',
      status: 'ready',
      startedAt: expect.any(String),
    });
  });
});
