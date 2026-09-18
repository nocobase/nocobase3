# Code declarations, seeds and administrator configuration

Use the current sales example as the model: four job permission sets, three business collections, separate page access, a two-scope quote submission, team inheritance and delivery relations. Code defines the business permission model; seeds provide initial business permission configuration that administrators can continue editing in the backend. The example additionally seeds fictional accounts and records for practice; those fixtures are separate from the production permission configuration pattern.

## Permission model versus editable configuration

Code defines resources, pages, actions, readable/writable fields, relation capabilities and available record-access strategies. These declarations describe what the business supports and how its server enforces access. For example, code defines that submitting a quote updates its status and checks its parent project; backend configuration cannot redefine that operation to write arbitrary fields.

Seeds help the user configure that model initially: create business permission sets, choose page/action grants and data scopes, initialize default/sharing/restriction rules, and assign them to intended users or teams where identities are known. These are ordinary persisted configurations, editable through the authorization backend after installation. Being declared in a seed does not make a permission set or rule code-owned, protected or resettable on startup. Preserve subsequent administrator changes.

Application feature development registers and configures its own business resources. Leave platform/system permission configuration to the owning system plugins: do not modify root/member sets, their protection rules, authorization management capabilities or other system settings merely to make an App feature accessible. A business configuration page can live under Settings without becoming platform configuration; declare and configure only the business capability it owns. System-plugin development is a separate, explicitly scoped task.

For example, code declares Quote View/Edit/Submit and the preparer/region strategies. A seed creates the initial Sales engineer set and selects its pages, actions and scopes. An administrator can later change those grants, scopes and assignments in the backend without editing the seed. Changing what Submit does or which fields it may write requires a code change.

## Decide who owns the change

| Change                                                                | Where it belongs                              | When it runs                         |
| --------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| Table, owner/preparer field, team membership relation                 | Self-contained migration                      | Schema installation/upgrade          |
| Supported action, fields, relation capabilities, page ID, named scope | Portable TypeScript declarations              | Imported by owning feature           |
| Register resources/pages/collections and custom scope resolvers       | Owning service provider                       | Application boot                     |
| Resolve membership, enforce policies, validate workflow state         | Server services/routes                        | Each request                         |
| Route visibility, buttons, row eligibility, refresh                   | Client routes/components                      | Current session                      |
| Required initial jobs or baseline rules for a fresh product           | Transactional seed or controlled provisioning | Once, after schema prerequisites     |
| Assign an existing user, delegate a live quote, tune regional access  | Settings UI or authorized runtime service     | Administrator/business decision      |
| Correct configuration in an existing installation                     | Explicit, versioned data-change workflow      | Upgrade with stated affected records |

A resource declaration registers what the product can do; it grants nobody access. A permission-set declaration is a value; `.build()` does not save it. A seed persists initial configuration; it does not replace provider registration. Never create or overwrite permission sets on every provider boot.

Write no authorization seed when the requirement is only a new operation administrators will grant themselves. Write one when a fresh installation must start with an agreed usable job configuration. User assignments require known identities and explicit intended responsibility; a new page does not justify assigning all users or changing `member`/`root`.

## Share declarations, not runtime instances

Keep a portable feature module such as `server/sales-resources.ts` with `defineAuthorizationResource` declarations. Put permission-set values in `database/seed-data/permission-sets.ts`, importing the same resource references. The corresponding code for a customer-owned feature can live under its own `sales/` directory. Use that feature's names consistently; the installed example uses `example.sales.*` and `authorizationExample*` names.

```ts
import { permissionSet } from '@nocobase/authorization/permissions';
import { quotes } from '../../server/sales-resources.js';

export const engineer = permissionSet('sales-engineer')
  .title('Sales engineer')
  .grant({
    resource: { type: 'page', id: 'sales.quotes' },
    actions: [{ action: 'access' }],
  })
  .grant(
    quotes.reference().grant({
      view: { quotes: 'allRecords' },
      edit: { quotes: 'sales.prepared' },
      submit: { quotes: 'sales.prepared', projects: 'sales.region' },
    }),
  )
  .build();
```

The declarations used here are in [the sales workflow](business-module.md). Register `sales.prepared` and `sales.region` before serving requests. Use `{ key, ns }` titles and matching client translations in a localized product; plain titles here keep the snippets small. Store policy references and parameters, never resolver functions.

## A normal App seed has a database context

