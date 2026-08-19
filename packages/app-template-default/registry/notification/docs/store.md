# Notification Store

`NotificationStore` separates command, query, maintenance, and migration capabilities while exposing one contract to memory and database adapters. The memory adapter is deterministic test infrastructure; production activation requires `DatabaseManager` unless the explicit non-persistent development override is enabled.

Important transaction boundaries are:

- `createNotificationBundle`: Notification, Deliveries, initial events, and Inbox placeholders are all-or-nothing.
- `claimDelivery`: Delivery CAS, Attempt creation, and sending StatusEvent are atomic.
- `transitionDelivery`: Delivery/Attempt/Event updates, Notification summary recomputation, Inbox availability, and lease cleanup are atomic.
- `markInboxRead`: only visible, non-deleted, unread records created no later than the operation timestamp are updated, with versions incremented.

Inbox pagination orders by `(createdAt DESC, id DESC)` and encodes both values in an opaque cursor, so equal timestamps do not skip or repeat rows. Database unread count uses an aggregate query instead of materializing the Inbox.

Snapshot columns carry schema-version fields. Unknown schema versions must be rejected with an explicit compatibility error before a worker invokes a provider; persisted provider, recipient, and content snapshots are never re-rendered during retry.
