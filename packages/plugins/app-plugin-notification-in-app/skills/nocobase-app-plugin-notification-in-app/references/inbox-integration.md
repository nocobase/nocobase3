# Inbox Integration Contract

## Required packages

- `@nocobase/app-plugin-authentication` supplies the authenticated user and session.
- `@nocobase/app-plugin-notification-in-app/server` supplies inbox persistence and HTTP routes.
- `@nocobase/app-plugin-notification/server` is required when the application needs the registered `in-app` Channel and Provider contribution.
- `@nocobase/app-client` supplies the application-scoped HTTP and realtime clients used by the Client inbox page.

Register the core notification Server plugin before the in-app Server plugin. The in-app routes can operate without the core plugin, but notification delivery through the `in-app` Channel cannot.

## Public surfaces

The package root and `/server` export the Server plugin and supported Server contracts. Browser or shared code imports only the topic and event types from:

```ts
import {
  IN_APP_NOTIFICATION_REALTIME_TOPIC,
  type InAppNotificationRealtimeEvent,
} from '@nocobase/app-plugin-notification-in-app/realtime';
```

Do not import `server/realtime`, store implementations, or other internal implementation paths from application code.

The package's Client plugin contributes this development-only App-relative route:

```text
/dev/notification-in-app
```

Register `@nocobase/app-plugin-notification-in-app/client` in the application Client composition root. The page mounts `NotificationInAppProvider` locally and cleans up its realtime and focus listeners when navigation leaves the page. The Dev Route and its exclusive dependencies are absent from production builds.

## HTTP and realtime behavior

The authenticated inbox API is rooted at `notifications/in-app` relative to the injected `AppClient` API base. Reads include list and unread-count. Writes include read/unread/delete and read-all, each preceded by an authenticated CSRF-token request.

The WebSocket topic is user-scoped by the Server. An `inbox.changed` event does not carry authoritative inbox contents; it tells the UI to refetch HTTP state. The UI also refetches after a successful subscription acknowledgement so events missed during disconnection are recovered. Window focus is a fallback invalidation.

When an application configures `api.baseURL` or `api.realtimeURL`, both transports must use those injected client settings. Never derive the HTTP endpoint from `window.location`, a Portal base, or the WebSocket URL.

#### Ownership and upgrades

The plugin owns the inbox components, Provider, Dev Route, authentication enforcement, per-user isolation, CSRF, persistence, and event publication. Applications receive UI changes by upgrading the plugin. A production inbox surface requires a separate product decision and must use an authenticated App or Settings Route rather than exposing the Dev Route.

## Diagnosis order

1. Confirm the authenticated list and unread-count endpoints return the expected durable state.
2. Confirm mutations fetch a CSRF token and return the changed item/count.
3. Confirm the application client points HTTP and realtime transports at the intended backend.
4. Confirm the realtime connection subscribes to the public topic and receives a matching acknowledgement.
5. Confirm a valid invalidation increments the UI revision and triggers an HTTP refetch.
6. Confirm a reconnect acknowledgement refetches even when no event was received.
7. Confirm cleanup removes the topic, acknowledgement, and window-focus listeners.

Do not diagnose a missing UI update by manually changing the inbox table or publishing synthetic production events. Reproduce with an isolated test notification or inspect the durable route and subscription logs.
