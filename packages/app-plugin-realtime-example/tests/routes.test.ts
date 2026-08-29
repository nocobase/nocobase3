import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { CLOCK_TOPIC } from '../server/publishers/clock.js';
import { rootRoutes } from '../server/routes/index.js';

describe('realtime example plugin routes', () => {
  it('registers the realtime page', async () => {
    const router = await rootRoutes.createRouter({
      appName: 'main',
      publicBasePath: '',
      config: { app: { name: 'main', publicBasePath: '' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container: new ServiceContainer(),
    });

    const response = await router.request('http://localhost/realtime');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="now-time"');
    expect(html).toContain(CLOCK_TOPIC);
    expect(html).toContain("type: 'subscribe'");
  });
});
