import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import { notificationServiceToken } from '../server/tokens.js';
import type { NotificationService } from '../server/types.js';

describe('@nocobase/app-plugin-notification routes', () => {
  it('mounts its own protected log routes', async () => {
    const hostRouter = new Hono();
    const container = new ServiceContainer();
    const middleware = vi.fn(async (_context, next) => next());
    const required = vi.fn(() => middleware);
    const notificationRouter = new Hono();
    notificationRouter.get('/logs', (context) => context.json({ data: [] }));
    container.instance(authenticationToken, { required } as unknown as Auth);
    container.instance(notificationServiceToken, {
      router: notificationRouter,
    } as unknown as NotificationService);

    const router = await apiRoutes.createRouter(
      createApp(hostRouter, container),
    );
    router.get('/outside', (context) => context.text('outside'));

    const response = await router.request('/notifications/logs');
    const outside = await router.request('/outside');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
    expect(required).toHaveBeenCalledOnce();
    expect(middleware).toHaveBeenCalledOnce();
    expect(outside.status).toBe(200);
  });

  it('does not apply core authentication to an in-app route', async () => {
    const hostRouter = new Hono();
    const container = new ServiceContainer();
    const middleware = vi.fn(async (_context, next) => next());
    const required = vi.fn(() => middleware);
    container.instance(authenticationToken, { required } as unknown as Auth);
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
    expect(middleware).not.toHaveBeenCalled();
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
