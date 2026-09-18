# @nocobase/app-plugin-authz-default-access

Adds a shared record baseline for holders of an already granted business action. It does not grant the action, page access or additional fields. A baseline combines with permission-set scope and sharing, so choose it as an intentional minimum accessible range rather than a fallback used only when no role scope exists.

## Install

Register the default export from `@nocobase/app-plugin-authz-default-access/client` in `client/plugins.ts` and from `@nocobase/app-plugin-authz-default-access/server` in `server/plugins.ts`. Register the main authorization plugin on both sides and run the application's migrations. Add the rule factory to `server/config/authorization.ts`:

```ts
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
export default { plugins: [defaultAccess()] };
```

Merge this factory with the application's other authorization factories. `defaultAccess({ store? })` uses the bundled database Store by default; a replacement must implement `DefaultAccessStore` from `@nocobase/authorization/default-access` with the application's transaction type. The pure library factory requires a Store and does not install UI or HTTP management. If the config factory is absent, this plugin installs no management endpoints.

## Service API

Resolve the main `authorizationToken`. Optional APIs are present only when configured; narrow the service before using one:

```ts
import type { DefaultAccessAuthorizationApi } from '@nocobase/authorization/default-access';
import type { DatabaseConnection } from '@nocobase/db';
import { defaultAccessRule } from '@nocobase/authorization/default-access';
import { databaseScope } from '@nocobase/app-plugin-authorization';

if (!('defaultAccess' in authz))
  throw new Error('Default access is not configured');
const rules = (
  authz as typeof authz & DefaultAccessAuthorizationApi<DatabaseConnection>
).defaultAccess;
// quotes is a declared resource; sales.* strategies and team subjects are registered by its owner.
await rules.set(
  defaultAccessRule(quotes.reference())
    .scope('view', 'quotes', databaseScope('sales.public'))
    .build(),
);
const saved = await rules.get('resource', 'sales.quotes');
await rules.delete('resource', 'sales.quotes');
```

`set(rule)` replaces the definition for a resource; `get(resourceType, resourceId)` reads it; `list()` lists definitions; `delete(resourceType, resourceId)` clears it; `withTransaction(connection)` binds to a caller-owned transaction. A definition is `{ resource, actions: [{ action, scopeKey?, scope }] }`.

Builders return immutable declarations and do not save/register anything. Business references infer action/scope keys; the scope registration determines which collection supplies fields and record IDs. Service writes are trusted provisioning APIs: custom HTTP callers must enforce settings authorization and validate resource/action/scope applicability, as this plugin's handlers do. Bound transactions are committed by their caller.

## Management HTTP API

Paths are relative to the application's `/api` prefix. Requests require authentication and `{ resource: { type: 'settings', id: 'authorization.default-access' }, action }`. Write bodies are complete rule definitions matching the service model.

| Method | Path                              | Action      |
| ------ | --------------------------------- | ----------- |
| GET    | `/authz/default-access`           | `read`      |
| PUT    | `/authz/default-access`           | `configure` |
| DELETE | `/authz/default-access/:type/:id` | `configure` |

`GET /authz/default-access/options` and record/subject selection subroutes require `read`; subject selectors additionally enforce any independent directory restrictions. List/write responses wrap results in `{ data }`; deletes return 204. There is no single-rule GET endpoint; use the list or server service. The settings page is `/settings/authorization/default-access`, under the authorization group.

## Scope boundaries

Business rules target `{ type: 'resource', id: businessResourceName }` and an `action` plus `scopeKey`. They affect only the matching business grant branch. Underlying collection rules target `database.collection` with CRUD actions; collection restrictions apply across branches. Neither form shares related records implicitly or replaces field/relation capabilities. Unrestricted identities bypass rule constraints.

See the [development Skill](skills/nocobase-app-plugin-authz-default-access/SKILL.md), [main API](../app-plugin-authorization/README.md), and [user guide](../../../docs/docs/en/capabilities/authorization/default-access.md).
