# @nocobase/app-plugin-notification

Core NocoBase v3 notification runtime. It owns notification persistence,
Channel and Provider registration, queued delivery, retry reconciliation,
protected delivery logs, generic test sending, and the notification settings
page.

## Public entries

- `@nocobase/app-plugin-notification` and `/server` expose the Server plugin,
  public notification contracts, `notificationServiceToken`, and registry
  definitions.
- `@nocobase/app-plugin-notification/client` exposes the Client plugin factory.
- `/client/bootstrap` and `/client/routes` expose the individual Client
  contributions for advanced composition.

Applications should resolve the shared `notificationServiceToken` from their
Server container. Do not construct a second notification manager or call a
Provider directly, because that bypasses persistence, retry, and logs.

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
`page:notification.logs` `access` permission. The separate test API is enabled
only by `notification.test.enabled`, requires the
`notification:test` `send` permission and the
`x-nocobase-notification-test: 1` anti-CSRF header, and exposes only safe
Channel/Provider labels and test-field metadata. Provider deployment
configuration and credentials remain server-only. Keep testing disabled in
production unless a controlled verification explicitly needs a real send.

The core test endpoints are `GET /api/notifications/test/targets`,
`POST /api/notifications/test/send`, and
`GET /api/notifications/test/:id/status`. Status is visible only to the user
who created that test.

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
