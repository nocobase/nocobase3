---
title: 'Manually integrate notifications'
description: 'Manually integrate NotificationManager, in-app messages, Email and IM Providers, routes, and lifecycle management into a NocoBase application.'
keywords: 'NocoBase,NotificationManager,notification integration,in-app,SMTP,Resend,Feishu,DingTalk'
---

# Manually integrate notifications

`@nocobase/app-plugin-notification` integrates with a NocoBase Application through the plugin's `ServiceProvider`. After the plugin is enabled, the Provider resolves database, queue, and logging services from the shared container, creates and activates `NotificationManager`, registers queue jobs and reconciliation, and closes the runtime. Channel runtimes are created lazily on first use by default. The default template also registers the built-in Email and IM Providers; in most cases, you only need to set environment variables by following [Configure notification Providers](../../../app-plugin-notification-providers/docs/en-US/configuration.md). A custom host can combine these capabilities manually as described in the second half of this page.

This approach lets the host decide exactly which notification capabilities to enable. If you only need email, you do not need to create an in-app store and router.

## Step 1: Install packages and register migrations

Install the core package and the Channel / Provider packages you need:

```bash
pnpm add @nocobase/app-plugin-notification \
  @nocobase/app-plugin-notification-in-app \
  @nocobase/app-plugin-notification-providers
```

Register these three plugins in the application's `server/plugins.ts`; you do not need to maintain another enabled-plugin list in `package.json`.

Then run the application's migration command:

```bash
pnpm migrate
```

In the default template, `server/plugins.ts` explicitly composes the Server definitions exported by each plugin. The definitions declare migrations, Service Providers, and Routes, while test pages have their own login and permission boundaries. A custom host can continue with the following steps to create the runtime and mount routes manually.

## Step 2: Create the configuration

The host reads the configuration and passes it to `NotificationManager`. The following example enables both in-app messages and SMTP email. For Resend, Feishu, and DingTalk fields, see [Configure notification Providers](../../../app-plugin-notification-providers/docs/en-US/configuration.md):

```ts
import {
  defineEmailChannelConfig,
  defineSmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers';
import { defineInAppChannelConfig } from '@nocobase/app-plugin-notification-in-app';
import type { NotificationConfig } from '@nocobase/app-plugin-notification';

export const notificationConfig: NotificationConfig = {
  channels: [
    defineInAppChannelConfig({
      enabled: true,
      providers: [{ type: 'database', name: 'default' }],
    }),
    defineEmailChannelConfig({
      enabled: true,
      providers: [
        defineSmtpProviderConfig({
          name: 'primary-smtp',
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: {
            user: 'mailer@example.com',
            pass: 'replace-with-an-app-password',
          },
          from: 'NocoBase <mailer@example.com>',
        }),
      ],
    }),
  ],
};
```

The Provider `type` is the implementation type used to match a registered Provider definition. `name` is the unique name of this Provider configuration within the current Channel, and sending routes use it to select the Provider. Both values are written to the Delivery and should remain stable after an application restart or configuration update. A Webhook Provider does not need a business recipient; omit `to` when sending to pass the message directly to the selected Provider.

## Step 3: Create the runtime and register definitions

Create the manager in a module owned by the host. Register every Channel and Provider definition before calling `start()`:

