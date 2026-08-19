# Deliver an in-app notification end to end

Type: implementation / AFK
Status: in_progress
Label: needs-triage
Blocked by: [01](01-module-shell-mount-lifecycle.md), [02](02-notification-store-schema-contract.md)

## What to build

Deliver the first complete user path: a trusted in-process service triggers direct content for an explicit user, the work passes through a shared NocoBase Queue Job and Dispatcher, the in-app Delivery becomes delivered, and the user reads and mutates the resulting UserNotificationItem through the Portal Inbox.

## Acceptance criteria

- [ ] TypeScript Trigger validates explicit user targets, trusted SystemPrincipal, limits, and direct In-app content before one atomic commit. (Direct in-app validation and limits are implemented; identity binding remains pending.)
- [ ] Notification Job uses shared QueueManager and publishes only `deliveryId`; sync/fake/database/redis Driver differences and duplicate or missing Jobs do not compromise persisted truth. (Sync path is implemented; cross-driver/recovery coverage remains pending.)
- [x] Dispatcher performs `queued → sending → delivered` and creates Attempt and StatusEvent history.
- [x] One visible UserNotificationItem is produced per user In-app Delivery; direct Email recipients never create one.
- [ ] Inbox list, unread count, Channel/read filters, read, unread, read-all, and delete APIs enforce Principal ownership and CSRF rules.
- [ ] Header bell and full Inbox page render, paginate, filter, and optimistically mutate against the real API.
- [ ] HTTP Trigger remains registered but returns `403 HTTP_TRIGGER_DISABLED` without parsing the request.
- [ ] Unit, Store integration, API, and browser tests demonstrate the complete path.
