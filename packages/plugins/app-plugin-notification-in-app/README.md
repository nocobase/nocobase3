# @nocobase/app-plugin-notification-in-app

Server-side in-app notification Channel for the NocoBase v3 notification
runtime. It stores one inbox item per Delivery and exposes an authenticated,
user-isolated inbox API.

## Public entries and registration

The package exports its Server plugin and public Server contracts from both the
package root and `/server`. Register it in the target App's Server plugin list
after `@nocobase/app-plugin-notification` when durable notification delivery is
needed. It has no Client runtime entry. The package keeps
`@nocobase/app-plugin-notification` as a peer because it imports the shared
notification contracts. Registering the core Server plugin is optional: the
inbox store and routes require only the database and authentication services,
so they remain available when that Server plugin is not registered. Only the
Channel and Provider contribution is skipped in that case.

The plugin registers:

- the `in-app` Channel and database Provider;
- a test adapter whose optional recipient defaults to the authenticated user;
- the `notificationInAppItems` migration;
- authenticated inbox routes under `/api/notifications/in-app`.

## Inbox API

`GET /api/notifications/in-app` accepts:

- `limit`: an integer from 1 to 100, defaulting to 25;
- `unreadOnly=true`: restricts the result to unread items;
- `cursor`: the opaque `nextCursor` returned by the previous page.

Pages use a stable `(createdAt, id)` cursor. Clients must treat cursors as
opaque and must not construct or persist internal table queries.

`GET /unread-count` returns the current user's unread count. Mutations use
`POST /:id` with `read`, `unread`, or `delete`, and `POST /read-all`. Every
write requires the CSRF token and cookie obtained from `GET /csrf`.

Every operation resolves the authenticated user and constrains reads and
writes to that user. Invalid pagination, cursor, JSON, or mutation input returns
`400`; unauthenticated requests return `401`; invalid CSRF returns `403`.

## Registry UI

The `in-app-ui` Registry item materializes an editable inbox page into the
target App. It is App-owned Client source, not a Client contribution from this
package. The target App owns the installed copy, its locale keys and wording,
and any source extension that mounts it. The package continues to own the API,
storage, authentication, CSRF, and user-isolation boundaries.

## Development

Tests live in `tests/` and include route validation, stable pagination, Provider
behavior, Registry contracts, and real SQLite migration `up`/`down` coverage.

```bash
pnpm --filter @nocobase/app-plugin-notification-in-app lint
pnpm --filter @nocobase/app-plugin-notification-in-app typecheck
pnpm --filter @nocobase/app-plugin-notification-in-app test
pnpm --filter @nocobase/app-plugin-notification-in-app registry:build
pnpm --filter @nocobase/app-plugin-notification-in-app build
```