```ts
import type { DatabaseManager } from '@nocobase/db';
import {
  createNotificationManager,
  createNotificationRegistry,
  type NotificationManager,
  type NotificationProviderIdentity,
} from '@nocobase/app-plugin-notification';
import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
  createInAppStore,
  type InAppMessage,
  type InAppRecipient,
  type InAppStore,
} from '@nocobase/app-plugin-notification-in-app';
import {
  createEmailChannelDefinition,
  createResendProviderDefinition,
  createSmtpProviderDefinition,
  type EmailMessage,
  type EmailRecipient,
} from '@nocobase/app-plugin-notification-providers';
import {
  createDingTalkWebhookProviderDefinition,
  createFeishuWebhookProviderDefinition,
  createImChannelDefinition,
  type ImMessage,
  type ImRecipient,
} from '@nocobase/app-plugin-notification-providers/im';
import type { Logger } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import { notificationConfig } from './notification-config.js';

interface AppNotificationChannels {
  readonly 'in-app': {
    readonly recipient: InAppRecipient;
    readonly message: InAppMessage;
  };
  readonly email: {
    readonly recipient: EmailRecipient;
    readonly message: EmailMessage;
  };
  readonly im: {
    readonly recipient: ImRecipient;
    readonly message: ImMessage;
  };
}

export interface AppNotificationRuntime {
  readonly manager: NotificationManager<AppNotificationChannels>;
  readonly inAppStore: InAppStore;
}

export function createAppNotificationRuntime(options: {
  readonly database: DatabaseManager;
  readonly queue: NocoBaseQueueManager;
  readonly logger: Logger;
  readonly resolveUserEmail?: (
    userId: string,
    provider: NotificationProviderIdentity,
  ) => Promise<string | undefined>;
}): AppNotificationRuntime {
  const registry = createNotificationRegistry();
  const inAppStore = createInAppStore(options.database);

  registry
    .registerChannel(createInAppChannelDefinition())
    .registerProvider(
      'in-app',
      createDatabaseProviderDefinition({ store: inAppStore }),
    )
    .registerChannel(
      createEmailChannelDefinition({
        resolveUserEmail: options.resolveUserEmail,
      }),
    )
    .registerProvider('email', createSmtpProviderDefinition())
    .registerProvider('email', createResendProviderDefinition())
    .registerChannel(createImChannelDefinition())
    .registerProvider('im', createFeishuWebhookProviderDefinition())
    .registerProvider('im', createDingTalkWebhookProviderDefinition());

  const manager = createNotificationManager<AppNotificationChannels>({
    database: options.database,
    queue: options.queue,
    logger: options.logger,
    config: notificationConfig,
    registry,
  });

  return { manager, inAppStore };
}
```

If you do not need in-app messages, remove `inAppStore`, the `in-app` Channel, and the database Provider. Email and IM definitions can also be removed as needed. Registering definitions alone does not send messages; an external request is made only when the corresponding Provider is enabled in the configuration and `send()` is called.

### The idempotency contract for custom Providers

A custom Provider can declare whether duplicate submissions are safe through `capabilities.idempotency`. If this configuration is omitted or set to `{ supported: false }`, the notification service treats the Provider as not supporting idempotency.

Set `{ supported: true }` only when submitting the same `deliveryId` repeatedly cannot create duplicate messages. The notification service reuses `deliveryId` for every retry of the same Delivery, but it does not deduplicate submissions on behalf of the Provider. The Provider must use it as the external service's idempotency key or enforce a unique constraint in its own storage:

```ts
return {
  name: config.name,
  type: config.type,
  capabilities: {
    idempotency: { supported: true },
  },
  async send(input) {
    await client.send({
      message: input.message,
      idempotencyKey: input.deliveryId,
    });
    return { status: 'accepted' };
  },
};
```

If the external service retains idempotency keys only for a fixed period, set `retentionMs` to the validity period promised by that service:

```ts
capabilities: {
  idempotency: {
    supported: true,
    retentionMs: 24 * 60 * 60 * 1000,
  },
},
```

When `retentionMs` is omitted, the Provider promises idempotency for the entire lifetime of the Delivery. Do not use `attemptId` as the idempotency key—each actual submission creates a new Attempt, so it changes when the Delivery is retried.

:::warning Note

`supported: true` is only a capability declaration; it does not trigger any automatic deduplication. If the Provider does not implement idempotency based on `deliveryId`, the notification service can incorrectly treat an `unknown` retry with duplicate risk as a safe retry.

:::

## Step 4: Mount the routes

`manager.router` provides Delivery and Attempt logs. The in-app inbox router is provided by `@nocobase/app-plugin-notification-in-app` and must use the same store created in Step 3:

