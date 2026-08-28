import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import type {
  NotificationPluginServices,
  NotificationRecipient,
} from '@nocobase/app-plugin-notification';
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import type { NotificationProvidersPluginConfig } from '../bootstrap.js';
import { TEST_PAGE_HTML } from './test-page.js';

export interface NotificationProvidersPluginRoutesDeps {
  readonly auth: {
    required(): MiddlewareHandler;
  };
}

export type NotificationProvidersPluginRoutesContext = AppPluginRoutesContext<
  NotificationProvidersPluginRoutesDeps,
  NotificationPluginServices,
  NotificationProvidersPluginConfig
>;

interface TestRequest {
  readonly channel?: unknown;
  readonly providerName?: unknown;
  readonly providerType?: unknown;
  readonly title?: unknown;
  readonly body?: unknown;
}

export default function registerNotificationProviderRoutes({
  app,
  config,
  deps,
  services,
}: NotificationProvidersPluginRoutesContext): void {
  const routes = new Hono();
  routes.use('*', deps.auth.required());

  routes.get('/test', (context) => {
    if (!isTestPageEnabled(config)) return context.text('Not found.', 404);
    return context.html(TEST_PAGE_HTML);
  });

  routes.get('/test/config', (context) => {
    if (!isTestPageEnabled(config))
      return context.json({ error: 'Not found.' }, 404);
    return context.json({
      data: describeChannels(config.notification.channels),
    });
  });

  routes.post('/test/send', async (context) => {
    if (!isTestPageEnabled(config))
      return context.json({ error: 'Not found.' }, 404);
    if (context.req.header('x-nocobase-provider-test') !== '1') {
      return context.json({ error: 'Missing provider test header.' }, 403);
    }

    const notification = services.notification;
    if (!notification)
      return context.json(
        { error: 'Notification service is unavailable.' },
        503,
      );

    const input = await readRequest(context);
    if (!input)
      return context.json({ error: 'Request body must be valid JSON.' }, 400);

    const channel =
      input.channel === 'email' || input.channel === 'im'
        ? input.channel
        : undefined;
    if (!channel)
      return context.json({ error: 'channel must be "email" or "im".' }, 400);

    const channelConfig = findEnabledChannel(
      config.notification.channels,
      channel,
    );
    const providerName = stringValue(input.providerName);
    const providerType = stringValue(input.providerType);
    const provider = channelConfig
      ? selectEnabledProvider(
          channelConfig.providers,
          providerName,
          providerType,
        )
      : undefined;
    if (!channelConfig || !provider) {
      return context.json(
        {
          error:
            providerName && providerType
              ? `Provider "${providerName}" (${providerType}) is not enabled for Channel "${channel}".`
              : `No enabled ${channel} Provider is configured.`,
        },
        409,
      );
    }

    const body =
      stringValue(input.body) ??
      `Provider test sent at ${new Date().toISOString()}.`;
    const title =
      stringValue(input.title) ?? 'NocoBase notification Provider test';
    if (!body.trim() || body.length > 2000 || title.length > 200) {
      return context.json(
        {
          error:
            'title must be at most 200 characters and body 1-2000 characters.',
        },
        400,
      );
    }

    const emailRecipient = config.notification.test?.emailRecipient?.trim();
    if (channel === 'email' && !emailRecipient) {
      return context.json(
        {
          error: 'TEST_EMAIL_RECIPIENT is required for email provider tests.',
        },
        409,
      );
    }
    const recipient: NotificationRecipient =
      channel === 'email' && emailRecipient
        ? { type: 'email', address: emailRecipient }
        : { type: 'target', id: providerTarget(provider) };

    try {
      const result = await notification.send({
        to: recipient,
        channels: [channel],
        routing:
          channel === 'im'
            ? {
                im: {
                  providers: {
                    strategy: 'single',
                    provider: { name: provider.name, type: provider.type },
                  },
                },
              }
            : undefined,
        content: { title, body },
        source: {
          type: 'notification-provider-test',
          referenceId: provider.name,
        },
      });
      return context.json(
        {
          data: {
            ...result,
            provider: { name: provider.name, type: provider.type },
          },
        },
        202,
      );
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Notification test failed.',
        },
        502,
      );
    }
  });

  routes.get('/test/status/:id', async (context) => {
    if (!isTestPageEnabled(config))
      return context.json({ error: 'Not found.' }, 404);
    const notification = services.notification;
    if (!notification)
      return context.json(
        { error: 'Notification service is unavailable.' },
        503,
      );
    const details = await notification.logs.get(context.req.param('id'));
    return details
      ? context.json({ data: details })
      : context.json({ error: 'Notification log not found.' }, 404);
  });

  app.route('/api/notification-providers', routes);
}

function isTestPageEnabled(config: NotificationProvidersPluginConfig): boolean {
  return config.notification.test?.enabled ?? false;
}

function describeChannels(
  channels: NotificationProvidersPluginConfig['notification']['channels'],
): readonly { channel: string; provider: { name: string; type: string } }[] {
  return channels.flatMap((channel) => {
    if (!channel.enabled || (channel.type !== 'email' && channel.type !== 'im'))
      return [];
    return channel.providers
      .filter((provider) => provider.enabled !== false)
      .map((provider) => ({
        channel: channel.type,
        provider: { name: provider.name, type: provider.type },
      }));
  });
}

function findEnabledChannel(
  channels: NotificationProvidersPluginConfig['notification']['channels'],
  type: 'email' | 'im',
):
  | NotificationProvidersPluginConfig['notification']['channels'][number]
  | undefined {
  return channels.find((channel) => channel.type === type && channel.enabled);
}

function selectEnabledProvider(
  providers: NotificationProvidersPluginConfig['notification']['channels'][number]['providers'],
  name?: string,
  type?: string,
):
  | NotificationProvidersPluginConfig['notification']['channels'][number]['providers'][number]
  | undefined {
  const enabled = providers.filter((provider) => provider.enabled !== false);
  if (name || type)
    return enabled.find(
      (provider) => provider.name === name && provider.type === type,
    );
  return enabled.find((provider) => provider.name === 'primary') ?? enabled[0];
}

function providerTarget(provider: object): string {
  if ('target' in provider && typeof provider.target === 'string') {
    const target = provider.target.trim();
    if (target) return target;
  }
  return 'default';
}

async function readRequest(context: Context): Promise<TestRequest | undefined> {
  try {
    const value: unknown = await context.req.json();
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}
