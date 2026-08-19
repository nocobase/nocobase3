# Notification module documentation

The notification module is compiled and mounted by the default App Template. Its integration surface and phase-one runtime contract are documented here.

- [Notification model](notification.md): persisted truth, lifecycle, Inbox behavior, and phase-one boundaries.
- [Trigger interface](trigger-interface.md): the internal TypeScript calling surface for other services to create notifications (source / targets / content, validation errors, semantics).
- [Portal Live](portal-live.md): same-origin real-time Inbox refresh channel, wire protocol, server modules, and HTTP upgrade wiring.
- [Email providers](providers.md): Provider Adapter contract, SMTP result semantics, retry/fallback matrix, and secret boundary.
- [Queue integration](queue-integration.md): Job payload, recovery, reconciliation, and shutdown ordering.
- [Store](store.md): Store contract, transaction boundaries, concurrency, and schema compatibility.
- [Configuration](config.md): activation, providers, limits, and temporary integration boundaries.
- [Administration](admin-operations.md): authenticated Delivery Log, read-only Provider console, CSRF, redaction, and manual retry contract.
- [Generated HTTP API](generated/http-api.md) and [OpenAPI](generated/openapi.json): generated from checked runtime route contracts.

HTTP triggering remains disabled until a trusted external identity and authorization policy is available. Internal services use the typed Trigger interface.