`defineSeed` from `@nocobase/db` receives `{ query, connection }`. `connection` is a restricted `SeedConnection`, not a complete runtime `DatabaseConnection`; the seed has no application container. Do not cast it to construct an App authorization service or assume `authorizationToken` can be resolved there.

For initial installation, a seed may write the documented persistence rows below after the owning plugins' migrations. Keep this adapter confined to installation data, use fluent values as its input, and test against the installed schema. Runtime routes must use the services instead. The current example uses this bootstrap pattern and separate data modules per table.

```ts
import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { engineer } from '../seed-data/permission-sets.js';

export default defineSeed({
  name: '202609190001_sales_jobs',
  transaction: true,
  async run({ query }) {
    const existing = await query
      .selectFrom('authorizationPermissionSets')
      .select('id')
      .where('key', '=', engineer.key)
      .executeTakeFirst();
    if (existing) return; // Preserve an administrator's existing definition.
    const now = new Date();
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: engineer.key,
        key: engineer.key,
        title: encodeAuthorizationTitle(engineer.title),
        grants: JSON.stringify(engineer.grants),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  },
});
```

Place the file under the App's configured seed directory, usually `database/main/seeds/`; the seed name matches the filename. Ensure schema migrations for authorization and business collections have run, and explicitly order prerequisite installation data. Use the App's existing migration/seed commands. Do not run this code in a migration: migrations must describe fixed schema history and cannot import live business declarations.

### Persist initial permission-set assignments

Use the actual existing user/team IDs. Check logical uniqueness before inserting missing rows; a random row ID alone does not make reruns idempotent. Do not re-add an administrator-removed assignment during every startup. A one-time seed's execution history handles when it runs; a provisioning routine that may be retried needs its own explicit completion/idempotency boundary.

| Table                                   | Row shape in addition to `id`                                            |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `authorizationPermissionSets`           | `key`, encoded `title`, JSON `grants`, `createdAt`, `updatedAt`          |
| `authorizationPermissionSetAssignments` | `permissionSetKey`, `subjectType`, `subjectId`, `createdAt`, `updatedAt` |

Use `encodeAuthorizationTitle` for permission-set titles, `JSON.stringify` for grants, and one transaction for dependent rows. Insert actual principals/teams before memberships and assignments. Verify foreign keys and idempotency against a real database.

Optional rule initialization belongs to the owning plugin Skill, including its tables, serialization and assignment format. Follow [capability discovery](optional-capabilities.md) first; if the matching Skill is absent, the App does not support that capability and implementing it requires separate development. Do not create optional-plugin tables or write speculative seed rows from this guide.

The installed example's seed uses a domain bootstrap guard: if example sales membership data exists, it skips the whole bootstrap. It does not repair individual missing roles or assignments on rerun. Its practice reset restores only fixed business records and relationships, not authorization configuration. A production App should not copy the demo password/accounts or expose the reset route.

## Runtime provisioning uses the public services

Inside a running App, resolve `authorizationToken`. Check the administrator's settings capability before executing custom provisioning. Do not write authorization tables directly from a route or add another roles system.

```ts
if (!(await authz.permissionSets.get(engineer.key))) {
  await authz.permissionSets.create(engineer);
}
const existing = await authz.permissionSets.listAssignments(engineer.key);
if (
  !existing.some(
    (a) => a.subject.type === subject.type && a.subject.id === subject.id,
  )
) {
  await authz.permissionSets.assign({ permissionSet: engineer.key, subject });
}
```

This is a serialized provisioning example, not a concurrency-safe upsert. Serialize conflicting jobs or handle the service's conflict response; do not overwrite an existing definition on retry.

Use `withTransaction(connection)` for changes that must commit with another runtime database mutation. Permission-set APIs bound to an external transaction do not publish notifications: call `notifyAssignmentsChanged(subject)` after commit, never after rollback. For disabling/deleting a user, perform `assertSubjectRemovable(subject)` and the user mutation in that same transaction. An offline installation seed has no live sessions to notify; running-system changes must follow this service lifecycle.

## Existing installations

Adding a scope implementation or field capability is a code change. Assigning that new action is a configuration decision. Do not assume editing a seed will update deployed installations, and do not reinterpret a persisted action/scope key for a different purpose. For a required upgrade, identify affected business configuration keys, preserve administrator choices and unrelated assignments, perform only the explicitly intended update and verify with ordinary users. Do not treat seed-created records as code-owned defaults that can be reapplied automatically.
