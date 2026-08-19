# Refresh the Inbox through Portal Live

Type: implementation / AFK
Status: blocked
Label: needs-triage
Blocked by: [01](01-module-shell-mount-lifecycle.md), [03](03-in-app-end-to-end.md)

## What to build

Implement the notification-independent Portal Live Runtime, same-origin WebSocket Upgrade integration, server LivePublisher, and Refine client so persisted UserNotificationItem changes invalidate the Inbox without making WebSocket state a source of truth.

## Acceptance criteria

- [ ] AppHost and standalone route `/<app>/live` Upgrade requests into the activated application without changing ordinary HTTP dispatch.
- [ ] Cookie and Bearer authentication, per-user Channel authorization, subscription limits, heartbeats, and application leases follow the resolved protocol.
- [ ] `createPortalLiveProvider()` implements subscribe/unsubscribe, reconnect, cursor replay, and `resync_required`; client publish is unavailable.
- [ ] Notification publishes only minimal created/updated/deleted/unread-count-changed invalidation events after transaction commit.
- [ ] Healthy connections remain visually silent; reconnect and HTTP resynchronization preserve cached content.
- [ ] Real HTTP/WebSocket tests cover authentication, isolation, replay, sequence gaps, forced close, and shutdown ordering.
- [ ] Portal Live API and protocol documentation lives in the centralized notification docs tree.
