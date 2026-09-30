# Integration and Configuration

## Register the plugins

The core Server plugin depends on the application's authentication, authorization, database, jobs, and logging services. Keep Authentication and Authorization registered before the notification plugins.

In `packages/templates/app-template-default/server/plugins.ts`, the Server contribution order is Authentication, Authorization, core notification, in-app notification when needed, and built-in Providers when needed:

```ts
import notification from '@nocobase/app-plugin-notification/server';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/server';
import notificationProviders from '@nocobase/app-plugin-notification-providers/server';

const serverPlugins = defineServerPlugins([
  authentication,
  authorization,
  // Other application plugins.
  notification,
  notificationInApp,
  notificationProviders,
]);
```

Register only packages the application installs. The core plugin contributes its delivery runtime and routes; `@nocobase/app-plugin-notification-in-app` contributes the `in-app` Channel; `@nocobase/app-plugin-notification-providers` contributes `smtp`, `resend`, `feishu-webhook`, and `dingtalk-webhook`.

In `packages/templates/app-template-default/client/plugins.ts`, register the notification Client contribution to provide its settings route and logs page:

```ts
import notification from '@nocobase/app-plugin-notification/client';

const clientPlugins = defineClientPlugins([
  // Other application plugins.
  notification(),
]);
```

The logs page is at `/settings/notifications/logs` relative to the App base path, and it is protected by the `page:notification.logs` `access` permission. The `logs-ui` Registry item is also published by the core package for applications that need its customizable UI components.

## Configure Channels and secrets

`notification.channels` maps stable Channel names to one flat Provider configuration. A Channel has one `provider`, optional `enabled` (default `true`), and Provider-specific fields; `name`, `type`, and `providers` are not Channel configuration fields. Channel names must be non-empty, trimmed strings of at most 100 characters. Duplicate YAML keys are rejected.

The application config file is `config.yml`; its `notification` defaults and environment mapping live in `server/config/notification.ts`. YAML does not expand shell-style environment placeholders. Leave secrets out of the YAML example and use one of these supported paths.

```yaml
notification:
  channels:
    system-email:
      provider: smtp
      host: smtp.example.com
      port: 587
      from: notifications@example.com
    marketing-email:
      provider: resend
      from: marketing@example.com
    ops-feishu:
      provider: feishu-webhook
    ops-dingtalk:
      provider: dingtalk-webhook
    inbox:
      provider: in-app
```

For a one-time config update, pass environment-variable names to `config set --from-env`. The command reads the secret from the environment and writes its value into `config.yml`, so treat that file as secret-bearing:

```bash
pnpm nocobase config set --from-env \
  notification.channels.system-email.auth.pass=SMTP_PASSWORD \
  notification.channels.marketing-email.apiKey=RESEND_API_KEY \
  notification.channels.ops-feishu.webhookUrl=FEISHU_WEBHOOK_URL
```

For deployment-time injection, map environment variables in `server/config/notification.ts` with `envString`; this keeps the secret out of `config.yml`:

```ts
import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig({
  defaults: { channels: {} },
  env: {
    SMTP_PASSWORD: envString('channels.system-email.auth.pass'),
    RESEND_API_KEY: envString('channels.marketing-email.apiKey'),
    FEISHU_WEBHOOK_URL: envString('channels.ops-feishu.webhookUrl'),
  },
});

export default notification;
```

The Provider packages validate their own fields. SMTP supports `host`, `port`, `secure`, `auth`, `from`, and `replyTo`; Resend supports `apiKey`, `from`, and optional `replyTo`; both Webhook Providers support `webhookUrl` and optional signing `secret`. Feishu URLs must use HTTPS on `open.feishu.cn` or `open.larksuite.com` or their subdomains; DingTalk URLs must use HTTPS on `oapi.dingtalk.com` or its subdomains. Webhook URLs cannot contain embedded username/password credentials, and redirects are rejected.

After changing startup configuration or registering a plugin, restart the application. Run pending migrations with `pnpm nocobase db apply` when automatic migrations are disabled or when the deployment process requires an explicit migration step. The example template enables automatic migrations in its default database configuration.

`notification.retry.maxAttempts` counts the first Provider attempt and defaults to `1`, so automatic retries are disabled by default. `notification.retry.intervalMs` defaults to `5000`; a validated Provider `Retry-After` hint takes precedence. Runtime defaults are a 30-second Delivery lease, a 20-second Provider timeout, and reconciliation every 30 seconds in batches of 100.

## Inspect logs and test a Channel

The logs API requires an authenticated session and the `page:notification.logs` `access` permission. Use the logs page or call these endpoints with the App's authenticated session:

```bash
curl --cookie "$NOTIFICATION_SESSION_COOKIE" http://localhost:13000/api/notifications/logs
curl --cookie "$NOTIFICATION_SESSION_COOKIE" http://localhost:13000/api/notifications/logs/NOTIFICATION_ID
```

`GET /api/notifications/logs` returns `{ data: [...] }` with the most recent 100 Notifications; it has no pagination or filters. `GET /api/notifications/logs/:id` returns `{ data: { log, deliveries } }`; each Delivery includes its attempts and retry audits. Message and recipient snapshots, lease tokens, and lease expiration are redacted. A missing id returns `404` with `NOTIFICATION_LOG_NOT_FOUND`; unauthenticated requests return `401`, and a missing logs permission returns `403`.

The test API is `GET /api/notifications/test/targets`, `POST /api/notifications/test/send`, and `GET /api/notifications/test/:id/status`. Every request requires authentication and `x-nocobase-notification-test: 1`; only send additionally requires `notification:test` `send`. A missing header or permission returns `403`; invalid requests return `400`; a test status visible to another user or an unknown id returns `404`. Each test send creates ordinary persistent logs and performs a real external send.

A production test send requires an explicit Channel and recipient (or a Provider-supported recipientless mode), permission, and follow-up verification. Test target descriptors contain Channel and Provider labels plus safe form fields, never secrets or Webhook URLs.
