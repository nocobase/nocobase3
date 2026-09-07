# Operation audit

Business owners connect an existing `AuditResourceAdapter` to production queries
through `auditResourceAdaptersToken` from `@nocobase/app-plugin-audit/server` or
`server/tokens`. The `AuditResourceAdapters` interface is exported from `server`
and `server/contracts`. Register during the owner's Provider `boot()` and call
the returned idempotent disposer in `shutdown()`; place the owner after Audit.
See the [owner example](skills/nocobase-app-plugin-audit/examples/resource-adapter.ts)
and [lifecycle and permissions](skills/nocobase-app-plugin-audit/references/workflows.md).

Each App owns its registry. Duplicate `(dataSource, resource)` keys throw; missing
or revoked adapters deny object reads, including revocation during awaited checks.
Normal Application shutdown drains accepted requests before owner/Audit disposal.
Registration does not grant permissions or relax scope and per-event ACL checks.
Object readers need Audit `read` and business access; `readAll` and `readDeleted`
retain their separate meanings.

Pagination cursors contain a versioned position and a fingerprint of the principal,
App, security scope, store, and filters. They survive instance replacement and
restart without shared signing secrets. They are not authorization credentials:
each HTTP request obtains current permissions and each candidate is authorized
before inclusion. Changing a position cannot broaden the server's SQL scope or
resource access. Candidates are read in batches of at most 100; continuation starts
after the last consumed candidate, leaving the readable lookahead for the next page.

This package provides explicit business recording on Node with SQLite
(`better-sqlite3`), PostgreSQL (`pg`), and MySQL (`mysql2`). It exports the original `auditServiceToken`, a server plugin
declaration with storage migrations, `bindAuditRecorder`, `PortableAuditStore`,
the backward-compatible `SqliteAuditStore` constructor,
and `DisabledAuditRecorder`. Registering the server and client plugins installs
the App-local audit service, collectors, authenticated API routes, and default
Settings pages. No Registry component installation is required.

Run the application's normal migration lifecycle before preparing storage. The
plugin declares `./server/database/migrations`; the existing plugin loader resolves
that path in a source checkout or under `dist` in a published package. Recording
never creates tables. Missing migrations produce `AUDIT_NOT_READY`.

A trusted server integration can create a store and bind a recorder:

```ts
import {
  PortableAuditStore,
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';

const store = new PortableAuditStore(connection, {
  appId: trustedScope.appId,
  securityScope: trustedScope.securityScope,
  store: connection.name,
});
await store.prepare();
const recorder = bindAuditRecorder(trustedScope, {
  producer: 'orders-runtime',
  store,
  policy: readCurrentRecorderPolicy,
});
await recorder.record({ action: 'orders.approve', outcome: 'success' });
```

`readCurrentRecorderPolicy` is supplied by trusted application composition. Its
snapshot contains `revision`, `enabled`, `maxDetailsBytes`, and optional
`excluded`. The Settings service supplies versioned capture configuration, which
trusted host composition connects to the recorder. Do not construct
trusted scope or producer identifiers from arbitrary browser input.

Independent writes return `committed` after the database transaction completes.
Pass an active handle issued by `transactionAuthority` from `@nocobase/db` to
join its exact connection and receive `pending-commit`. The store verifies
manager, connection, App, security scope, and store binding. Write failures mark
active transaction chains rollback-only even when callers catch the error.
Persistent idempotency covers App, security scope, producer, actual store, and key;
different payloads for one key fail with `AUDIT_IDEMPOTENCY_CONFLICT`.

The Store's scoped query and bounded deletion methods are internal persistence
operations, not browser authorization APIs. There is no HTTP create/update/delete
route for events. Disabling recording and deleting users or business records do
not purge evidence. Payload cleaning removes sensitive keys but does not promise
free-text PII detection.

The package includes HTTP and managed database write collectors, trusted identity
scopes, versioned Settings, authorized event queries, bounded retention and drain
lifecycle services, and event/settings/health client components. Host composition
must explicitly bind services, authorize stores and register client/server
contributions. Importing a token or registering migrations alone does not enable
these capabilities. Use
`./server/contracts` for server contracts, `./client/contracts` for browser DTO
types, and `./server/tokens` for the original token.

Run `pnpm --filter @nocobase/app-plugin-audit check` from the workspace root.
Tests use dedicated temporary SQLite databases. The required three-database suite
is `pnpm --filter @nocobase/app-plugin-audit test:integration:all`. It requires
explicit local POSTGRES_HOST/PORT/USER and MYSQL_HOST/PORT/USER values (and
PASSWORD when configured); missing or unavailable targets fail the run. Tests
create and drop only their own randomly named databases.

Provision the migration separately on every protected data source through the
normal migrator with its explicit connection name. Call `prepare()` on each
store after provisioning. A central observation store does not make another
source ready or participate in its transaction. A recorder bound to A rejects a
handle from B; select the trusted local recorder explicitly. `event.store` is
the persistence source, while `target.dataSource` remains the business source.

Indexed identities use fixed-length SHA-256 values while complete source values
remain stored and are checked on reads. JSON is text, UTC timestamps are ISO
strings, and MySQL uses long text for bounded payloads. No D1, libSQL, Worker,
trigger-based collection, or cross-database atomicity is implied.

## Official producer integration

The HTTP collector discovers declarations in the assembled host router; its
catalog distinguishes configured, registered and observed capabilities. A route
listed in the catalog is not proof of delivery, DDL completion or atomic business
commit. Trusted host composition must bind the producer bridges before creating
routes and install the existing authentication scope adapter.

