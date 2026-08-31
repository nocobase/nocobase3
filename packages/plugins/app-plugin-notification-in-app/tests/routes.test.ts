import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  notificationServiceToken,
  type NotificationService,
} from '@nocobase/app-plugin-notification';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { InAppNotificationProvider } from '../server/providers/in-app-notification.js';
import { apiRoutes } from '../server/routes/index.js';

describe('@nocobase/app-plugin-notification-in-app routes', () => {
  it('authenticates through the router user resolver', async () => {
    const container = new ServiceContainer();
    const notification = {
      registry: {
        registerChannel() {
          return this;
        },
        registerProvider() {
          return this;
        },
      },
    } as unknown as NotificationService;
    container.instance(databaseManagerToken, {} as DatabaseManager);
    container.instance(notificationServiceToken, notification);
    const auth = {
      getSession: vi.fn(async () => null),
    } as unknown as Auth;
    container.instance(authenticationToken, auth);
    const router = new Hono();
    const provider = new InAppNotificationProvider(
      createApp(router, container),
    );
    provider.register();
    await provider.boot();
    const contributionRouter = await apiRoutes.createRouter(
      createApp(router, container),
    );

    const response = await contributionRouter.request('/notifications/in-app');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Authentication required.',
    });
    expect(auth.getSession).toHaveBeenCalledOnce();
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
