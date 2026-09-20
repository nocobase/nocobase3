# @nocobase/app-plugin-notification

Core NocoBase v3 notification runtime. It owns notification persistence,
Channel and Provider registration, queued delivery, retry reconciliation,
protected delivery logs, generic test sending, and the notification settings
page.

## Public entries

- `@nocobase/app-plugin-notification` and `/server` expose the Server plugin,
  public notification contracts, the narrow `notificationServiceToken` for
  sending, `notificationExtensionRegistryToken` for Channel/Provider
  contributions, and registry definitions.
- `@nocobase/app-plugin-notification/client` exposes the Client plugin factory.
- `/client/bootstrap` and `/client/routes` expose the individual Client
  contributions for advanced composition.

Applications should resolve the shared `notificationServiceToken` from their
Server container. Do not construct a second notification manager or call a
Provider directly, because that bypasses persistence, retry, and logs.
Extension plugins resolve `notificationExtensionRegistryToken` instead; the
manager lifecycle and test-route surface are internal to the core plugin.

Every public `send()` requires a stable caller-owned `idempotencyKey`. Reusing
the key with equivalent input returns the original Notification; reusing it
with different input is rejected. Consumers can query current state with
`getByIdempotencyKey()` or `getNotification()`, use `onStatusChanged()` as a
non-blocking process-local convenience, and call `retryDelivery()` for terminal
failures or unknown submissions. Every manual retry requires a reason. Provider
capabilities determine whether an unknown retry is internally audited as safely
idempotent or as accepting possible duplication.

## Runtime requirements

Register both the Client and Server entries in the target App. The Server
runtime requires a database, queue, authentication, and authorization. Channel
implementations are supplied by separate packages such as
`@nocobase/app-plugin-notification-in-app` and
`@nocobase/app-plugin-notification-providers`.

The Server plugin runs the explicit migrations in `database/migrations`.
Migrations create the Notification, Delivery, and Attempt collections; they
must be applied through the normal App lifecycle.

## Configuration and security

The App owns its `notification.channels` configuration and secret sources.
Provider names are persisted with pending Deliveries and therefore must remain
stable while work is outstanding. Credentials, recipient snapshots, message
bodies, and lease tokens must not be written to logs.

The notification log API requires authentication and the
`page:notification.logs` `access` permission. The separate test API requires
the `x-nocobase-notification-test: 1` anti-CSRF header and exposes only safe
Channel/Provider labels and test-field metadata. The
`notification:test` `send` permission is checked only when a test message is
submitted. Provider deployment configuration and credentials remain
server-only.

The core test endpoints are `GET /api/notifications/test/targets`,
`POST /api/notifications/test/send`, and
`GET /api/notifications/test/:id/status`. Status is visible only to the user
who created that test. The settings-page button remains visible when no
Provider is enabled or target loading fails, so the dialog can explain the
problem instead of hiding the entry point.

## Client UI and Registry

The runtime Client plugin contributes the protected notification-log settings
page and its `en-US` and `zh-CN` locale resources. The `logs-ui` Registry item
is an optional App-owned editable alternative. Its canonical recipe lives in
this package; after materialization, the copy under the target App's
`client/extensions` directory and its wording belong to that App.

Build or materialize the Registry item with the package scripts, then validate
the resulting target App. Registry source is not a Server capability and does
not replace route authentication or authorization.

## Development

Tests live in `tests/`. Validate changes with:

```bash
pnpm --filter @nocobase/app-plugin-notification lint
pnpm --filter @nocobase/app-plugin-notification typecheck
pnpm --filter @nocobase/app-plugin-notification test
pnpm --filter @nocobase/app-plugin-notification registry:build
pnpm --filter @nocobase/app-plugin-notification build
```

The package-owned Agent Skill is under
`skills/nocobase-app-plugin-notification`. Keep it synchronized with changes to
public integration, sending, logs, retry, Channel, or Provider contracts.

## Named Channel instances

Every Channel configuration requires a non-empty `name` of at most 100 characters without surrounding whitespace, unique across enabled and disabled configurations. `type` selects the registered implementation; `name` selects the configured instance. Two email instances can use the same Provider name independently. Send using `channels: ['system-email']`, with `routing['system-email']` and `channelOverrides['system-email']`. Test sending also selects the Channel name.

The Channel helpers preserve literal names. `createNotificationManager` infers configured names and maps their types through the extensible `NotificationChannelSchemas` interface to check message overrides. Custom Channel packages should augment that interface with their recipient and message schema. The runtime still validates configuration and recipients independently of TypeScript.

Run migrations before upgrading. Existing delivery records are migrated from `channel` to `channelName` and `channelType`, initially both holding the old type. Set existing configuration names to their previous types to retain pending delivery and retry lookup. Renaming or removing an instance makes its historical deliveries unavailable for retry; changing its type is rejected. There is no type-based fallback. Rolling back the schema preserves the implementation type but discards custom instance names, so drain named deliveries before downgrade.
