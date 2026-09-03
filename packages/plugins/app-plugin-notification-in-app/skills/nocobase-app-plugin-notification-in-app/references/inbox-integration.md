# Inbox Integration Contract

## Required packages

- `@nocobase/app-plugin-authentication` supplies the authenticated user and session.
- `@nocobase/app-plugin-notification-in-app/server` supplies inbox persistence and HTTP routes.
- `@nocobase/app-plugin-notification/server` is required when the application needs the registered `in-app` Channel and Provider contribution.
- `@nocobase/app-client` supplies the application-scoped HTTP and realtime clients used by the Registry UI.

Register the core notification Server plugin before the in-app Server plugin. The in-app routes can operate without the core plugin, but notification delivery through the `in-app` Channel cannot.

## Public surfaces

The package root and `/server` export the Server plugin and supported Server contracts. Browser or shared code imports only the topic and event types from:

```ts
import {
  IN_APP_NOTIFICATION_REALTIME_TOPIC,
  type InAppNotificationRealtimeEvent,
} from '@nocobase/app-plugin-notification-in-app/realtime';
```

Do not import `server/realtime`, store implementations, or Registry authoring paths from application code.

The `in-app-ui` Registry item materializes to:

```text
client/extensions/nocobase-notification-in-app-ui
```

It intentionally has no `extension.ts`. The application must mount `NotificationInAppProvider` and place `NotificationInAppPage` in its authenticated route tree.

Install the declared npm dependencies and Registry primitives `alert`, `badge`, `button`, and `card`. The low-level `registry:materialize` command deliberately copies only source; it does not install either dependency class.

## HTTP and realtime behavior

The authenticated inbox API is rooted at `notifications/in-app` relative to the injected `AppClient` API base. Reads include list and unread-count. Writes include read/unread/delete and read-all, each preceded by an authenticated CSRF-token request.

The WebSocket topic is user-scoped by the Server. An `inbox.changed` event does not carry authoritative inbox contents; it tells the UI to refetch HTTP state. The UI also refetches after a successful subscription acknowledgement so events missed during disconnection are recovered. Window focus is a fallback invalidation.

When an application configures `api.baseURL` or `api.realtimeURL`, both transports must use those injected client settings. Never derive the HTTP endpoint from `window.location`, a Portal base, or the WebSocket URL.

#### Ownership and upgrades

The package owns canonical Registry source and may publish improved recipes. After materialization, the application owns its copy. Registry materialization refuses to overwrite an existing target; compare the base recipe, current application copy, and new recipe, then merge intentionally.

Keep local UI text, navigation, access presentation, and layout in the application copy. Keep authentication enforcement, per-user isolation, CSRF, persistence, and event publication in the package Server implementation.

## Diagnosis order

1. Confirm the authenticated list and unread-count endpoints return the expected durable state.
2. Confirm mutations fetch a CSRF token and return the changed item/count.
3. Confirm the application client points HTTP and realtime transports at the intended backend.
4. Confirm the realtime connection subscribes to the public topic and receives a matching acknowledgement.
5. Confirm a valid invalidation increments the UI revision and triggers an HTTP refetch.
6. Confirm a reconnect acknowledgement refetches even when no event was received.
7. Confirm cleanup removes the topic, acknowledgement, and window-focus listeners.

Do not diagnose a missing UI update by manually changing the inbox table or publishing synthetic production events. Reproduce with an isolated test notification or inspect the durable route and subscription logs.
