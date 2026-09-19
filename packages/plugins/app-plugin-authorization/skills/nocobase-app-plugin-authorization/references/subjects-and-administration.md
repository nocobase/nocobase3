# Subjects, configuration and administration

## Inherited teams or departments

Register the type through `authz.subjects.define('sales.team', { resolveFor, filterActive, administration })` in provider boot and release it on shutdown. `resolveFor(principal)` returns membership IDs from the authoritative team service; `filterActive(ids, transaction?)` excludes inactive/deleted teams. Use the passed transaction when reading validity during protected assignment changes. The complete registration below follows the current sales example. It assumes the feature owns `salesTeams` (id, title, active) and `salesTeamMembers` (userId, teamId); adapt those table names to the customer model.

```ts
import type { AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';

export const TEAM_SUBJECT = 'sales.team';
const TEAMS = 'salesTeams';

export function registerSalesTeams(
  authz: AppAuthorizationService,
  database: DatabaseManager,
): () => void {
  return authz.subjects.define<DatabaseConnection>(TEAM_SUBJECT, {
    async resolveFor(principal) {
      if (principal.type !== 'user') return [];
      const memberships = await database
        .connection()
        .query.selectFrom('salesTeamMembers')
        .select('teamId')
        .where('userId', '=', principal.id)
        .execute();
      return memberships.map((row) => String(row.teamId));
    },
    async filterActive(ids, transaction) {
      if (!ids.length) return [];
      const rows = await (transaction ?? database.connection()).query
        .selectFrom(TEAMS)
        .select('id')
        .where('active', '=', true)
        .where('id', 'in', ids)
        .execute();
      return rows.map((row) => String(row.id));
    },
    administration: {
      title: 'Sales teams',
      selection: {
        type: 'collection',
        async list({ search, page, pageSize }) {
          const teams = database.repository<{
            id: string;
            title: string;
            active: boolean;
          }>(TEAMS);
          const filter = buildFilter((f) =>
            f.and([
              f.boolean('active').isTrue(),
              ...(search
                ? [f.string('title').includes(search, { mode: 'insensitive' })]
                : []),
            ]),
          );
          const [rows, total] = await Promise.all([
            teams.findMany({
              filter,
              select: (s) => s.fields('id', 'title'),
              sort: (s) => [s.field('title').asc(), s.field('id').asc()],
              offset: (page - 1) * pageSize,
              limit: pageSize,
            }),
            teams.count({ filter }),
          ]);
          return {
            items: rows.map((row) => ({
              id: row.id,
              title: row.title,
            })),
            total,
          };
        },
        async resolve(ids) {
          if (!ids.length) return [];
          const rows = await database
            .connection()
            .query.selectFrom(TEAMS)
            .select(['id', 'title'])
            .where('active', '=', true)
            .where('id', 'in', ids)
            .orderBy('id', 'asc')
            .execute();
          return rows.map((row) => ({
            id: String(row.id),
            title: String(row.title),
          }));
        },
      },
    },
  });
}
```

Store the returned unregister callback in the owning provider and call it on shutdown.

The App middleware adds `authenticated:*` and resolves active memberships for authenticated users. User inspection uses the resolver too. Background jobs/tests that call `authz.for(identity)` must explicitly supply verified subjects; never trust client-submitted memberships. Direct inspection of a team describes the team itself, not the union of its users.

Expose `administration: { title, selection }` for assignment and rule pickers. A collection selection implements `list({ search, page, pageSize }, { authz })` returning `{ items, total }`, and `resolve(ids, { authz })` returning `{ id, title, description? }[]`. The calling endpoint checks the management permission. Enforce additional directory read authorization and row constraints in both callbacks only when the directory has those independent requirements; ordinary management pickers need no extra capability. Fixed audiences use `{ type: 'fixed', id: '*' }`. Picker access does not authorize saving assignments; preserve inaccessible stored subjects by ID instead of silently dropping them.

Test direct and inherited grants together. Removing a membership, disabling a team or revoking its permission set must stop inherited access on a new request while preserving independent direct grants. The server re-evaluates membership on each request; if membership changes need immediate frontend visibility updates, integrate the owning module's invalidation with the application's permission refresh lifecycle.

