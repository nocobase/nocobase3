# Harden, document, and accept the phase-one module

Type: implementation / AFK
Status: blocked
Label: needs-triage
Blocked by: [03](03-in-app-end-to-end.md), [04](04-portal-live-inbox-refresh.md), [05](05-smtp-retry-fallback.md), [06](06-developer-template-rendering.md), [07](07-delivery-provider-admin.md)

## What to build

Close the operational gaps across the completed vertical slices: reconcile lost work, enforce shutdown deadlines, verify every acceptance path in real transports, and publish generated and authored integration documentation from the approved centralized docs tree.

## Acceptance criteria

- [ ] Reconciler republishes due queued Deliveries and conservatively recovers expired sending leases without duplicate Provider submission.
- [ ] Timers, Dispatcher, Reconciler, NotificationStore, shared Queue Worker, Live Runtime, HTTP streams, and WebSockets honor the shared runtime shutdown order.
- [ ] Repeated Queue Jobs, late Worker results, Queue dispatch failure, Live publish failure, replay gaps, and dependency outages converge to persisted truth.
- [ ] Limits for 1000 targets, 2000 Deliveries, variables, content, pagination, and subscriptions are tested.
- [ ] Runtime Route Schemas generate checked-in OpenAPI, HTTP Markdown, examples, and error tables; CI detects drift.
- [ ] Central `registry/notification/docs/` contains notification, providers, queue-integration, store, config, and portal-live sections with compilable examples.
- [ ] Every temporary boundary is marked with its removal condition; excluded phase-one capabilities remain absent.
- [ ] Unit, Store contract, API, browser, SMTP, AppHost, standalone, WebSocket, and graceful-shutdown suites pass.
