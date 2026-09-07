# Ownership workflows

## App-owned business

Keep routes in App server/routes, services in App server/providers, and schema in
App database/migrations. Add the HTTP example to the existing route array. Bind
runtime recorders at the trusted host boundary and inject them into the App's
service. Select the migrated physical table through Audit Settings. Use the App's
normal migrate/dev/build commands and issue the real business request. No new npm
package is required for an App-specific feature. Default and Hub both register
Audit; a generated or customized App should verify its explicit client/plugins.ts
and server/plugins.ts and normal migration lifecycle.

## Reusable plugin

Keep the same business implementation in its owning plugin. Its server route
contribution resolves auditServiceToken from @nocobase/app-plugin-audit/server.
Declare @nocobase/app-plugin-audit as peerDependency plus devDependency (workspace
protocols in a source workspace), and runtime dependencies by their actual use.
The consuming App registers Audit before the producer and prepares storage through
normal migrations. Keep domain migrations self-contained. The consuming App
chooses tables/policy and trusted identity; a reusable plugin must not override
its administrator's Settings. Expose the producer's own service contract and pass
an AuditRecorder into domain code. Verify the real route, recorder event and table
summary in the consuming App, not only the plugin's declaration.

Skills belong in the Audit package's skills/nocobase-app-plugin-audit. Normal
plugin registration synchronizes them. From an existing App use
pnpm plugin:skills:sync --plugin @nocobase/app-plugin-audit when needed. Its
.agents/skills output is generated; update canonical source instead.

## Querying business objects

Register the existing `AuditResourceAdapter` through `auditResourceAdaptersToken`
during owner Provider `boot()` and call the returned disposer during `shutdown()`.
See the [resource adapter example](../examples/resource-adapter.ts). The database
adapter applies normal collection authorization and the owner's trusted boundary
filter. Register identifiers, owner attributes and business grants with
Authorization as usual. Registration itself grants no permissions.

Place Audit before the owner in server composition. All provider register phases
finish before boot; all boot phases finish before route creation. Resolve the token
in boot after database preparation. Use production `/api/audit/events`, event detail
and operation endpoints with `store` and a JSON-encoded `target` containing
`dataSource`, `resource`, and `key`. Object readers need Audit `read` plus business
access. Do not rebuild Store/Query, read internal tables, or use `readAll` as an
integration workaround.

Carry the same `store` and `target` from an object's list into detail and operation
requests. Metadata permission does not replace an object's scope. In the client,
verify list selection and detail opening through the normal login and business
page as an object reader, then verify that a different object's scope is denied.
Use normal development access information supplied for the App; if an account or
business grant is missing, report it rather than searching outside the App for
credentials or changing the reader into a global administrator.

Each App has its own registry. Duplicate `(dataSource, resource)` keys throw, even
for the same adapter. The disposer is idempotent and cannot remove a later
registration. New registrations affect existing routes. Missing adapters deny
object reads. Unregistering or replacing an adapter during an awaited check
invalidates its result. Every returned event is checked again. Deleted objects
retain the separate `readDeleted` requirement and still need an adapter.

Application shutdown drains admitted HTTP requests before reversing provider
shutdown, so owner disposal does not interrupt normal drain. Audit closes and
clears the registry when its provider begins disposal; subsequent registration
throws. Explicit disposal during normal operation revokes immediately. Owners
retain responsibility for callback resources and database connections.
