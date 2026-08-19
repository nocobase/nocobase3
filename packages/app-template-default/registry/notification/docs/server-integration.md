# Server integration

## Construction

`createNotificationModule()` is the notification server module seam. The App Template constructs it through App Services and injects:

- the shared `DatabaseManager`;
- the shared `NocoBaseQueueManager`;
- a notification-scoped logger.

The notification module does not create or destroy those shared resources. Its later implementation owns only notification-specific workers, reconciliation timers, provider adapters, and other resources created behind this seam.

The direct import from `server/services/index.ts` is temporary. Server TypeScript compilation and production dependency scanning explicitly include `registry/notification`; a future server Registry loader may replace this wiring without changing the notification module interface.

## Activation

Notification runtime configuration is defined in `registry/notification/config/server.ts`:

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `NOTIFICATION_ENABLED` | `true` | Construct and mount the notification module. |
| `NOTIFICATION_ALLOW_NON_PERSISTENT_STORE` | `false` | Explicit development/test override when no DatabaseManager is available. Never enable this in production. |

When enabled without a DatabaseManager, construction fails with `NOTIFICATION_PERSISTENT_STORE_REQUIRED`. Embedded and production standalone startup await `app.start()`, so queue initialization failures fail Portal activation instead of leaving a partially active notification module.

Direct calls to `createApp()` keep notifications disabled unless `options.notifications.enabled` is supplied. This preserves the small app-composition seam used by focused tests and local embedding callers; the shared Runtime always passes the resolved notification config.

## HTTP mount

The app-local mount is `/api/notifications/*`. AppHost strips the public application prefix before dispatch, so an embedded application named `main` exposes the route as `/main/api/notifications/*`; standalone uses its configured public base path.

The current `POST /api/notifications/trigger` endpoint intentionally returns `403 HTTP_TRIGGER_DISABLED`. HTTP triggering is out of the current module scope; internal system callers use the TypeScript trigger interface (see [trigger-interface.md](trigger-interface.md)), and an external HTTP surface will be revisited once the identity/ACL module lands.

## Lifecycle ownership

Startup and shutdown are idempotent.

1. App Runtime prepares the database and runs configured migrations.
2. App Services constructs the shared QueueManager and notification module.
3. Embedded and production standalone startup await the notification module start operation.
4. Shutdown drains Portal Live and stops Notification scheduling.
5. App Services drains the shared QueueManager, then closes notification providers/Reconciler under the deadline.
6. App Runtime destroys the shared DatabaseManager last.

`createNotificationModule().close()` never calls `queueManager.close()` or `database.destroy()`. Startup failure follows the same ownership order and disposes the prepared Runtime before returning the error.

## Current boundary

The phase-one module includes Store migrations, Queue jobs, recovery, Inbox and Live refresh, SMTP/fake providers, developer templates, and operational administration. Remaining exclusions and their removal conditions are listed in [config.md](config.md).
