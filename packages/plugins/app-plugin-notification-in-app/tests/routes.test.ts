import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { I18nRuntime } from '@nocobase/i18n';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { InAppNotificationProvider } from '../server/providers/in-app-notification.js';
import { apiRoutes } from '../server/routes/index.js';
import { IN_APP_NOTIFICATION_NAMESPACE } from '../server/i18n.js';
import serverLocales from '../server/locales/index.js';

describe('@nocobase/app-plugin-notification-in-app routes', () => {
  it('authenticates through the router user resolver', async () => {
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {} as DatabaseManager);
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

    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
    });
    runtime.registerNamespace(IN_APP_NOTIFICATION_NAMESPACE, serverLocales);
    await runtime.init();
    const localizedRouter = new Hono();
    localizedRouter.use('*', createI18nMiddleware(runtime));
    localizedRouter.route('/', contributionRouter);

    const response = await localizedRouter.request('/notifications/in-app', {
      headers: { 'accept-language': 'zh-CN' },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: 'IN_APP_NOTIFICATION_AUTHENTICATION_REQUIRED',
        message: '需要登录。',
        ns: IN_APP_NOTIFICATION_NAMESPACE,
        key: 'errors.authenticationRequired',
      },
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
