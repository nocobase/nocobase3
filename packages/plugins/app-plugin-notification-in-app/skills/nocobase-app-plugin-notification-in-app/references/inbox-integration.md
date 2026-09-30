# Inbox integration

## Registration and package surfaces

The plugin contributes durable inbox storage and authenticated routes. Register `@nocobase/app-plugin-notification-in-app/server` in the Server composition root. Register `@nocobase/app-plugin-notification/server` first if messages are sent through the core `in-app` Channel; inbox reads and mutations can operate without the core delivery plugin. Run pending migrations with `pnpm nocobase db apply` when automatic migrations are disabled or the deployment requires an explicit step.

Register `@nocobase/app-plugin-notification-in-app/client` in the Client composition root. It contributes locales and the `/dev/notification-in-app` development route; that route is not a production inbox page. The package's public `/client` entry exports `fetchInbox`, `fetchUnreadCount`, `mutateInboxItem`, `markInboxRead`, `NotificationInAppInbox`, `NotificationInAppProvider`, `useNotificationInAppRuntime`, and route/plugin exports. Import only that public entry from application code.

```ts
import {
  NotificationInAppInbox,
  NotificationInAppProvider,
  fetchInbox,
  fetchUnreadCount,
  mutateInboxItem,
  markInboxRead,
  useNotificationInAppRuntime,
} from '@nocobase/app-plugin-notification-in-app/client';
```

The `/realtime` entry exports `IN_APP_NOTIFICATION_REALTIME_TOPIC` and `InAppNotificationRealtimeEvent` for consumers that implement their own subscription. Browser code does not need to import that entry when it uses `NotificationInAppProvider`.

## Production inbox page

The built-in page component owns list, unread filtering, pagination, read/unread/delete actions, and read-all UI. Mount it under the application's authenticated App route and wrap it with the Provider:

```tsx
import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';

export function NotificationsPage() {
  return (
    <NotificationInAppProvider>
      <NotificationInAppInbox />
    </NotificationInAppProvider>
  );
}
```

Register the containing page through the target App's normal route/navigation composition. Do not expose the development route as the production inbox surface. `NotificationInAppProvider` uses the injected `ApiClient` and `realtimeClientToken`; it refreshes durable HTTP state after focus, connection open, or a valid inbox invalidation.

## Unread bell

The Provider must be keyed to the authenticated user so its count and listeners reset when accounts change. Follow the app's auth hook and navigation conventions; this example uses the template's public APIs:

```tsx
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import {
  NotificationInAppProvider,
  useNotificationInAppRuntime,
} from '@nocobase/app-plugin-notification-in-app/client';
import { Link } from 'react-router';

export function NotificationButton() {
  const { session, isPending } = useAuthentication();
  if (isPending || !session?.user) return null;
  return (
    <NotificationInAppProvider key={session.user.id}>
      <NotificationLink />
    </NotificationInAppProvider>
  );
}

function NotificationLink() {
  const { unreadCount } = useNotificationInAppRuntime();
  return <Link to='/notifications' aria-label={`Notifications, ${unreadCount} unread`} />;
}
```

If the application already has a per-user authenticated shell, place one keyed Provider there and consume `useNotificationInAppRuntime()` within its descendants instead of mounting duplicate providers.

## HTTP API and error contract

Endpoints are rooted at `/api/notifications/in-app` on the app API host. Within React, use the injected `ApiClient` and package helpers so a custom API base is respected. `fetchInbox(client, filters, signal?)` accepts `unreadOnly`, `limit` (default 25, maximum 100), and an opaque `cursor`; `fetchUnreadCount(client, signal?)` reads the durable count. A list response is `{ data, nextCursor? }`; pass `nextCursor` back unchanged.

- `GET /api/notifications/in-app?limit=25&unreadOnly=true&cursor=...` returns a stable `(createdAt, id)` page.
- `GET /api/notifications/in-app/unread-count` returns `{ count }`.
- `GET /api/notifications/in-app/csrf` returns `{ token }` and sets the `notification_in_app_csrf` cookie.
- `POST /api/notifications/in-app/:id` accepts `{ action: 'read' | 'unread' | 'delete' }`; omitted action defaults to `read`.
- `POST /api/notifications/in-app/read-all` accepts `{}` and returns `{ updated }`.

`mutateInboxItem(client, id, action)` and `markInboxRead(client)` fetch the CSRF token, then send `x-csrf-token` and the matching `notification_in_app_csrf` cookie. If implementing raw requests, preserve this double-submit check. Do not put tokens in logs or persistent browser storage.

Every route derives the user from the authenticated session and scopes reads and writes to that user. A client-supplied user id is never an identity. Stable plugin errors use `{ error: { code, message, ns, key, params? } }`; branch on `code` and display `message`.

| Response | Typical cause |
| --- | --- |
| `401 IN_APP_NOTIFICATION_AUTHENTICATION_REQUIRED` | No authenticated user could be resolved |
| `400 IN_APP_NOTIFICATION_INVALID_LIMIT` | Limit is not an integer from 1 through 100 |
| `400 IN_APP_NOTIFICATION_INVALID_CURSOR` | Cursor is malformed or not canonical |
| `400 IN_APP_NOTIFICATION_INVALID_BODY` | Mutation body is not a JSON object |
| `400 IN_APP_NOTIFICATION_INVALID_ACTION` | Action is not `read`, `unread`, or `delete` |
| `403 IN_APP_NOTIFICATION_INVALID_CSRF` | Header and cookie are missing or do not match |
| `404 IN_APP_NOTIFICATION_NOT_FOUND` | Item does not exist for the authenticated user |

## Custom clients and hosts

In a React component, `useApiClient()` supplies the app-scoped client. Outside React, pass an `ApiClient` explicitly to the exported fetch and mutation helpers. `ApiClient.request()` parses response text as JSON or plain text and is not a binary download API; use a binary-capable client path for document attachments.

A custom host that uses `createInAppRouter` must supply `resolveUserId(request)` from trusted authentication state or provide the expected session. Never accept a user id from query, body, or headers controlled by the caller. Register `IN_APP_NOTIFICATION_NAMESPACE` and `inAppNotificationServerLocales` with the host `I18nRuntime`, initialize it, and mount request i18n middleware before the router. Use the database provider's real `recipientExists(userId)` check backed by the authoritative user directory.

## Realtime and diagnosis

Realtime is an optimization; the HTTP list and unread-count endpoints remain authoritative. `NotificationInAppProvider` subscribes to the public topic, refreshes after a validated `inbox.changed` invalidation, when the connection opens, and on window focus. Its listener does not render event payload as inbox content. Reconnection refetch recovers missed events. A production inbox still works when realtime is unavailable, though updates may wait for focus or a manual refresh.

When implementing your own subscription, import `IN_APP_NOTIFICATION_REALTIME_TOPIC` and `InAppNotificationRealtimeEvent` from `@nocobase/app-plugin-notification-in-app/realtime`, validate payloads, and trigger an HTTP refetch. Remove topic, open, and focus listeners on unmount. Do not publish synthetic production events or edit inbox tables to diagnose UI refresh.
