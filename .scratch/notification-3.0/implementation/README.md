# Notification 3.0 implementation slices

The approved phase-one specification is implemented through the following dependency-ordered tracer bullets. All slices are AFK and may proceed automatically when their blockers are complete.

1. [Mount the notification module with an owned lifecycle](01-module-shell-mount-lifecycle.md)
2. [Persist the notification domain through NotificationStore](02-notification-store-schema-contract.md)
3. [Deliver an in-app notification end to end](03-in-app-end-to-end.md)
4. [Refresh the Inbox through Portal Live](04-portal-live-inbox-refresh.md)
5. [Deliver email through SMTP with retry and fallback](05-smtp-retry-fallback.md)
6. [Render developer templates per recipient](06-developer-template-rendering.md)
7. [Operate deliveries and providers from the admin console](07-delivery-provider-admin.md)
8. [Harden, document, and accept the phase-one module](08-reliability-docs-acceptance.md)

Source specification: [Wayfinder map](../map.md).
