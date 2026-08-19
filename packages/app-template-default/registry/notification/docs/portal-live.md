# Portal Live

Portal Live is the lightweight same-origin real-time delivery channel for Portal apps. It pushes minimal Inbox invalidation events over an application/user-bound WebSocket so the Inbox can refresh without polling and without making WebSocket state a source of truth. A bounded in-memory buffer supports cursor replay; clients fall back to a full HTTP refetch when replay is unavailable.

The phase-one compatibility contract is deliberately small: same-origin Upgrade, application/user isolation, the `notifications/inbox` channel, minimal invalidation events, cursor replay or `resync_required`, reconnect, and unavailable client publish. Heartbeat timing, authentication deadlines, role semantics, application leases, cross-instance delivery, time-based retention, backpressure, and draining frames are implementation details rather than integration guarantees.

## Protocol

A single connection is one Portal Live stream. Frames are JSON objects with a `version: 1` field.

### Client to server

| Frame | Fields | Meaning |
| --- | --- | --- |
| `auth` | `token?` | Bearer session token. Ignored when the connection was already authenticated by the session cookie. |
| `subscribe` | `subscriptionId`, `channel`, `types?`, `cursor?` | Register interest in a channel. `types` filters event types; `cursor` requests replay after the last observed stream sequence. |
| `unsubscribe` | `subscriptionId` | Drop the subscription. |

### Server to client

| Frame | Fields | Meaning |
| --- | --- | --- |
| `auth_ok` | `streamId` | Authenticated; `streamId` is `appId:userId`. |
| `event` | `subscriptionId`, `event` | A live event for the subscription. `event.sequence` is monotonic within its in-memory stream. |
| `resync_required` | `streamId`, `sequence` | The cursor cannot be replayed; refetch via HTTP before resuming. |
| `server_draining` | – | Server is shutting down; reconnect to another instance. |
| `error` | `code`, `message` | Protocol or authorization error. |

Channels are per-user and app-scoped. The only channel today is `notifications/inbox`; event types are `created`, `updated`, `deleted`, and `unread-count-changed`.

### Connection lifecycle

1. The browser connects to `/<appBasePath>/live` with the session cookie; AppHost upgrades the socket into the activated application without touching ordinary HTTP dispatch.
2. The server authenticates the cookie pre-flight; a client may instead send an `auth` frame with a bearer token.
3. The current server uses defensive heartbeat and authentication timers, but their exact timing is not part of the phase-one public contract.
4. Protocol violations close with `4000`; duplicate or failed authentication closes with `4001`; server draining closes with `1001` after `server_draining`.

## Server modules

| Module | Responsibility |
| --- | --- |
| `portal-live/server/session.ts` | Per-connection session: authentication state, channel authorization, subscription limit (default 32). |
| `portal-live/server/connection.ts` | Frame protocol, cookie pre-auth, event routing, cursor replay, and defensive connection lifecycle. |
| `portal-live/server/socket.ts` | Adapter from the raw WebSocket-like socket (ws or Hono WSContext) to the connection seam. |
| `portal-live/server/index.ts` | `PortalLivePublisher` (`publish`, `subscribe`, `replay`) and the bounded in-memory per-user stream. |
| `server/services/portal-live.ts` | App-scoped service: creates connections bound to the SessionManager cookie, tracks them, and drains on app shutdown. |

App Services constructs Portal Live only when an `appId` is present, and wires it into the notification module. Shutdown drains Portal Live before any other service so clients receive `server_draining` before the process exits.

## Notification integration

`createLivePublishingNotificationStore()` decorates the notification store and publishes only after a successful write:

- `transitionDelivery` to `delivered` or `accepted` publishes one `created` event per affected user, with the item ids delivered to that user.
- `updateInboxItem` publishes `updated` or `deleted` plus `unread-count-changed`; a rejected or no-op mutation (version unchanged) publishes nothing.

`createNotificationBundle` never publishes: items are not visible until the delivery completes, so clients receive the event exactly when the HTTP Inbox would first return the item. Publishing failures are logged and never fail the underlying write; the revision dirty check on reconnect converges any missed events.

## Client

`createPortalLiveProvider()` (`portal-live/client/index.ts`) exposes `subscribe`/`unsubscribe` with automatic reconnect. On reconnect it resubscribes with the last cursor; a `resync_required` frame tells the caller to refetch via HTTP. Client publishing throws because domain events only originate from trusted server publishers.

## HTTP upgrade wiring

- Standalone: `serve()` receives `websocket: { server: app.websocketServer }` and the `upgradeWebSocket`-registered `/live` route.
- AppHost: `server.on('upgrade')` resolves the app id from the request path and calls `app.handleUpgrade(request, socket, head)` on the activated runtime; the app strips its public base path and rejects non-`/live` upgrades by destroying the socket.
- Unknown apps, client-only apps, and asset paths destroy the upgrade socket without a response.
- App close drains Portal Live (graceful `server_draining` + close `1001`), then terminates stragglers before closing the WebSocketServer and the HTTP server.
