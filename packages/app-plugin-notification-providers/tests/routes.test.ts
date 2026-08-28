import type { NotificationService } from '@nocobase/app-plugin-notification';
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
              strategy: 'single',
              provider: { name: 'dingtalk', type: 'dingtalk-webhook' },
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
        source: {
          type: 'notification-provider-test',
          referenceId: 'smtp',
        },
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
      error: 'TEST_EMAIL_RECIPIENT is required for email provider tests.',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not expose the page when it is disabled', async () => {
    const config = createConfig('recipient@example.com', false);
    const { app } = createApp({ config });

    const response = await app.request('/api/notification-providers/test');

    expect(response.status).toBe(404);
  });
});

interface CreateAppOptions {
  readonly config?: NotificationProvidersPluginConfig;
  readonly send?: NotificationService['send'];
}

function createApp(options: CreateAppOptions = {}): {
  readonly app: Hono;
  readonly required: ReturnType<typeof vi.fn>;
} {
  const app = new Hono();
  const middleware = vi.fn(async (_context, next) => next());
  const required = vi.fn(() => middleware);
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

  registerNotificationProviderRoutes({
    app,
    config: options.config ?? createConfig('recipient@example.com'),
    deps: { auth: { required } },
    services: { notification },
    paths: {} as never,
  });

  return { app, required };
}

function createConfig(
  emailRecipient: string | undefined,
  enabled = true,
): NotificationProvidersPluginConfig {
  return {
    notification: {
      channels: [
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
