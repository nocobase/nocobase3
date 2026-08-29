import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import registerNotificationRoutes from '../server/routes/index.js';
import { notificationServiceToken } from '../server/token.js';
import type { NotificationService } from '../server/types.js';

describe('@nocobase/app-plugin-notification routes', () => {
  it('mounts protected log routes and checks page access', async () => {
    const router = new Hono();
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
    registerNotificationRoutes(createApp(router, container), router);
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
    const router = new Hono();
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
    registerNotificationRoutes(createApp(router, container), router);
    const response = await router.request('/notifications/logs');
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Notification logs access is required.',
    });
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
    apiRouter: router,
    container,
  };
}
