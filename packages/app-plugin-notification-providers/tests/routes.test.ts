import type { NotificationService } from '@nocobase/app-plugin-notification';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { NotificationProvidersPluginConfig } from '../server/bootstrap.js';
import registerNotificationProviderRoutes from '../server/routes/index.js';

describe('@nocobase/app-plugin-notification-providers routes', () => {
  it('serves an authenticated test page without exposing credentials', async () => {
    const { app, required } = createApp();

    const page = await app.request('/api/notification-providers/test');
    const config = await app.request('/api/notification-providers/test/config');

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Notification Provider test');
    expect(required).toHaveBeenCalledOnce();
    await expect(config.json()).resolves.toEqual({
      data: [
        {
          channel: 'in-app',
          provider: { name: 'primary', type: 'database' },
        },
        {
          channel: 'email',
          provider: { name: 'smtp', type: 'smtp' },
        },
        {
          channel: 'im',
          provider: { name: 'feishu', type: 'feishu-webhook' },
        },
        {
          channel: 'im',
          provider: { name: 'dingtalk', type: 'dingtalk-webhook' },
        },
      ],
    });
  });

  it('tests the explicitly requested IM Provider', async () => {
    const send = vi.fn(async () => ({
      notificationId: 'notification-1',
      status: 'pending' as const,
      deliveries: [],
    }));
    const { app } = createApp({ send });

    const response = await app.request(
      '/api/notification-providers/test/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nocobase-provider-test': '1',
        },
        body: JSON.stringify({
          channel: 'im',
          providerName: 'dingtalk',
          providerType: 'dingtalk-webhook',
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          type: 'target',
          id: 'default',
        },
        channels: ['im'],
        routing: {
          im: {
            providers: {
              provider: 'dingtalk',
            },
          },
        },
        source: {
          type: 'notification-provider-test',
          referenceId: 'dingtalk',
        },
      }),
    );
  });

  it('sends in-app tests to the authenticated user', async () => {
    const send = vi.fn(async () => ({
      notificationId: 'notification-1',
      status: 'pending' as const,
      deliveries: [],
    }));
    const { app } = createApp({ send });

    const response = await app.request(
      '/api/notification-providers/test/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nocobase-provider-test': '1',
        },
        body: JSON.stringify({
          channel: 'in-app',
          providerName: 'primary',
          providerType: 'database',
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { type: 'user', id: 'user-1' },
        channels: ['in-app'],
        routing: {
          'in-app': {
            providers: {
              provider: 'primary',
            },
          },
        },
      }),
    );
  });

  it('sends in-app tests to an explicitly requested user', async () => {
    const send = vi.fn(async () => ({
      notificationId: 'notification-1',
      status: 'pending' as const,
      deliveries: [],
    }));
    const { app } = createApp({ send });

    const response = await app.request(
      '/api/notification-providers/test/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nocobase-provider-test': '1',
        },
        body: JSON.stringify({
          channel: 'in-app',
          recipient: 'user-2',
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { type: 'user', id: 'user-2' },
        channels: ['in-app'],
      }),
    );
  });

  it('sends through the Notification Manager to the fixed test recipient', async () => {
    const send = vi.fn(async () => ({
      notificationId: 'notification-1',
      status: 'pending' as const,
      deliveries: [],
    }));
    const { app } = createApp({ send });

    const response = await app.request(
      '/api/notification-providers/test/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nocobase-provider-test': '1',
        },
        body: JSON.stringify({ channel: 'email' }),
      },
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { type: 'email', address: 'recipient@example.com' },
        channels: ['email'],
        routing: {
          email: {
            providers: {
              provider: 'smtp',
            },
          },
        },
        source: {
          type: 'notification-provider-test',
          referenceId: 'smtp',
        },
      }),
    );
  });

  it('sends email tests to an explicitly requested address', async () => {
    const send = vi.fn(async () => ({
      notificationId: 'notification-1',
      status: 'pending' as const,
      deliveries: [],
    }));
    const { app } = createApp({
      send,
      config: createConfig(undefined),
    });

    const response = await app.request(
      '/api/notification-providers/test/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nocobase-provider-test': '1',
        },
        body: JSON.stringify({
          channel: 'email',
          recipient: 'other@example.com',
        }),
      },
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { type: 'email', address: 'other@example.com' },
        channels: ['email'],
      }),
    );
  });

  it('rejects cross-site compatible posts and missing email recipients', async () => {
    const send = vi.fn();
    const { app } = createApp({ send });

    const missingHeader = await app.request(
      '/api/notification-providers/test/send',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel: 'email' }),
      },
    );
    expect(missingHeader.status).toBe(403);

    const { app: noRecipientApp } = createApp({
      send,
      config: createConfig(undefined),
    });
    const missingRecipient = await noRecipientApp.request(
      '/api/notification-providers/test/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nocobase-provider-test': '1',
        },
        body: JSON.stringify({ channel: 'email' }),
      },
    );
    expect(missingRecipient.status).toBe(409);
    await expect(missingRecipient.json()).resolves.toEqual({
      error:
        'recipient is required when TEST_EMAIL_RECIPIENT is not configured.',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not expose the page when it is disabled', async () => {
    const config = createConfig('recipient@example.com', false);
    const { app } = createApp({ config });

    const response = await app.request('/api/notification-providers/test');

    expect(response.status).toBe(404);
  });

  it('requires notification logs access for Provider tests', async () => {
    const { app, can } = createApp({ allowed: false });

    const response = await app.request('/api/notification-providers/test');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Notification logs access is required.',
    });
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'page', id: 'notification.logs' },
      action: 'access',
    });
  });
});

