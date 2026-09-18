# @nocobase/app-plugin-authz-sharing-rules

Adds selected records or a dynamic record scope for selected subjects who already hold the action. Sharing does not grant the operation, fields, page access or related records. Permission-set/default/shared scopes combine before restrictions narrow them.

## Install

Register the default export from `@nocobase/app-plugin-authz-sharing-rules/client` in `client/plugins.ts` and from `@nocobase/app-plugin-authz-sharing-rules/server` in `server/plugins.ts`. Register the main authorization plugin on both sides and run the application's migrations. Add the rule factory to `server/config/authorization.ts`:

```ts
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
export default { plugins: [sharingRules()] };
```

Merge this factory with the application's other authorization factories. `sharingRules({ store? })` uses the bundled database Store by default; a replacement must implement `SharingRuleStore` from `@nocobase/authorization/sharing-rules` with the application's transaction type. The pure library factory requires a Store and does not install UI or HTTP management. If the config factory is absent, this plugin installs no management endpoints.

## Service API

Resolve the main `authorizationToken`. Optional APIs are present only when configured; narrow the service before using one:

```ts
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import type { DatabaseConnection } from '@nocobase/db';
import { sharingRule } from '@nocobase/authorization/sharing-rules';
import { databaseScope } from '@nocobase/app-plugin-authorization';

if (!('sharingRules' in authz))
  throw new Error('Sharing rules is not configured');
const rules = (
  authz as typeof authz & SharingRulesAuthorizationApi<DatabaseConnection>
).sharingRules;
// quotes is a declared resource; sales.* strategies and team subjects are registered by its owner.
await rules.create(
  sharingRule('proposal-handover', quotes.reference())
    .title('Proposal handover')
    .subjects({ type: 'sales.team', id: 'proposal' })
    .scope('submit', 'quotes', { type: 'records', ids: ['quote-7'] })
    .scope('submit', 'projects', { type: 'records', ids: ['project-3'] })
    .reason('Delegate this proposal to the team')
    .build(),
);
// A dynamic selection instead uses:
const selection = {
  type: 'policy' as const,
  policy: databaseScope('sales.region'),
};
const saved = await rules.get('proposal-handover');
await rules.delete('proposal-handover');
```

`create(rule)`, `update(key, rule)` (complete definition), `get(key)`, `list()`, `delete(key)` and `withTransaction(connection)`. A rule contains `{ key, title?, resource, subjects, reason?, actions }`. Each action is `{ action, scopeKey?, selection }`, where selection is `{ type: 'records', ids }` or `{ type: 'policy', policy: databaseScope(recordAccess) }`. IDs are stored separately per action/scope. Use record selection for explicit IDs, not an ID policy disguised as a dynamic selection.

Builders return immutable declarations and do not save/register anything. Titles accept strings or `{ key, ns }`. Business references infer action/scope keys; the scope registration determines which collection supplies fields and record IDs. Service writes are trusted provisioning APIs: custom HTTP callers must enforce settings authorization and validate resource/action/scope applicability, as this plugin's handlers do. Bound transactions are committed by their caller.

## Management HTTP API

Paths are relative to the application's `/api` prefix. Requests require authentication and `{ resource: { type: 'settings', id: 'authorization.sharing-rules' }, action }`. Write bodies are complete rule definitions matching the service model.

| Method | Path                        | Action   |
| ------ | --------------------------- | -------- |
| GET    | `/authz/sharing-rules`      | `read`   |
| POST   | `/authz/sharing-rules`      | `create` |
| PUT    | `/authz/sharing-rules/:key` | `update` |
| DELETE | `/authz/sharing-rules/:key` | `delete` |

`GET /authz/sharing-rules/options` and record/subject selection subroutes require `read`; subject selectors additionally enforce any independent directory restrictions. List/write responses wrap results in `{ data }`; deletes return 204. POST creation returns 201. There is no single-rule GET endpoint; use the list or server service. The settings page is `/settings/authorization/sharing-rules`, under the authorization group.

## Scope boundaries

Business rules target `{ type: 'resource', id: businessResourceName }` and an `action` plus `scopeKey`. They affect only the matching business grant branch. Underlying collection rules target `database.collection` with CRUD actions; collection restrictions apply across branches. Neither form shares related records implicitly or replaces field/relation capabilities. Unrestricted identities bypass rule constraints.

See the [development Skill](skills/nocobase-app-plugin-authz-sharing-rules/SKILL.md), [main API](../app-plugin-authorization/README.md), and [user guide](../../../docs/docs/en/capabilities/authorization/sharing-rules.md).
