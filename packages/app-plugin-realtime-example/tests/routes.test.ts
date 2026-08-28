import { createConfigPaths } from '@nocobase/app-server-kit/config';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { CLOCK_TOPIC } from '../server/publishers/clock.js';
import registerRoutes from '../server/routes/index.js';

describe('realtime example plugin routes', () => {
  it('registers the realtime page', async () => {
    const router = new Hono();

    registerRoutes({
      appName: 'main',
      publicBasePath: '/main',
      router,
      runtime: createTestRuntime(),
      serviceContainer: new ServiceContainer(),
    });

    const response = await router.request('http://localhost/realtime');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="now-time"');
    expect(html).toContain(CLOCK_TOPIC);
    expect(html).toContain("type: 'subscribe'");
  });
});

function createTestRuntime(): AppRuntime<undefined> {
  return {
    config: undefined,
    paths: createConfigPaths({ rootDir: '/missing' }),
  };
}