| Owner                       | Public bridge                                         | Declared operations                                                              |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Installation                | @nocobase/app-plugin-install/server/audit             | install.configure; business attempted/completed/failed configuration-file phases |
| Locale preference           | @nocobase/app-plugin-i18n/server/audit                | i18n.locale.change                                                               |
| Notification administration | @nocobase/app-plugin-notification/server/audit        | notification.logs.list/get, notification.test.targets/send/status                |
| In-app inbox                | @nocobase/app-plugin-notification-in-app/server/audit | notification.inbox.list/count/readAll/update                                     |

These optional contracts do not import or require the audit package. In-app
identity comes only from the original verified authentication session. Its legacy
session fallback retains access behavior but records an anonymous audit actor.
Public locale preferences do not establish authenticated identity.

Notification test submission returns a request event with outcome accepted for
HTTP 202; it does not assert final recipient delivery. Inbox update declares the
request operation without reading message content or extracting arbitrary body
fields. System information, install status, locale inventory and CSRF token
issuance remain outside declared capture by default.

Configuration-file installation requires a committed attempt only when the bound
bridge declares `required: true`; an optional observer cannot block installation.
The bridge records completion or failure separately. Completion observation
failure cannot undo the file write and does not change its successful response.
Before audit storage exists, an unbound installation bridge cannot save an App
audit event. Filesystem/package-manager CLI commands and standalone migration
commands have no application audit runtime and do not claim persistence.

Automatic migrations and seeds in `DatabaseProvider.boot` expose the neutral
`databaseLifecycleObserverToken` from `@nocobase/app-server/database`. Its awaited
`before` hook may reject required operations before execution; `after` reports
success, failure or an unknown skipped result without replacing the original
task outcome. Hosts resolve audit storage lazily to avoid bootstrap cycles.
Before storage exists, hosts must choose explicit unobserved bootstrap or required
rejection, and must never claim that an event was saved.

## Agent and Job observations

The AI employee plugin exports an optional `./server/audit` bridge. Trusted host
composition binds its HTTP collector and runtime scope adapter. Authenticated
request context is captured before the SSE response outlives the request scope;
private owner bindings attribute modern and legacy Agent runs and tool attempts.
Client-provided actor fields never establish trusted identity. Waiting for human
approval records acceptance separately from a later completed run. A handled
child failure does not change the successful parent outcome.

Runtime observations contain bounded safe metadata, not prompts, tool arguments
or tool results. Observer failure preserves the actual business result and does
not replay side effects. These observations are not atomic with external effects
and do not promise delivery after process termination.

Custom Jobs can restore identity through a trusted host verifier and record
attempts with idempotency keys. This requires explicit integration; arbitrary Jobs
are not automatically instrumented. Workflow and file-operation plugins expose
their own optional bridges, which the host binds during application startup.

## Application composition

Both application templates register Audit before producer plugins, so Audit binds
installed producer bridges during boot and releases them after producers drain.
The App host closes HTTP admission synchronously and drains accepted dispatches,
including finalizers, before provider shutdown. This does not drain arbitrary
stream response bodies. AI auditing separately drains active bound runs and
consumed streams through completion or cancellation; unconsumed streams hold no
lease. Workflow retains its existing worker and dispatcher shutdown contract.

The public server entry exports `auditConfig`. Deployment configuration selects
`stores` and `configurationStore` (both default to `main`), `auditRequired`,
`mandatorySources`, and `requiredDataSources`. Defaults initialize persistent
settings once and never overwrite an existing revision. Declared HTTP routes and
integrated runtime producers are enabled initially. Business database tables are
not selected automatically; collection settings lists discovered targets and
requires explicit selection. Registered coverage does not imply observed
business activity.

Missing Audit storage blocks required automatic migration admission. An optional
first bootstrap explicitly reports the unobserved phase until normal migrations
create storage; it never fabricates earlier events. Existing storage allows the
App migration and seed lifecycle to record attempts and outcomes. Independent CLI
migration commands without an App audit scope remain outside this integration.
Readiness uses a private startup-only host probe that runs observer dispatch and
finalization without entering business routes. It proves that boundary, not every
producer's business path. Required policy and collector readiness are checked
before ordinary request admission.

The read-only authenticated `audit/capabilities` endpoint exposes permission
booleans and only accessible store names. Client access resolvers use the existing
App API client, including its deployment base path. Audit page access requires
Audit permissions; a generic page grant alone is insufficient. Settings editing
still requires server-side manage permission, and partial store access cannot
replace a complete policy. Capability responses are not cached across identities.

Retention dispatches bounded cleanup through the existing Queue at application
readiness and every day at 00:00 UTC through an App-owned Cron manager. Each tick
reads the latest persistent policy; disabled capture and null retention do not
delete events. Shutdown cancels future ticks and drains admitted dispatches before
releasing queue bindings. Only actually registered official producer bridges are
bound. File inventory HTTP declarations use the authentication bridge; custom
file business routes must explicitly supply their audit adapter.

## Add auditing to business code

Start with [the integration Skill](skills/nocobase-app-plugin-audit/SKILL.md).
Its executable examples cover declared HTTP observations, trusted runtime
recording and explicit table selection through the persistent Settings API.
App-specific features stay in the App; reusable plugin features use the same
public contracts. The Skill documents actual permissions, receipts and limits.

For editable client presentation, materialize the optional events-panel Registry
item and import its AuditEventsPanel into an App-owned page. It wraps the public
AuditEventsView; all event loading and server authorization remain plugin runtime.
Default Audit Settings never require this recipe. See the Skill's Registry
reference for build, materialize, ownership and upgrade instructions.