```ts
import { createInAppRouter } from '@nocobase/app-plugin-notification-in-app';
import { Hono, type MiddlewareHandler } from 'hono';

import type { AppNotificationRuntime } from './notification-runtime.js';

export function createNotificationRoutes(options: {
  readonly authRequired: MiddlewareHandler;
  readonly notification: AppNotificationRuntime;
  readonly resolveRequestUserId: (
    request: Request,
  ) => Promise<string | undefined>;
}): Hono {
  const routes = new Hono();
  routes.use('*', options.authRequired);
  routes.route('/', options.notification.manager.router);
  routes.route(
    '/in-app',
    createInAppRouter(options.notification.inAppStore, {
      resolveUserId: options.resolveRequestUserId,
    }),
  );

  return routes;
}

app.route(
  '/api/notifications',
  createNotificationRoutes({
    authRequired,
    notification,
    resolveRequestUserId,
  }),
);
```

`resolveRequestUserId` must obtain the logged-in user ID from the current request. Do not accept a user ID submitted directly by the client as the current user identity.

The notification log and in-app routers obtain a translator from the request context and return structured errors containing `code/message/ns/key/params`. A custom host must register the public locale loaders with its own `I18nRuntime`, then mount request i18n middleware before these routers:

```ts
import {
  NOTIFICATION_NAMESPACE,
  notificationServerLocales,
} from '@nocobase/app-plugin-notification';
import {
  IN_APP_NOTIFICATION_NAMESPACE,
  inAppNotificationServerLocales,
} from '@nocobase/app-plugin-notification-in-app';
import { createI18nMiddleware } from '@nocobase/i18n/server';

i18n.registerNamespace(NOTIFICATION_NAMESPACE, notificationServerLocales);
i18n.registerNamespace(
  IN_APP_NOTIFICATION_NAMESPACE,
  inAppNotificationServerLocales,
);
await i18n.init();
app.use('*', createI18nMiddleware(i18n));
```

Here, `i18n` is the `I18nRuntime` owned by the host. Errors produced by the authentication middleware still follow the authentication plugin's contract.

## Step 5: Connect the lifecycle

Start the manager after all definitions and routes are registered, and release its resources when the application closes:

```ts
await notification.manager.start();

lifecycle.registerDisposer('notification', async (): Promise<void> => {
  await notification.manager.close();
});
```

Here, `lifecycle` represents the host's lifecycle manager. `start()` creates runtimes for enabled Channels, registers queue jobs, and starts the reconciler. `close()` stops the reconciler and closes Providers in reverse order.

## Optional: Add the Client pages

The `logs-ui` Registry item from `@nocobase/app-plugin-notification` still provides the Delivery log page. It materializes editable source into the application:

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-notification \
  --item logs-ui \
  --output-root /path/to/your-app
```

The item writes to `client/extensions/nocobase-notification-logs-ui`.

The in-app message component example is provided directly by `@nocobase/app-plugin-notification-in-app/client`. After registering this Client plugin in the application, `/dev/notification-in-app` appears automatically in development. When the application's public base is `/main`, the browser path is `/main/dev/notification-in-app`. The page mounts the unread-count Provider itself and cleans up the realtime subscription when you leave the page. The Dev Route and its page module are excluded from production builds.

The two pages request `/api/notifications/logs` and `/api/notifications/in-app` respectively, so their paths must match the server mounts in Step 4. The log Registry copy belongs to the consuming application; the in-app Dev page belongs to the plugin runtime and is upgraded with the plugin.

## Related links

- [Notification overview](./overview.md) — understand Notification, Delivery, and Attempt
- [Configure notification Providers](../../../app-plugin-notification-providers/docs/en-US/configuration.md) — configure SMTP, Resend, Feishu, and DingTalk
- [Send notifications](./sending.md) — use `NotificationManager.send()`
- [Notification logs](./logs.md) — query Delivery and Attempt records