## Choose scope mechanisms deliberately

The rule mechanisms below are optional. Follow [capability discovery](optional-capabilities.md) and read the owning installed Skill before choosing one; missing Skills mean separate development is required.

| Business requirement                               | Mechanism                      | Verify                                                                   |
| -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| A job can submit quotes                            | Permission-set business action | A sharing-only user is still denied                                      |
| Every holder can consult public reference records  | Default access                 | Baseline does not unintentionally widen write scope                      |
| A selected team collaborates on a delegated record | Sharing rule                   | Grant each necessary action/scope, including parent access               |
| Confidential records must remain excluded          | Restriction rule               | Sharing and additional sets cannot reopen them at the protected boundary |
| A record's ownership follows its project           | Custom record-access strategy  | Actual parent/membership data determines scope                           |

Positive scopes from permission sets, defaults and sharing combine; restrictions intersect them. An empty configured scope can still obtain defaults/sharing. A restriction is the set of records still allowed, not a list of records to deny. Business rules match resource/action/scope branches; collection restrictions cover all branches. Relation targets do not automatically inherit standalone target restrictions. Root/unrestricted users bypass these constraints, so they are unsuitable for testing ordinary boundaries.

Use each installed rule Skill for integration, APIs and initialization. Runtime routes use these services, not direct table writes. Controlled installation seeds follow [code and seeds](code-and-seeds.md). Do not add a parallel roles implementation or silently enable an absent plugin.

## Permission-set lifecycle

Use `create`, `update`, `assign`, `revoke` and `replaceSubjectAssignments`; updates contain the complete definition. For user-management editors, pass the explicit `managedPermissionSets` subset so unrelated assignments survive. Let ordinary administrators use the existing permission workspace rather than creating a second editor.

Code-owned sets can declare `protect({ owner, keys, allow, requireActiveAssignment, assignableTo, unrestricted })`. Generic management enforces protection and forbids changing protected keys, including renaming another set onto a protected key. Default-set title and grant edits remain available when allowed. Trusted owner APIs intentionally bypass generic write protection; explicitly call `assertWritable` when exposing another management surface. Root is unrestricted and assignable only to user accounts in the App integration.

`revoke` and `replaceSubjectAssignments` automatically transact with the database Store. For disabling/deleting a user, bind `permissionSets.withTransaction(connection)`, call `assertSubjectRemovable(subject)`, and perform the user mutation in that same transaction. Publish `notifyAssignmentsChanged(subject)` only after successful commit. The bound API does not notify for you. Test simultaneous removals as well as the single remaining administrator; the invariant is at least one active assignment, not merely one stored row.

## Settings development

Administration resources belong to a flat `administration` group and compose `authz.settings.grant(id, actions)`. Separate read from configure/create/update/delete/assign capabilities according to actual operations. Client settings route checks and each server endpoint must use the matching `settings` ID/action. Registration exposes configuration; a permission-set assignment grants it.

Use the existing shared client/management and server/management exports for option and subject selection when building an authorization extension. Resolve the application API client inside hooks/components; never create a module-level fallback client. Keep the resource owner responsible for validation, translations, transactions and persistence.

Follow the bundled [client and settings workflow](client-development.md#settings-screens) and [administration API](runtime-api.md#administration-resources). These instructions are available in the installed App without repository-only documentation.

## Diagnose and accept

1. Check installed plugins, resource/collection registration and action/scope spelling.
2. Inspect the verified principal, authenticated audience, active memberships and effective permission-set assignments.
3. Evaluate the same resource/action as the endpoint with the request scope's `explain`/`authorize`, including params when required.
4. Inspect each table's policy and the applied default/sharing/restriction sources. Confirm the endpoint binds those policies rather than recomputing broader ones.
5. Inspect workflow state and relation target constraints separately from the grant decision.

The Settings inspector requires `settings/authorization.inspector/inspect`. It reports decisions and sources, not accessible-record counts. Client snapshots and configured-permission shields indicate visibility/configuration, not proof that a particular record can be changed. Include direct API denials, revocation, rollback, session switching and pending checks in acceptance evidence.
