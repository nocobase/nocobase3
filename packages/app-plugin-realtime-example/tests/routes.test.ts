import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { Hono, type MiddlewareHandler } from 'hono';
import { describe, expect, it } from 'vitest';

import { CLOCK_TOPIC } from '../server/publishers/clock.js';
import registerRoutes from '../server/routes/index.js';

describe('realtime example plugin routes', () => {
  it('registers the realtime page', async () => {
    const app = new Hono();

    registerRoutes({
      app,
      config: undefined,
      deps: { auth: { required: () => authenticatedOnly } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      services: undefined,
    });

    const denied = await app.request('http://localhost/realtime');
    const response = await app.request('http://localhost/realtime', {
      headers: { 'x-test-auth': 'allowed' },
    });
    const html = await response.text();

    expect(denied.status).toBe(401);
    expect(response.status).toBe(200);
    expect(html).toContain('id="now-time"');
    expect(html).toContain(CLOCK_TOPIC);
    expect(html).toContain("type: 'subscribe'");
  });
});

const authenticatedOnly: MiddlewareHandler = async (context, next) => {
  if (context.req.header('x-test-auth') !== 'allowed') {
    return context.json({ code: 'UNAUTHORIZED' }, 401);
  }
  await next();
};
