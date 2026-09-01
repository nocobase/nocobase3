import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import { notificationServiceToken } from '../server/tokens.js';
import type { NotificationService } from '../server/types.js';

describe('@nocobase/app-plugin-notification routes', () => {
  it('mounts protected log routes and checks page access', async () => {
    const hostRouter = new Hono();
    const container = new ServiceContainer();
    const middleware = vi.fn(async (_context, next) => next());
    const required = vi.fn(() => middleware);
    const can = vi.fn(async () => true);
    const authzMiddleware = vi.fn(async (context, next) => {
      context.set('authz', { can });
      await next();
    });
    const notificationRouter = new Hono();
    notificationRouter.get('/logs', (context) => context.json({ data: [] }));
    container.instance(authenticationToken, { required } as unknown as Auth);
    container.instance(authorizationToken, {
      middleware: () => authzMiddleware,
    } as unknown as AppAuthorization);
    container.instance(notificationServiceToken, {
      router: notificationRouter,
    } as unknown as NotificationService);

    const router = await apiRoutes.createRouter(
      createApp(hostRouter, container),
    );

    const response = await router.request('/notifications/logs');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
    expect(required).toHaveBeenCalledOnce();
    expect(middleware).toHaveBeenCalledOnce();
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'page', id: 'notification.logs' },
      action: 'access',
    });
  });

  it('denies log API access without the page permission', async () => {
    const hostRouter = new Hono();
    const container = new ServiceContainer();
    container.instance(authenticationToken, {
      required: () => async (_context, next) => next(),
    } as unknown as Auth);
    container.instance(authorizationToken, {
      middleware: () => async (context, next) => {
        context.set('authz', { can: async () => false });
        await next();
      },
    } as unknown as AppAuthorization);
    container.instance(notificationServiceToken, {
      router: new Hono(),
    } as unknown as NotificationService);

    const router = await apiRoutes.createRouter(
      createApp(hostRouter, container),
    );
    const response = await router.request('/notifications/logs');
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Notification logs access is required.',
    });
  });

  it('does not apply core authorization to a non-log route', async () => {
    const hostRouter = new Hono();
    const container = new ServiceContainer();
    const authMiddleware = vi.fn(async (_context, next) => next());
    const authzMiddleware = vi.fn(async (_context, next) => next());
    container.instance(authenticationToken, {
      required: () => authMiddleware,
    } as unknown as Auth);
    container.instance(authorizationToken, {
      middleware: () => authzMiddleware,
    } as unknown as AppAuthorization);
    container.instance(notificationServiceToken, {
      router: new Hono(),
    } as unknown as NotificationService);

    const router = await apiRoutes.createRouter(
      createApp(hostRouter, container),
    );
    router.get('/notifications/in-app', (context) => context.text('in-app'));

    const response = await router.request('/notifications/in-app');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('in-app');
    expect(authMiddleware).not.toHaveBeenCalled();
    expect(authzMiddleware).not.toHaveBeenCalled();
  });
});

function createApp(
  router: Hono,
  container: ServiceContainer,
): AppPluginApplication {
  return {
    appName: 'test',
    publicBasePath: '',
    config: { app: { name: 'test', publicBasePath: '' } },
    paths: {} as never,
    router,
    container,
  };
}
