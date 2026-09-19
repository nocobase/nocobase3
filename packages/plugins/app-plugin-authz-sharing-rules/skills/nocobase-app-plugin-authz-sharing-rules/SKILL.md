---
name: nocobase-app-plugin-authz-sharing-rules
description: Design, implement and verify sharing rules for NocoBase 3 business operations, including named data scopes and production administration.
---

# Develop sharing rules

Adds selected records or a dynamic record scope for selected subjects who already hold the action. Sharing does not grant the operation, fields, page access or related records. Permission-set/default/shared scopes combine before restrictions narrow them.

Read the installed `nocobase-app-plugin-authorization` Skill first for business actions, fields, server policy enforcement and inherited subjects. Check client/server plugin registration and authorization config before relying on this feature. Installation, service signatures and HTTP routes are included below. Use public exports for runtime operations; use the main Skill’s `references/code-and-seeds.md` for controlled installation data.

## Development workflow

1. Identify the real collaboration exception: who receives which records, for which actions, and why. Use explicit records for one handover; use a dynamic strategy for a maintained region/team rule.
2. Grant the recipients the business action through a permission set first. Register inherited subjects and their active membership resolver through the main authorization Skill.
3. Inspect every scope required by the operation. Quote submission needs the selected quote and its actual parent project. Add each action/scope selection deliberately; view, edit and submit are different permissions.
4. Save a complete sharing rule using `sharingRules.create/update` or the settings UI. Keep selection IDs tied to their scope's collection and preserve other entries on update.
5. Verify the handover works, an unshared parent still blocks the workflow, restrictions still exclude confidential records, and sharing alone cannot activate a missing operation.
6. Revoke the sharing recipient or team role and verify the next request loses only that access source. Independent direct-user sharing and direct job assignments must survive.

The included handover code and the main Skill’s bundled team registration implement this pattern; the example source is optional for comparison. Its Proposal team handover grants quote edit/submit and parent-project submit access. Do not copy demo IDs into a production rule.

## Install

Register the default export from `@nocobase/app-plugin-authz-sharing-rules/client` in `client/plugins.ts` and from `@nocobase/app-plugin-authz-sharing-rules/server` in `server/plugins.ts`. Register the main authorization plugin on both sides and run the application's migrations. Add the rule factory to `server/config/authorization.ts`:

```ts
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AuthorizationConfig } from '@nocobase/app-plugin-authorization/server';
const authorization: AppConfigFactory<AuthorizationConfig> = defineAppConfig(
  () => ({
    plugins: [sharingRules()],
  }),
);
export default authorization;
```

Include this config under `authorization` in the App’s existing `defaultAppConfigs({ ... })`. Client plugin entries call the default factory; server entries use the default declaration. Merge this factory with the application's other authorization factories. `sharingRules({ store? })` uses the bundled database Store by default; a replacement must implement `SharingRuleStore` from `@nocobase/authorization/sharing-rules` with the application's transaction type. The pure library factory requires a Store and does not install UI or HTTP management. If the config factory is absent, this plugin installs no management endpoints.

## Service API

Resolve `authorizationToken` from `@nocobase/app-plugin-authorization/server` through `app.container.resolve(authorizationToken)` in the owning provider or route factory. Resource `quotes` and the team subject pattern are defined in the main Skill’s bundled references; import your own declaration module, not example package internals. Optional APIs are present only when configured; narrow the service before using one:

```ts
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import type { DatabaseConnection } from '@nocobase/db';
import { sharingRule } from '@nocobase/authorization/sharing-rules';

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
    .scope('edit', 'quotes', { type: 'records', ids: ['quote-7'] })
    .scope('submit', 'quotes', { type: 'records', ids: ['quote-7'] })
    .scope('submit', 'projects', { type: 'records', ids: ['project-3'] })
    .reason('Delegate this proposal to the team')
    .build(),
);
```

`create(rule)`, `update(key, rule)` (complete definition), `get(key)`, `list()`, `delete(key)` and `withTransaction(connection)`. A rule contains `{ key, title?, resource, subjects, reason?, actions }`. Each action is `{ action, scopeKey?, selection }`, where selection is `{ type: 'records', ids }` or `{ type: 'policy', policy: databaseScope(recordAccess) }`. IDs are stored separately per action/scope. Use record selection for explicit IDs, not an ID policy disguised as a dynamic selection.

Builders return immutable declarations and do not save/register anything. Titles accept strings or `{ key, ns }`. Business references infer action/scope keys; the scope registration determines which collection supplies fields and record IDs. Service writes are trusted provisioning APIs: custom HTTP callers must enforce settings authorization and validate resource/action/scope applicability, as this plugin's handlers do. Bound transactions are committed by their caller.

## Installation seeds

Use this initialization only after confirming this plugin is installed, registered and configured, and its migrations have run. Read the main authorization Skill’s `references/code-and-seeds.md` for `defineSeed`, the restricted seed database context and the code/configuration boundary. These are initial business configurations, still editable in the backend; do not protect or overwrite them merely because they came from a seed. Runtime routes use the service API, not direct table writes.

Build the rule with this Skill's fluent builder in a portable seed-data module. Persist JSON values, never resolver functions. Use a transactional seed, test logical uniqueness before insertion and preserve existing administrator configuration. Do not import live declarations into a migration.

| Table                                 | Fields in addition to `id`                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `authorizationSharingRules`           | `key`, encoded `title`, `resourceType`, `resourceId`, JSON `actions`, nullable `reason`, `createdAt`, `updatedAt` |
| `authorizationSharingRuleAssignments` | `sharingRuleId`, `subjectType`, `subjectId`, `createdAt`                                                          |

Use `encodeAuthorizationTitle` from `@nocobase/authorization/core` for `title` and `JSON.stringify(rule.actions)` for `actions`. Map `rule.resource.type/id` to `resourceType/resourceId`. `sharingRuleId` references the persisted rule row ID, not necessarily its key. A fresh seed may choose `id: rule.key`; when reusing an existing row, use its actual ID.

Builder `.subjects(...)` values become separate assignment rows, not action JSON. Create intended principals/teams before these assignments. Check the rule key and each rule-ID/subject pair for logical uniqueness. Insert the rule and initial assignments in one transaction; do not reapply removed recipients at boot or on arbitrary retries. Preserve an existing rule and its assignments unless an explicit upgrade intends to change them.

Explicit record IDs stay inside each action’s `selection`, separately for quote and parent-project scopes. Create referenced business records before initializing record-specific sharing. A dynamic selection persists its policy reference and parameters.

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

## Administration and acceptance

Use the existing settings page and its subject/scope pickers for ordinary configuration. New management surfaces must check `settings/authorization.sharing-rules` with the action required by the HTTP API; reading options never grants write access. Validate the resource/action/scope combination, scalar filters and selected subjects on the server. Direct service calls do not replace those checks.

Run the owning feature's route/policy tests for allowed and denied records, multiple grants, and rule removal. Verify changes with a new request scope and inspect the same operation in Settings → Authorization → Inspector. A successful frontend snapshot is not proof that a row operation is allowed. Report the actual scope and subjects changed, with observed allow/deny outcomes.
