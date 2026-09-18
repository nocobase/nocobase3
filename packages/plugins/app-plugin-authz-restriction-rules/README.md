# @nocobase/app-plugin-authz-restriction-rules

Intersects an already granted record range with the records still allowed for selected subjects. The scope is an allow-condition, not a list of records to deny. Multiple matching restrictions narrow access; none can grant an action or widen a range.

## Install

Register the default export from `@nocobase/app-plugin-authz-restriction-rules/client` in `client/plugins.ts` and from `@nocobase/app-plugin-authz-restriction-rules/server` in `server/plugins.ts`. Register the main authorization plugin on both sides and run the application's migrations. Add the rule factory to `server/config/authorization.ts`:

```ts
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';
export default { plugins: [restrictionRules()] };
```

Merge this factory with the application's other authorization factories. `restrictionRules({ store? })` uses the bundled database Store by default; a replacement must implement `RestrictionRuleStore` from `@nocobase/authorization/restriction-rules` with the application's transaction type. The pure library factory requires a Store and does not install UI or HTTP management. If the config factory is absent, this plugin installs no management endpoints.

## Service API

Resolve the main `authorizationToken`. Optional APIs are present only when configured; narrow the service before using one:

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
const saved = await rules.get('public-proposals');
await rules.delete('public-proposals');
```

`create(rule)`, `update(key, rule)` (complete definition), `get(key)`, `list()`, `delete(key)` and `withTransaction(connection)`. A rule contains `{ key, title?, resource, subjects, reason?, actions: [{ action, scopeKey?, scope }] }`. Database scope values use `databaseScope(recordAccess)`; the strategy describes records still allowed.

Builders return immutable declarations and do not save/register anything. Titles accept strings or `{ key, ns }`. Business references infer action/scope keys; the scope registration determines which collection supplies fields and record IDs. Service writes are trusted provisioning APIs: custom HTTP callers must enforce settings authorization and validate resource/action/scope applicability, as this plugin's handlers do. Bound transactions are committed by their caller.

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

See the [development Skill](skills/nocobase-app-plugin-authz-restriction-rules/SKILL.md), [main API](../app-plugin-authorization/README.md), and [user guide](../../../docs/docs/en/capabilities/authorization/restriction-rules.md).
