---
name: nocobase-app-plugin-authz-restriction-rules
description: Design, implement and verify restriction rules for NocoBase 3 business operations, including named data scopes and production administration.
---

# Develop restriction rules

Intersects an already granted record range with the records still allowed for selected subjects. The scope is an allow-condition, not a list of records to deny. Multiple matching restrictions narrow access; none can grant an action or widen a range.

Read the installed `nocobase-app-plugin-authorization` Skill first for business actions, fields, server policy enforcement and inherited subjects. Check client/server plugin registration and authorization config before relying on this feature. Installation, service signatures and HTTP routes are included below. Use public exports for runtime operations; use the main Skill’s `references/code-and-seeds.md` for controlled installation data.

## Development workflow

1. State the invariant positively: for example, this team may access only non-confidential projects. Define who it applies to and whether it covers one operation or every route to a collection.
2. Use a business resource/action/scope rule for an operation-specific limit. For a limit across business branches and direct table grants, create an underlying `database.collection` rule with the collection's CRUD actions. The business settings picker shows declared business scopes; collection-wide invariants can be provisioned through the service API.
3. Register a suitable strategy and save the complete rule. Apply the restriction directly to a user as well when it must remain after that person's team membership is removed.
4. Bind policies on all protected reads/writes. For relation targets, explicitly declare relation record access; standalone target collection restrictions are not inherited automatically by nested relation writes.
5. Verify the excluded row remains inaccessible after adding broad sharing and another permission set, and across each protected operation. Verify unrelated actors retain their intended access.

Use the included rule API and the main Skill’s bundled public-record resolver; the example source is optional for comparison. The coordinator's direct confidentiality restriction persists when its team role is removed. Test with ordinary users: unrestricted administrators bypass rule constraints.

## Install

Register the default export from `@nocobase/app-plugin-authz-restriction-rules/client` in `client/plugins.ts` and from `@nocobase/app-plugin-authz-restriction-rules/server` in `server/plugins.ts`. Register the main authorization plugin on both sides and run the application's migrations. Add the rule factory to `server/config/authorization.ts`:

```ts
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';
import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AuthorizationConfig } from '@nocobase/app-plugin-authorization/server';
const authorization: AppConfigFactory<AuthorizationConfig> = defineAppConfig(
  () => ({
    plugins: [restrictionRules()],
  }),
);
export default authorization;
```

Include this config under `authorization` in the App’s existing `defaultAppConfigs({ ... })`. Client plugin entries call the default factory; server entries use the default declaration. Merge this factory with the application's other authorization factories. `restrictionRules({ store? })` uses the bundled database Store by default; a replacement must implement `RestrictionRuleStore` from `@nocobase/authorization/restriction-rules` with the application's transaction type. The pure library factory requires a Store and does not install UI or HTTP management. If the config factory is absent, this plugin installs no management endpoints.

## Service API

Resolve `authorizationToken` from `@nocobase/app-plugin-authorization/server` through `app.container.resolve(authorizationToken)` in the owning provider or route factory. Resource `quotes` and the custom `sales.public` strategy are defined in the main Skill’s bundled business workflow; import your own declaration module, not example package internals. Optional APIs are present only when configured; narrow the service before using one:

```ts
import type { RestrictionRulesAuthorizationApi } from '@nocobase/authorization/restriction-rules';
import type { DatabaseConnection } from '@nocobase/db';
import { restrictionRule } from '@nocobase/authorization/restriction-rules';
import { databaseScope } from '@nocobase/app-plugin-authorization';

if (!('restrictionRules' in authz))
  throw new Error('Restriction rules is not configured');
const rules = (
  authz as typeof authz & RestrictionRulesAuthorizationApi<DatabaseConnection>
).restrictionRules;
// quotes is a declared resource; sales.* strategies and team subjects are registered by its owner.
await rules.create(
  restrictionRule('public-proposals', quotes.reference())
    .title('Exclude confidential proposals')
    .subjects({ type: 'sales.team', id: 'proposal' })
    .scope('submit', 'quotes', databaseScope('sales.public'))
    .reason('Proposal collaboration excludes confidential work')
    .build(),
);
```

