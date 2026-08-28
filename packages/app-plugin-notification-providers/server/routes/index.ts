import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import type {
  NotificationPluginServices,
  NotificationRecipient,
} from '@nocobase/app-plugin-notification';
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import type { NotificationProvidersPluginConfig } from '../bootstrap.js';

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
    const provider = channelConfig
      ? selectEnabledProvider(channelConfig.providers)
      : undefined;
    if (!channelConfig || !provider) {
      return context.json(
        { error: `No enabled ${channel} Provider is configured.` },
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
        : { type: 'external', namespace: 'im', id: provider.name };

    try {
      const result = await notification.send({
        to: recipient,
        channels: [channel],
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
    const provider = selectEnabledProvider(channel.providers);
    return provider
      ? [
          {
            channel: channel.type,
            provider: { name: provider.name, type: provider.type },
          },
        ]
      : [];
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
):
  | NotificationProvidersPluginConfig['notification']['channels'][number]['providers'][number]
  | undefined {
  const enabled = providers.filter((provider) => provider.enabled !== false);
  return enabled.find((provider) => provider.name === 'primary') ?? enabled[0];
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

const TEST_PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>NocoBase notification Provider test</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f6f8; color: #182230; }
      main { width: min(680px, calc(100vw - 40px)); padding: 28px; border: 1px solid #d7dee8; border-radius: 14px; background: white; box-shadow: 0 12px 32px rgb(16 24 40 / 10%); }
      h1 { margin: 0 0 8px; font-size: 24px; } p { color: #667085; line-height: 1.5; }
      .warning { padding: 12px; border-radius: 8px; background: #fff4e5; color: #8a4b08; }
      .providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 20px 0; }
      button { width: 100%; padding: 12px 14px; border: 0; border-radius: 8px; background: #155eef; color: white; font-weight: 600; cursor: pointer; }
      button:disabled { cursor: wait; opacity: .55; } #status { min-height: 24px; white-space: pre-wrap; }
      @media (prefers-color-scheme: dark) { body { background: #111827; color: #f9fafb; } main { background: #1f2937; border-color: #374151; } p { color: #b6c2d2; } .warning { background: #422006; color: #fed7aa; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Notification Provider test</h1>
      <p>Send one real test message through the configured Notification Manager. The email target is <code>TEST_EMAIL_RECIPIENT</code>; IM messages go to the configured bot group.</p>
      <div class="warning">This page is for development and verification. It is disabled by default in production.</div>
      <div id="providers" class="providers">Loading configured Providers…</div>
      <div id="status" role="status"></div>
    </main>
    <script>
      const base = location.pathname.endsWith('/')
        ? location.pathname.slice(0, -1)
        : location.pathname;
      const providers = document.getElementById('providers');
      const status = document.getElementById('status');
      const label = (item) => item.channel + ' / ' + item.provider.name + ' (' + item.provider.type + ')';
      async function load() {
        const response = await fetch(base + '/config');
        if (!response.ok) throw new Error('Unable to load Provider configuration (' + response.status + ').');
        const result = await response.json();
        providers.replaceChildren();
        for (const item of result.data) {
          const button = document.createElement('button');
          button.textContent = 'Send via ' + label(item);
          button.addEventListener('click', () => send(item.channel, button));
          providers.append(button);
        }
        if (!result.data.length) providers.textContent = 'No enabled Providers are configured.';
      }
      async function send(channel, button) {
        button.disabled = true; status.textContent = 'Submitting…';
        try {
          const response = await fetch(base + '/send', { method: 'POST', headers: { 'content-type': 'application/json', 'x-nocobase-provider-test': '1' }, body: JSON.stringify({ channel }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Provider test failed.');
          status.textContent = 'Accepted as ' + result.data.notificationId + '. Checking delivery status…';
          await poll(result.data.notificationId);
        } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
        finally { button.disabled = false; }
      }
      async function poll(id) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const response = await fetch(base + '/status/' + encodeURIComponent(id));
          if (!response.ok) return;
          const result = await response.json();
          const deliveries = result.data.deliveries.map((item) => item.delivery.status).join(', ');
          status.textContent = 'Notification ' + result.data.log.status + '; delivery: ' + deliveries;
          if (!['pending', 'processing'].includes(result.data.log.status)) return;
        }
      }
      load().catch((error) => { providers.textContent = error instanceof Error ? error.message : String(error); });
    </script>
  </body>
</html>`;
