import { createAppPluginServiceRegistry } from '@nocobase/app-server-kit/plugins';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationRegistry } from '../server/registry.js';
import registerRoutes from '../server/routes/index.js';
import { notificationPluginServiceToken } from '../server/service.js';

describe('notification plugin routes', () => {
  it('mounts the Manager router behind app authentication', async () => {
    const app = new Hono();
    const router = new Hono();
    router.get('/logs', (context) => context.json({ data: [] }));
    const pluginServices = createAppPluginServiceRegistry();
    pluginServices.provide(notificationPluginServiceToken, {
      manager: {
        registry: createNotificationRegistry(),
        router,
        send: vi.fn(),
      },
    });
    const required = vi.fn(() => async (_context, next) => next());

    registerRoutes({
      app,
      deps: { auth: { required } },
      pluginServices,
      runtime: {},
      services: {},
    });

    const response = await app.request('/api/notifications/logs');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
    expect(required).toHaveBeenCalledOnce();
  });

  it('does not expose routes without the core notification service', async () => {
    const app = new Hono();

    registerRoutes({
      app,
      deps: { auth: { required: vi.fn() } },
      pluginServices: createAppPluginServiceRegistry(),
      runtime: {},
      services: {},
    });

    expect((await app.request('/api/notifications/logs')).status).toBe(404);
  });
});