`create(rule)`, `update(key, rule)` (complete definition), `get(key)`, `list()`, `delete(key)` and `withTransaction(connection)`. A rule contains `{ key, title?, resource, subjects, reason?, actions: [{ action, scopeKey?, scope }] }`. Database scope values use `databaseScope(recordAccess)`; the strategy describes records still allowed.

Builders return immutable declarations and do not save/register anything. Titles accept strings or `{ key, ns }`. Business references infer action/scope keys; the scope registration determines which collection supplies fields and record IDs. Service writes are trusted provisioning APIs: custom HTTP callers must enforce settings authorization and validate resource/action/scope applicability, as this plugin's handlers do. Bound transactions are committed by their caller.

## Installation seeds

Use this initialization only after confirming this plugin is installed, registered and configured, and its migrations have run. Read the main authorization Skill’s `references/code-and-seeds.md` for `defineSeed`, the restricted seed database context and the code/configuration boundary. These are initial business configurations, still editable in the backend; do not protect or overwrite them merely because they came from a seed. Runtime routes use the service API, not direct table writes.

Build the rule with this Skill's fluent builder in a portable seed-data module. Persist JSON values, never resolver functions. Use a transactional seed, test logical uniqueness before insertion and preserve existing administrator configuration. Do not import live declarations into a migration.

| Table                                     | Fields in addition to `id`                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `authorizationRestrictionRules`           | `key`, encoded `title`, `resourceType`, `resourceId`, JSON `actions`, nullable `reason`, `createdAt`, `updatedAt` |
| `authorizationRestrictionRuleAssignments` | `restrictionRuleId`, `subjectType`, `subjectId`, `createdAt`                                                      |

Use `encodeAuthorizationTitle` from `@nocobase/authorization/core` for `title` and `JSON.stringify(rule.actions)` for `actions`. Map `rule.resource.type/id` to `resourceType/resourceId`. `restrictionRuleId` references the persisted rule row ID, not necessarily its key. A fresh seed may choose `id: rule.key`; when reusing an existing row, use its actual ID.

Builder `.subjects(...)` values become separate assignment rows, not action JSON. Create intended principals/teams before these assignments. Check the rule key and each rule-ID/subject pair for logical uniqueness. Insert the rule and initial assignments in one transaction; do not reapply removed recipients at boot or on arbitrary retries. Preserve an existing rule and its assignments unless an explicit upgrade intends to change them.

Each action stores its allowed `scope`, not records to deny. Keep action/scope keys consistent with the registered business resource; collection-wide rules use the underlying collection and CRUD actions.

## Management HTTP API

Paths are relative to the application's `/api` prefix. Requests require authentication and `{ resource: { type: 'settings', id: 'authorization.restriction-rules' }, action }`. Write bodies are complete rule definitions matching the service model.

| Method | Path                            | Action   |
| ------ | ------------------------------- | -------- |
| GET    | `/authz/restriction-rules`      | `read`   |
| POST   | `/authz/restriction-rules`      | `create` |
| PUT    | `/authz/restriction-rules/:key` | `update` |
| DELETE | `/authz/restriction-rules/:key` | `delete` |

`GET /authz/restriction-rules/options` and record/subject selection subroutes require `read`; subject selectors additionally enforce any independent directory restrictions. List/write responses wrap results in `{ data }`; deletes return 204. POST creation returns 201. There is no single-rule GET endpoint; use the list or server service. The settings page is `/settings/authorization/restriction-rules`, under the authorization group.

## Scope boundaries

Business rules target `{ type: 'resource', id: businessResourceName }` and an `action` plus `scopeKey`. They affect only the matching business grant branch. Underlying collection rules target `database.collection` with CRUD actions; collection restrictions apply across branches. Neither form shares related records implicitly or replaces field/relation capabilities. Unrestricted identities bypass rule constraints.

## Administration and acceptance

Use the existing settings page and its subject/scope pickers for ordinary configuration. New management surfaces must check `settings/authorization.restriction-rules` with the action required by the HTTP API; reading options never grants write access. Validate the resource/action/scope combination, scalar filters and selected subjects on the server. Direct service calls do not replace those checks.

Run the owning feature's route/policy tests for allowed and denied records, multiple grants, and rule removal. Verify changes with a new request scope and inspect the same operation in Settings → Authorization → Inspector. A successful frontend snapshot is not proof that a row operation is allowed. Report the actual scope and subjects changed, with observed allow/deny outcomes.
