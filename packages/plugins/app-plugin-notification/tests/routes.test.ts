import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { I18nRuntime } from '@nocobase/i18n';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import serverLocales from '../server/locales/index.js';
import { notificationServiceToken } from '../server/tokens.js';
import {
  NOTIFICATION_NAMESPACE,
  notificationI18nText,
  type NotificationService,
} from '../server/types.js';

describe('@nocobase/app-plugin-notification routes', () => {
  it('keeps logs on their page access permission', async () => {
    const { router, can } = await createRouter();

    const response = await router.request('/notifications/logs');

    expect(response.status).toBe(200);
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'page', id: 'notification.logs' },
      action: 'access',
    });
  });

  it('lists only safe targets with the separate test permission', async () => {
    const targets = [
      {
        channel: {
          type: 'email',
          label: notificationI18nText('test.channels.email', 'Email'),
        },
        provider: {
          name: 'primary',
          type: 'smtp',
          label: notificationI18nText('test.providers.smtp', 'SMTP'),
        },
        fields: [
          {
            name: 'recipient',
            label: notificationI18nText('test.fields.recipient', 'Recipient'),
            type: 'email',
          },
        ],
      },
    ] as const;
    const { router, can, listTestTargets } = await createRouter({ targets });

    const response = await router.request('/notifications/test/targets', {
      headers: { 'x-nocobase-notification-test': '1' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          channel: { type: 'email', label: 'Email' },
          provider: { name: 'primary', type: 'smtp', label: 'SMTP' },
          fields: [{ name: 'recipient', label: 'Recipient', type: 'email' }],
        },
      ],
    });
    expect(listTestTargets).toHaveBeenCalledOnce();
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'notification', id: 'test' },
      action: 'send',
    });
  });

  it('sends through the core manager with the authenticated actor', async () => {
    const { router, sendTest } = await createRouter();
    const input = {
      channel: 'email',
      provider: { name: 'primary', type: 'smtp' },
      values: { recipient: 'test@example.com' },
    };

    const response = await router.request('/notifications/test/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-nocobase-notification-test': '1',
      },
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(202);
    expect(sendTest).toHaveBeenCalledWith(input, { userId: 'user-1' });
  });

  it('rejects legacy or extended test request shapes', async () => {
    const { router, sendTest } = await createRouter();
    const request = (body: object): Promise<Response> =>
      router.request('/notifications/test/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nocobase-notification-test': '1',
        },
        body: JSON.stringify(body),
      });

    const legacy = await request({
      channel: 'email',
      providerName: 'primary',
      providerType: 'smtp',
      values: { recipient: 'test@example.com' },
    });
    const extended = await request({
      channel: 'email',
      provider: { name: 'primary', type: 'smtp', label: 'SMTP' },
      values: { recipient: 'test@example.com' },
    });

    expect(legacy.status).toBe(400);
    expect(extended.status).toBe(400);
    expect(sendTest).not.toHaveBeenCalled();
  });

  it('restricts status lookup to the actor through the manager interface', async () => {
    const { router, getTestStatus } = await createRouter();

    const response = await router.request('/notifications/test/test-1/status', {
      headers: { 'x-nocobase-notification-test': '1' },
    });

    expect(response.status).toBe(404);
    expect(getTestStatus).toHaveBeenCalledWith('test-1', {
      userId: 'user-1',
    });
  });

  it('requires the feature flag, anti-CSRF header, and test permission', async () => {
    const anonymous = await createRouter({ authenticated: false });
    expect(
      (
        await anonymous.router.request('/notifications/test/targets', {
          headers: { 'x-nocobase-notification-test': '1' },
        })
      ).status,
    ).toBe(401);

    const disabled = await createRouter({ testEnabled: false });
    expect(
      (
        await disabled.router.request('/notifications/test/targets', {
          headers: { 'x-nocobase-notification-test': '1' },
        })
      ).status,
    ).toBe(404);

    const enabled = await createRouter();
    expect(
      (await enabled.router.request('/notifications/test/targets')).status,
    ).toBe(403);

    const denied = await createRouter({ allowed: false });
    await expect(
      (
        await denied.router.request('/notifications/test/targets', {
          headers: {
            'accept-language': 'zh-CN',
            'x-nocobase-notification-test': '1',
          },
        })
      ).json(),
    ).resolves.toEqual({
      error: {
        code: 'NOTIFICATION_TEST_FORBIDDEN',
        message: '需要发送通知测试的权限。',
        ns: NOTIFICATION_NAMESPACE,
        key: 'errors.testForbidden',
      },
    });

    expect(
      (
        await denied.router.request('/notifications/test/targets', {
          headers: { 'x-nocobase-notification-test': '1' },
        })
      ).status,
    ).toBe(403);
  });
});

interface RouterOptions {
  readonly allowed?: boolean;
  readonly authenticated?: boolean;
  readonly targets?: ReturnType<NotificationService['listTestTargets']>;
  readonly testEnabled?: boolean;
}

async function createRouter(options: RouterOptions = {}): Promise<{
  readonly router: Hono;
  readonly can: ReturnType<typeof vi.fn>;
  readonly listTestTargets: ReturnType<typeof vi.fn>;
  readonly sendTest: ReturnType<typeof vi.fn>;
  readonly getTestStatus: ReturnType<typeof vi.fn>;
}> {
  const container = new ServiceContainer();
  const can = vi.fn(async () => options.allowed ?? true);
  const listTestTargets = vi.fn(() => options.targets ?? []);
  const sendTest = vi.fn(async () => ({
    notificationId: 'test-1',
    status: 'pending' as const,
    deliveries: [],
  }));
  const getTestStatus = vi.fn(async () => undefined);
  const logsRouter = new Hono();
  logsRouter.get('/logs', (context) => context.json({ data: [] }));
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      if (options.authenticated === false) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', { user: { id: 'user-1' }, session: {} });
      await next();
    },
  } as unknown as Auth);
  container.instance(authorizationToken, {
    middleware: () => async (context, next) => {
      context.set('authz', { can });
      await next();
    },
  } as unknown as AppAuthorization);
  container.instance(notificationServiceToken, {
    router: logsRouter,
    listTestTargets,
    sendTest,
    getTestStatus,
  } as unknown as NotificationService);

  const contribution = await apiRoutes.createRouter({
    appName: 'test',
    publicBasePath: '',
    config: {
      get: () => ({
        channels: [],
        test: { enabled: options.testEnabled ?? true },
      }),
    },
    paths: {} as never,
    router: new Hono(),
    container,
  } as unknown as AppPluginApplication);
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerNamespace(NOTIFICATION_NAMESPACE, serverLocales);
  await runtime.init();
  const router = new Hono();
  router.use('*', createI18nMiddleware(runtime));
  router.route('/', contribution);
  return {
    router,
    can,
    listTestTargets,
    sendTest,
    getTestStatus,
  };
}