interface CreateAppOptions {
  readonly allowed?: boolean;
  readonly config?: NotificationProvidersPluginConfig;
  readonly send?: NotificationService['send'];
}

function createApp(options: CreateAppOptions = {}): {
  readonly app: Hono;
  readonly can: ReturnType<typeof vi.fn>;
  readonly required: ReturnType<typeof vi.fn>;
} {
  const app = new Hono();
  const authMiddleware = vi.fn(async (_context, next) => next());
  const required = vi.fn(() => authMiddleware);
  const getSession = vi.fn(async () => ({ user: { id: 'user-1' } }));
  const can = vi.fn(async () => options.allowed ?? true);
  const authzHandler = vi.fn(async (context, next) => {
    context.set('authz', { can });
    await next();
  });
  const authzMiddleware = vi.fn(() => authzHandler);
  const notification = {
    send:
      options.send ??
      vi.fn(async () => ({
        notificationId: 'notification-1',
        status: 'pending' as const,
        deliveries: [],
      })),
    logs: { get: vi.fn() },
  } as unknown as NotificationService;

  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required,
    getSession,
  } as unknown as Auth);
  container.instance(authorizationToken, {
    middleware: authzMiddleware,
  } as unknown as AppAuthorization);
  container.instance(notificationServiceToken, notification);
  const apiRouter = new Hono();
  registerNotificationProviderRoutes(
    {
      config: options.config ?? createConfig('recipient@example.com'),
      container,
    },
    apiRouter,
  );
  app.route('/api', apiRouter);

  return { app, can, required };
}

function createConfig(
  emailRecipient: string | undefined,
  enabled = true,
): NotificationProvidersPluginConfig {
  return {
    app: { publicBasePath: '' },
    notification: {
      channels: [
        {
          type: 'in-app',
          enabled: true,
          providers: [{ type: 'database', name: 'primary' }],
        },
        {
          type: 'email',
          enabled: true,
          providers: [{ type: 'smtp', name: 'smtp' }],
        },
        {
          type: 'im',
          enabled: true,
          providers: [
            { type: 'feishu-webhook', name: 'feishu' },
            { type: 'dingtalk-webhook', name: 'dingtalk' },
          ],
        },
      ],
      test: { enabled, emailRecipient },
    },
  };
}
