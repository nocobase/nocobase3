# Persist the notification domain through NotificationStore

Type: implementation / AFK
Status: completed
Label: needs-triage
Blocked by: None

## What to build

Implement the logical notification Schema, shared `defineMigration` files, NotificationStore facade, production DatabaseManager Adapter, development/test memory Adapter, and reusable Adapter Contract Test. The Store must own the atomic semantics required by Trigger, Dispatcher, Reconciler, admin queries, and user notification queries without exposing QueryAdapter details to the domain.

## Acceptance criteria

- [x] Initial Notification, Delivery, DeliveryAttempt, DeliveryStatusEvent, and UserNotificationItem migration records implement the resolved fields, versions, constraints, JSON schema versions, and indexes.
- [x] Command, Query, Maintenance, and Migration capabilities remain independently consumable behind one NotificationStore facade.
- [x] Trigger creation and Delivery transitions update all required projections and history atomically.
- [x] Lease Token, `invocationStartedAt`, status/event sequences, Notification recomputation, and user-item visibility obey the resolved concurrency contract.
- [x] The DatabaseManager Adapter is the production implementation and is verified on SQLite plus available PostgreSQL/MySQL environments; the memory Adapter remains explicit development/test-only.
- [x] Contract tests cover uniqueness, CAS, database time, due scans, crash boundaries, stable pagination, Inbox ownership, migrations, and unknown JSON schema versions.
- [x] Notification migrations reuse shared checksum/history/lock behavior, and DatabaseManager Adapter responsibilities are documented.

## Progress

- [x] Added the initial shared DatabaseManager migration for Notification, Delivery, Attempt, StatusEvent, and UserNotificationItem tables.
- [x] Added memory and DatabaseManager adapters for snapshot reads and Delivery compare-and-set transitions, with focused contract tests.
- [x] Completed command/query/maintenance capabilities and concurrency/recovery contract coverage.
