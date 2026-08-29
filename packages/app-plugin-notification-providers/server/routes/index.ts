import type { NotificationRecipient } from '@nocobase/app-plugin-notification';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import type { ServiceContainer } from '@nocobase/service-provider';
import type { Context } from 'hono';
import { Hono } from 'hono';

import type { NotificationProvidersPluginConfig } from '../bootstrap.js';
import { TEST_PAGE_HTML } from './test-page.js';

export interface NotificationProviderRoutesApplication {
  readonly config: NotificationProvidersPluginConfig;
  readonly container: ServiceContainer;
}

interface TestRequest {
  readonly channel?: unknown;
  readonly providerName?: unknown;
  readonly providerType?: unknown;
  readonly recipient?: unknown;
  readonly title?: unknown;
  readonly body?: unknown;
}

export function registerNotificationProviderRoutes(
  app: NotificationProviderRoutesApplication,
  router: Hono,
): void {
  const { config, container } = app;
  const auth = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const routes = new Hono<AuthorizationEnv>();
  routes.use('*', auth.required(), authorization.middleware());
  routes.use('*', async (context, next) => {
    const allowed = await context.get('authz').can({
      resource: { type: 'page', id: 'notification.logs' },
      action: 'access',
    });
    if (!allowed) {
      return context.json(
        { error: 'Notification logs access is required.' },
        403,
      );
    }
    await next();
  });

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

    if (!container.has(notificationServiceToken))
      return context.json(
        { error: 'Notification service is unavailable.' },
        503,
      );
    const notification = container.resolve(notificationServiceToken);

    const input = await readRequest(context);
    if (!input)
      return context.json({ error: 'Request body must be valid JSON.' }, 400);

    const channel = channelValue(input.channel);
    if (!channel)
      return context.json(
        { error: 'channel must be "email", "im", or "in-app".' },
        400,
      );

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

    const requestedRecipient = stringValue(input.recipient);
    if (
      channel === 'email' &&
      requestedRecipient &&
      !isEmail(requestedRecipient)
    ) {
      return context.json(
        { error: 'recipient must be a valid email address.' },
        400,
      );
    }
    if (
      channel === 'in-app' &&
      requestedRecipient &&
      requestedRecipient.length > 255
    ) {
      return context.json(
        { error: 'recipient must be at most 255 characters.' },
        400,
      );
    }

    const emailRecipient =
      channel === 'email'
        ? requestedRecipient || config.notification.test?.emailRecipient?.trim()
        : undefined;
    if (channel === 'email' && !emailRecipient) {
      return context.json(
        {
          error:
            'recipient is required when TEST_EMAIL_RECIPIENT is not configured.',
        },
        409,
      );
    }
    const recipient = await testRecipient({
      channel,
      emailRecipient,
      userId: channel === 'in-app' ? requestedRecipient : undefined,
      provider,
      context,
      auth,
    });
    if (!recipient) {
      return context.json(
        { error: 'Authentication is required for in-app notification tests.' },
        401,
      );
    }

    try {
      const result = await notification.send({
        to: recipient,
        channels: [channel],
        routing: {
          [channel]: {
            providers: {
              provider: provider.name,
            },
          },
        },
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
    if (!container.has(notificationServiceToken))
      return context.json(
        { error: 'Notification service is unavailable.' },
        503,
      );
    const notification = container.resolve(notificationServiceToken);
    const details = await notification.logs.get(context.req.param('id'));
    return details
      ? context.json({ data: details })
      : context.json({ error: 'Notification log not found.' }, 404);
  });

  router.route('/notification-providers', routes);
}

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<NotificationProvidersPluginConfig>
> = defineApiRoutes((app) => {
  const router = new Hono();
  registerNotificationProviderRoutes(app, router);
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<NotificationProvidersPluginConfig>
>[] = [apiRoutes];

export default routes;

function isTestPageEnabled(config: NotificationProvidersPluginConfig): boolean {
  return config.notification.test?.enabled ?? false;
}

function describeChannels(
  channels: NotificationProvidersPluginConfig['notification']['channels'],
): readonly { channel: string; provider: { name: string; type: string } }[] {
  return channels.flatMap((channel) => {
    if (!channel.enabled || !channelValue(channel.type)) return [];
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
  type: TestChannel,
):
  | NotificationProvidersPluginConfig['notification']['channels'][number]
  | undefined {
  return channels.find((channel) => channel.type === type && channel.enabled);
}

type TestChannel = 'email' | 'im' | 'in-app';

function channelValue(value: unknown): TestChannel | undefined {
  return value === 'email' || value === 'im' || value === 'in-app'
    ? value
    : undefined;
}

async function testRecipient(input: {
  readonly channel: TestChannel;
  readonly emailRecipient?: string;
  readonly userId?: string;
  readonly provider: NotificationProvidersPluginConfig['notification']['channels'][number]['providers'][number];
  readonly context: Context;
  readonly auth: Pick<Auth, 'getSession'>;
}): Promise<NotificationRecipient | undefined> {
  if (input.channel === 'email' && input.emailRecipient) {
    return { type: 'email', address: input.emailRecipient };
  }
  if (input.channel === 'in-app') {
    if (input.userId) return { type: 'user', id: input.userId };
    const session = await input.auth.getSession(input.context.req.raw.headers);
    return session ? { type: 'user', id: session.user.id } : undefined;
  }
  return { type: 'target', id: providerTarget(input.provider) };
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
  return enabled[0];
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

function isEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(value);
}
