# PROTOTYPE — Notification Inbox and realtime recovery

This throwaway prototype answers one question: how should the Portal bell,
recent-notification surface, full Inbox, and realtime recovery behave while the
database remains the only source of truth?

It is not production code and must not be imported by the Portal application.

## Review

Open [`index.html`](index.html) directly in a browser. No build, server, or
network access is required. Resize the browser below 680px to review the mobile
bell sheet and Inbox layout.

Suggested paths:

1. Open the bell. Opening it does not mark anything as read.
2. Open an unread notification. The item becomes read before the simulated
   internal navigation and both bell and Inbox counts update.
3. Use `Mark all as read`, then mark one item unread from its row action.
4. Delete an item and confirm that it disappears from both surfaces.
5. Use the prototype controls to simulate a new Live Event, a reconnect, and a
   sequence gap that requires HTTP reconciliation.
6. Switch to the full Inbox, filter unread items and notification Channels, and
   use pagination.

## Prototype conclusions

- The bell belongs in both desktop and mobile headers, immediately before the
  user menu. The accessible label includes the unread count; the visual badge
  caps at `99+`.
- The bell surface shows at most five recent items, degraded
  connection/reconciliation state, `Mark all as read`, and one
  `View all notifications` exit. A healthy realtime connection is silent.
- Opening the bell never mutates read state. Opening a notification marks only
  that item as read and then follows its Portal-relative action URL.
- Bell and Inbox use one server-query cache. Read, unread, mark-all-read, and
  delete use optimistic cache updates, roll back on HTTP failure, and reconcile
  after completion; Live Events merely trigger debounced HTTP invalidation.
- A lost connection does not block the UI or clear cached items. The surface
  reports reconnection quietly. A cursor gap or changed stream triggers a more
  explicit `Synchronizing latest notifications` state until HTTP reconciliation
  finishes.
- The full Inbox uses All/Unread, Channel filters, and ordinary pagination. One
  logical user notification aggregates its Channels, so an item delivered by
  both In-app and Email appears once with two badges and matches either filter.
  Read state means viewed in the Portal notification center, not proof that an
  email was opened.
- Single-item delete requires confirmation because phase one has no restore
  action. Deleting a UserNotificationItem never changes its Notification or Delivery.

## Non-goals

- No API requests, authentication, WebSocket connection, persistence, or
  production React components.
- No notification preferences, topics, subscription management, templates,
  delivery status, email details, or cross-user Inbox access.
