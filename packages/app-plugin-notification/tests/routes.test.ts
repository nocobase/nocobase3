import type { NotificationService } from '../server/types.js';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import registerNotificationRoutes from '../server/routes/index.js';

describe('@nocobase/app-plugin-notification routes', () => {
  it('mounts its own protected log routes', async () => {
    const app = new Hono();
    const middleware = vi.fn(async (_context, next) => next());
    const required = vi.fn(() => middleware);
    const canAccess = vi.fn(() => Promise.resolve(true));
    const authorization = vi.fn(async (context, next) => {
      context.set('authz', { can: canAccess });
      await next();
    });
    const router = new Hono();
    router.get('/logs', (context) => context.json({ data: [] }));

    registerNotificationRoutes({
      app,
      config: undefined,
      deps: {
        auth: { required },
        authz: { middleware: () => authorization },
      },
      services: {
        notification: { router } as unknown as NotificationService,
      },
      paths: {} as never,
    });
    app.get('/outside', (context) => context.text('outside'));

    const response = await app.request('/api/notifications/logs');
    const outside = await app.request('/outside');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
    expect(required).toHaveBeenCalledOnce();
    expect(middleware).toHaveBeenCalledOnce();
    expect(authorization).toHaveBeenCalledOnce();
    expect(canAccess).toHaveBeenCalledWith({
      resource: { type: 'page', id: 'notification.logs' },
      action: 'access',
    });
    expect(outside.status).toBe(200);
  });

  it('denies log API access without the page permission', async () => {
    const app = new Hono();
    const router = new Hono();
    router.get('/logs', (context) => context.json({ data: [] }));

    registerNotificationRoutes({
      app,
      config: undefined,
      deps: {
        auth: { required: () => async (_context, next) => next() },
        authz: {
          middleware: () => async (context, next) => {
            context.set('authz', {
              can: () => Promise.resolve(false),
            });
            await next();
          },
        },
      },
      services: {
        notification: { router } as unknown as NotificationService,
      },
      paths: {} as never,
    });

    const response = await app.request('/api/notifications/logs');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Notification logs access is required.',
    });
  });

  it('does not apply core authentication to an in-app route', async () => {
    const app = new Hono();
    const middleware = vi.fn(async (_context, next) => next());
    const required = vi.fn(() => middleware);
    const authorization = vi.fn(async (_context, next) => next());

    registerNotificationRoutes({
      app,
      config: undefined,
      deps: {
        auth: { required },
        authz: { middleware: () => authorization },
      },
      services: {
        notification: { router: new Hono() } as unknown as NotificationService,
      },
      paths: {} as never,
    });
    app.get('/api/notifications/in-app', (context) => context.text('in-app'));

    const response = await app.request('/api/notifications/in-app');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('in-app');
    expect(middleware).not.toHaveBeenCalled();
    expect(authorization).not.toHaveBeenCalled();
  });
});
