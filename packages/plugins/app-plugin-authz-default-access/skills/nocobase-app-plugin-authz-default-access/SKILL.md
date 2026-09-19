---
name: nocobase-app-plugin-authz-default-access
description: Design, implement and verify default access for NocoBase 3 business operations, including named data scopes and production administration.
---

# Develop default access

Adds a shared record baseline for holders of an already granted business action. It does not grant the action, page access or additional fields. A baseline combines with permission-set scope and sharing, so choose it as an intentional minimum accessible range rather than a fallback used only when no role scope exists.

Read the installed `nocobase-app-plugin-authorization` Skill first for business actions, fields, server policy enforcement and inherited subjects. Check client/server plugin registration and authorization config before relying on this feature. Installation, service signatures and HTTP routes are included below. Use public exports for runtime operations; use the main Skill’s `references/code-and-seeds.md` for controlled installation data.

## Development workflow

1. Identify which records every holder of a particular operation should receive by default. A read baseline can be broad while edit remains preparer-only; do not copy read defaults into write operations.
2. Confirm the resource/action/named scope exists and the scope points to the intended collection. Reuse an applicable record-access strategy or implement one through the main authorization Skill.
3. Save the complete resource rule with `defaultAccess.set`; include all action/scope entries that must remain. Clearing deletes the resource rule, not the permission-set action.
4. Verify a holder receives the baseline, a person without the action remains denied, and restrictions still remove excluded rows. Also verify an explicit narrow role scope is not unexpectedly broadened by a permissive default.

The sales example uses related-project ownership for the quote-view baseline and preparer identity for editing. The engineer set separately grants broad viewing, which confidentiality restrictions narrow. The optional comparison source is `database/seed-data/default-access-rules.ts`; the builder and API below are sufficient without it. A project's owner is not necessarily the author of every quote on that project.

## Install

Register the default export from `@nocobase/app-plugin-authz-default-access/client` in `client/plugins.ts` and from `@nocobase/app-plugin-authz-default-access/server` in `server/plugins.ts`. Register the main authorization plugin on both sides and run the application's migrations. Add the rule factory to `server/config/authorization.ts`:

```ts
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AuthorizationConfig } from '@nocobase/app-plugin-authorization/server';
const authorization: AppConfigFactory<AuthorizationConfig> = defineAppConfig(
  () => ({
    plugins: [defaultAccess()],
  }),
);
export default authorization;
```

Include this config under `authorization` in the App’s existing `defaultAppConfigs({ ... })`. Client plugin entries call the default factory; server entries use the default declaration. Merge this factory with the application's other authorization factories. `defaultAccess({ store? })` uses the bundled database Store by default; a replacement must implement `DefaultAccessStore` from `@nocobase/authorization/default-access` with the application's transaction type. The pure library factory requires a Store and does not install UI or HTTP management. If the config factory is absent, this plugin installs no management endpoints.

## Service API

Resolve `authorizationToken` from `@nocobase/app-plugin-authorization/server` through `app.container.resolve(authorizationToken)` in the owning provider or route factory. Resource `quotes` and the custom `sales.prepared` strategy are defined in the main Skill’s bundled business workflow; import your own declaration module, not example package internals. Optional APIs are present only when configured; narrow the service before using one:

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
    .scope('edit', 'quotes', databaseScope('sales.prepared'))
    .build(),
);
```

`set(rule)` replaces the definition for a resource; `get(resourceType, resourceId)` reads it; `list()` lists definitions; `delete(resourceType, resourceId)` clears it; `withTransaction(connection)` binds to a caller-owned transaction. A definition is `{ resource, actions: [{ action, scopeKey?, scope }] }`.

Builders return immutable declarations and do not save/register anything. Business references infer action/scope keys; the scope registration determines which collection supplies fields and record IDs. Service writes are trusted provisioning APIs: custom HTTP callers must enforce settings authorization and validate resource/action/scope applicability, as this plugin's handlers do. Bound transactions are committed by their caller.

## Installation seeds

Use this initialization only after confirming this plugin is installed, registered and configured, and its migrations have run. Read the main authorization Skill’s `references/code-and-seeds.md` for `defineSeed`, the restricted seed database context and the code/configuration boundary. These are initial business configurations, still editable in the backend; do not protect or overwrite them merely because they came from a seed. Runtime routes use the service API, not direct table writes.

Build the rule with this Skill's fluent builder in a portable seed-data module. Persist JSON values, never resolver functions. Use a transactional seed, test logical uniqueness before insertion and preserve existing administrator configuration. Do not import live declarations into a migration.

| Table                             | Fields in addition to `id`                                             |
| --------------------------------- | ---------------------------------------------------------------------- |
| `authorizationDefaultAccessRules` | `resourceType`, `resourceId`, JSON `actions`, `createdAt`, `updatedAt` |

Map `rule.resource.type/id` to `resourceType/resourceId` and encode `actions` with `JSON.stringify(rule.actions)`. Use a unique stable row ID. Check the resource type/ID pair before insertion and preserve an existing rule. Default access has no subject assignment table: it supplies a baseline for holders of that resource's action. Do not create sharing/restriction assignment rows for it.

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

## Administration and acceptance

Use the existing settings page and its subject/scope pickers for ordinary configuration. New management surfaces must check `settings/authorization.default-access` with the action required by the HTTP API; reading options never grants write access. Validate the resource/action/scope combination, scalar filters and selected subjects on the server. Direct service calls do not replace those checks.

Run the owning feature's route/policy tests for allowed and denied records, multiple grants, and rule removal. Verify changes with a new request scope and inspect the same operation in Settings → Authorization → Inspector. A successful frontend snapshot is not proof that a row operation is allowed. Report the actual scope and subjects changed, with observed allow/deny outcomes.
