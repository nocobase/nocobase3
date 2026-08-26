import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { CLOCK_TOPIC } from '../server/publishers/clock.js';
import registerRoutes from '../server/routes/index.js';

describe('realtime example plugin routes', () => {
  it('registers the realtime page', async () => {
    const app = new Hono();

    registerRoutes({
      app,
      config: undefined,
      deps: undefined,
      paths: createConfigPaths({ rootDir: '/missing' }),
      services: undefined,
    });

    const response = await app.request('http://localhost/realtime');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="now-time"');
    expect(html).toContain(CLOCK_TOPIC);
    expect(html).toContain("type: 'subscribe'");
  });
});
