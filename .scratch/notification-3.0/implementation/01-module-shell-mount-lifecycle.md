# Mount the notification module with an owned lifecycle

Type: implementation / AFK
Status: completed
Label: needs-triage
Blocked by: None

## What to build

Create the minimal notification server module and mount it from the new app-template composition root. Inject the shared App Services DatabaseManager, QueueManager and Logger; establish build, start, health, and idempotent close behavior without duplicating shared resource ownership.

## Acceptance criteria

- [x] `createNotificationModule()` returns `service`, `router`, `health`, `start`, and `close` through stable entrypoints.
- [x] `server/app.ts` mounts the router at `/api/notifications/*`, and embedded paths still resolve under `/<app>/api/notifications/*`.
- [x] The server build includes the notification server source through the approved temporary direct import.
- [x] Enabling notifications without a DatabaseManager fails activation explicitly; development/test memory Store requires explicit configuration.
- [x] `start()` and concurrent `close()` calls are idempotent; close stops only notification-owned Worker/Reconciler/Timers before shared App Services and App Runtime dispose Queue/Database.
- [x] Embedded and standalone paths await activation and preserve notification → shared Queue → shared Database disposal order without changing AppHost behavior; module/app tests cover activation failure and the resource ownership order.
- [x] TEMPORARY direct-import and dependency boundaries are documented under `registry/notification/docs/`.

## Progress

- [x] Approved implementation slices published with dependency links.
- [x] Notification module seam created with explicit persistence policy, health, idempotent start, and shared close result.
- [x] The old composition/build changes were intentionally discarded after fast-forwarding to `b5f2e30`; the module is mounted through the new App Services/Runtime composition root.
- [x] Shared DatabaseManager/QueueManager/Logger injection, build inclusion, activation tests, ownership-order tests, and centralized docs are complete. Worker/Reconciler implementations remain intentionally deferred to their delivery slices.

## Verification

- App Template typecheck passed under the repository Node 24 runtime.
- App Template full suite passed: 27 files, 111 tests; the focused notification/config suite later passed 29 tests after adding the disposal-order assertion.
- Production build completed, including `dist/registry/notification`, vendored workspace dependencies, and the generated server package.
