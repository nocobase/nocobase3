# Configuration

Notification activation is code-owned at the App composition boundary.

| Setting | Default | Meaning |
| --- | --- | --- |
| `NOTIFICATION_ENABLED` | `true` | Construct and mount Notification in the configured Runtime. |
| `NOTIFICATION_ALLOW_NON_PERSISTENT_STORE` | `false` | Permit the memory Store for focused development/tests only. |
| `reconcileIntervalMs` | `10000` | Programmatic interval between persisted-work scans. |
| `reconcileBatchSize` | `100` | Maximum due Deliveries dispatched per scan. |

Email providers are declared in fixed order, enabled explicitly, and resolve credentials through injected secret references. Provider list/detail output is redacted; the Admin UI cannot edit provider configuration or read secret values.

Trigger limits are 1,000 targets, 2,000 expanded Deliveries, 64 KiB common template variables, 16 KiB recipient variables, 200 characters for an In-app title, 10,000 for its body, 100,000 for Email text, and 1 MiB for Email HTML. Inbox and Admin page sizes are capped at 100. Portal Live permits at most 32 subscriptions per connection.

Temporary boundaries and removal conditions:

- Admin authorization currently accepts any authenticated Portal user; remove this boundary when `NotificationAuthorizationPolicy` connects role/permission checks.
- Notification is compiled directly into the default App Template; replace this only when the server Registry loader owns lifecycle and dependency injection.
- HTTP Trigger is registered but disabled; enable it only with trusted caller identity, authorization, idempotency, and abuse controls.
- Portal Live uses per-process bounded replay; add cross-instance replay only when a shared stream backend and retention contract are approved.
