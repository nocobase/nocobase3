# Refresh the Inbox through Portal Live

Type: implementation / AFK
Status: completed
Label: needs-triage
Blocked by: [01](01-module-shell-mount-lifecycle.md), [03](03-in-app-end-to-end.md)

## What to build

Implement a lightweight, notification-independent Portal Live Runtime, same-origin WebSocket Upgrade integration, server LivePublisher, and Refine-style client so persisted UserNotificationItem changes invalidate the Inbox without making WebSocket state a source of truth. HTTP remains the reconciliation path; Portal Live is not a general real-time platform in phase one.

## Acceptance criteria

- [x] AppHost and standalone route `/<app>/live` Upgrade requests into the activated application without changing ordinary HTTP dispatch.
- [x] A connection is bound to the current application and authenticated user through the available Portal session or token seam; `notifications/inbox` cannot subscribe to another user and a per-connection subscription limit is enforced.
- [x] `createPortalLiveProvider()` implements subscribe/unsubscribe, reconnect, cursor replay, and `resync_required`; client publish is unavailable.
- [x] Notification publishes only minimal created/updated/deleted/unread-count-changed invalidation events after transaction commit.
- [x] Healthy connections remain visually silent; a bounded in-memory cursor buffer supports replay when possible and otherwise returns `resync_required` for HTTP reconciliation.
- [x] Focused tests cover Upgrade routing, authentication, application/user isolation, cursor replay and sequence gaps, and ordinary shutdown.
- [x] Portal Live API and protocol documentation lives in the centralized notification docs tree.

## Simplified phase-one boundary

- Heartbeats, a five-second authentication deadline, effective-role rebinding, application leases, backpressure policy, cross-instance replay, time-based replay retention, and a guaranteed draining frame are not phase-one compatibility requirements.
- Implementations may retain lightweight defensive heartbeat or shutdown behavior, but integrations must not depend on it.
- The only supported Channel is `notifications/inbox`; events are invalidation hints containing IDs, never authoritative Inbox data.
