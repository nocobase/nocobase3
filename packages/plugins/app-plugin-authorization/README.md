# @nocobase/app-plugin-authorization

NocoBase application integration for authorization: authenticated identities, permission sets, page and settings permissions, database field/record/relation policies, management APIs and React UI. For configuration without code, read the [user guide](../../../docs/docs/en/capabilities/authorization/index.md). For implementing a feature, read the [development Skill](skills/nocobase-app-plugin-authorization/SKILL.md).

## Installation and service

Register this package's default `client` and `server` exports in the application's plugin composition roots, with authentication registered. Apply application migrations and seeds. Resolve `authorizationToken` in a provider or route factory; create one shared service per application, not per feature.

```ts
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
const authz = app.container.resolve(authorizationToken);
```

For an independent host/test, `createAppAuthorization({ database?, connection?, config?, onUserPermissionsChanged?, onAuthenticatedPermissionsChanged? })` creates the service. `database` supplies repository integration and `connection` supplies metadata/persistence. The normal application provider supplies both. `config.permissionSets` accepts `rootSet` and `defaultSet` names (defaults `root`, `member`); `config.plugins` lists optional rule factories. Permission sets, pages and database authorization are built in.

```ts
import type { AuthorizationConfig } from '@nocobase/app-plugin-authorization/server';
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';

export default {
  plugins: [defaultAccess(), sharingRules(), restrictionRules()],
} satisfies AuthorizationConfig;
```

Put this in the application's authorization configuration and register each optional plugin on client and server as well. Each owns its migration, store, settings page and management endpoints. See their READMEs for configuration APIs.

## API map

| Export/surface                                                                                         | Purpose                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `./server`: `authorizationToken`, `permissionSetsToken`                                                | Resolve `AppAuthorizationService` or its permission-set service                                                                 |
| `./server`: `createAppAuthorization`, `AuthorizationConfig`                                            | Host integration and configuration                                                                                              |
| Root or `./server`: `defineDatabasePermission`, `databaseGrant`, `databaseScope`                       | Portable typed declarations and JSON grant/scope helpers                                                                        |
| `authz.for(identity)`, `middleware()`, `guard(request)`                                                | Request identity and authorization; [Core API](../../libs/authorization/README.md)                                              |
| `authz.permissionSets`                                                                                 | Definition, assignment, protection and transaction APIs; [complete methods](../../libs/authorization/README.md#permission-sets) |
| `authz.pages.add(definition)`, `pages.grant(id, actions)`                                              | Page catalog and independent `access` grant                                                                                     |
| `authz.settings.grant(id, actions)`                                                                    | Declare settings capabilities for composed administration actions                                                               |
| `authz.db.collections.add(definition)`                                                                 | Opt a collection into authorization                                                                                             |
| `authz.db.grant(name, definition)`, `db.scope(recordAccess)`                                           | JSON equivalents of `databaseGrant` / `databaseScope`                                                                           |
| `authz.db.policyFor(collection, scope, operation?)`                                                    | Resolve all CRUD operations into a `RepositoryPolicy`                                                                           |
| `authz.db.authorizeRepository({ repository, resource, actions })`                                      | Middleware binding Repository methods to typed business actions                                                                 |
| `./client`: `useCan`, `useAuthorizationClient`, `authorizationClientToken`, `useAuthorizationRevision` | Session-aware visibility checks                                                                                                 |
| `./client/management`, `./server/management`                                                           | Shared management components, options, subjects and request helpers for rule plugins                                            |

Server exports also expose `pages`, `DatabaseResourceAuthorizer`, `DatabaseCollectionRegistry`, `collectionResolver`, `condition`, `anyScope` and `scopeAst` for custom hosts/adapters. Ordinary business code should use declarations and policies instead of constructing adapters. Types are exported alongside these APIs; [server entry](server/index.ts) is the complete export list.

## Declare a business operation

Use stable business names (`sales.quotes`, `submit`) and separate scope keys for every independently controlled table. Builders are immutable; return the builder from each callback. They perform no registration or persistence.

```ts
import { defineAuthorizationResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization';

interface Quote {
  id: string;
  projectId: string;
  amount: number;
  status: string;
}
interface Project {
  id: string;
  title: string;
}
const quoteData = defineDatabasePermission((p) =>
  p
    .collection<Quote>('quotes')
    .title('Quotes')
    .read(['id', 'projectId', 'amount', 'status']),
);
const projectData = defineDatabasePermission((p) =>
  p.collection<Project>('projects').title('Projects').read(['id', 'title']),
);
export const quotes = defineAuthorizationResource('sales.quotes', (r) =>
  r
    .title('Quotes')
    .group('sales')
    .action('view', (a) => a.title('View').grant('quotes', quoteData))
    .action('submit', (a) =>
      a
        .title('Submit')
        .grant('quotes', quoteData.update(['status']))
        .grant('projects', projectData),
    ),
);

// In the owning provider's boot method:
authz.resourceGroups.add({
  name: 'sales',
  title: 'Sales',
  category: 'business',
});
authz.db.collections.add({ name: 'quotes', title: 'Quotes' });
authz.db.collections.add({ name: 'projects', title: 'Projects' });
authz.pages.add({ name: 'sales.quotes', title: 'Quotes', actions: ['access'] });
quotes.register(authz.resources);
```

Every collection must be registered, including for unrestricted users. Registration carries `name`, optional `title`, `description` and `actions`; field, primary-key and relation metadata comes from the database. Supported collection actions are `read`, `create`, `update`, `delete`. Duplicate compatible registration is idempotent; conflicting metadata is rejected.

`.grant(key, permission, { title? })` creates a named action scope bound to the permission's collection. Read fields govern output; create/update fields govern input. Use explicit lists, `'*'` or `.allFields()`; delete has no fields. Include fields written by the server, such as timestamps, in the grant. A generated primary key is excluded from wildcard create fields. `.options(...recordAccessReferences)` narrows scope choices; `.default(reference)` sets a default. Omitting options exposes applicable registered strategies.

```ts
import { permissionSet } from '@nocobase/authorization/permissions';
await authz.permissionSets.create(
  permissionSet('sales-engineer')
    .title('Sales engineer')
    .grant(authz.pages.grant('sales.quotes', ['access']))
    .grant(
      quotes.reference().grant({
        view: { quotes: 'allRecords' },
        submit: { quotes: 'recordsICreated', projects: 'recordsIOwn' },
      }),
    )
    .build(),
);
await authz.permissionSets.assign({
  permissionSet: 'sales-engineer',
  subject: { type: 'user', id: userId },
});
```

The built-in scopes require the matching columns (`createdById`, `ownerId` by default); choose custom strategies for other models. Assignment activates declarations. Page access and business actions are independent. The permission workspace edits business actions, their scopes and pages; fields and relation capabilities are declared in code.

## Enforce the operation on the server

Every route installs authentication and authorization middleware. For a composed action, authorize once and bind every resulting table policy before executing business queries. Validate input and business transitions separately.

```ts
router.use('*', authentication.required(), authz.middleware());
router.get('/quotes', async (c) => {
  const decision = await c.get('authz').authorize({
    resource: { type: 'resource', id: 'sales.quotes' },
    action: 'view',
  });
  if (decision.effect === 'deny' || decision.conditions?.type !== 'resource')
    return c.json({ code: 'FORBIDDEN' }, 403);
  const policy = decision.conditions.database?.quotes;
  if (!policy) return c.json({ code: 'FORBIDDEN' }, 403);
  const records = await database
    .repository('quotes')
    .withPolicy(policy)
    .findMany();
  return c.json({ data: records });
});
```

For `submit`, use both `conditions.database.quotes` and `.projects` inside the same business transaction. Check the quote's actual parent project using the project policy and include the expected state in the update predicate. `conditions.checks` explains the underlying decisions. Do not replace these policies with an aggregate `db.policyFor` call: another operation's grants could then widen access. `require` rejects conditional decisions; `can` does not enforce rows.

For a collection-oriented endpoint, aggregate CRUD authorization is appropriate:

```ts
const policy = await authz.db.policyFor('quotes', requestScope);
const repository = database.repository('quotes').withPolicy(policy);
await repository.updateOne({ filter: { id }, values: input });
```

The optional third argument `{ resource: 'sales.quotes', action: 'submit' }` restricts `policyFor` to one business operation's branch. Prefer the single composed decision when the operation spans multiple tables. Policies deny absent operations, constrain records in SQL and allow only granted fields/relations. Out-of-scope rows can surface as `RECORD_NOT_FOUND`; map repository errors consistently without leaking hidden records.

For generated Repository APIs, retain the normal `defineRepositoryApiRoutes` declaration and install `authz.db.authorizeRepository({ repository, resource: businessResource.reference(), actions: { findMany: 'view', updateOne: 'edit' } })` after authentication. It binds each endpoint to one business action and narrows its existing policy. See [complete Repository integration](skills/nocobase-app-plugin-authorization/references/repository-routes.md) for validation, response contracts and limits. Multi-scope operations require custom handlers.

## Record strategies and relations

```ts
import { defineRecordAccess } from '@nocobase/authorization/core';
import { buildFilter } from '@nocobase/repository-input';
const prepared = defineRecordAccess('sales.prepared', (p) =>
  p
    .title('Prepared by me')
    .resources({ type: 'database.collection', id: 'quotes' })
    .resolve(({ principal }) =>
      buildFilter((f) => f.string('preparedById').eq(principal.id)),
    ),
);
authz.recordAccess.add(prepared);
```

A strategy can use `.params<P>(schema)` for validated configuration and close over an application service for related-record lookup. Resolve from verified principal/membership data. Return a DB `FilterAst` for database strategies. Built-ins include `allRecords`, `recordsIOwn`, `recordsICreated` and `customFilter`; owner/creator policies accept `params.field`. `customFilter` uses a native DB filter, with direct scalar field conditions; relation traversal and JSON conditions are not supported by this authorization boundary.

Relations are explicit capability trees:

```ts
const delivery = defineDatabasePermission((p) =>
  p
    .collection('orders')
    .read((r) =>
      r.fields('id').relation('team', (t) => t.fields('id', 'title')),
    )
    .update((w) =>
      w
        .relation('team', (t) =>
          t.recordAccess('activeTeams').connect().disconnect(),
        )
        .relation('checks', (c) =>
          c
            .create((v) => v.fields('id', 'title'))
            .update((v) => v.fields('title'))
            .delete(),
        )
        .relation('collaborators', (c) =>
          c.set((edge) => edge.through((through) => through.fields('note'))),
        ),
    ),
);
```

Register `activeTeams` for the target collection before using it. Writes support create/update/upsert/connect/disconnect/set/delete; root create permits nested create/connect only. Upsert must grant both branches. Relation `recordAccess` applies to target rows: omitted means unrestricted targets within that explicitly granted relation; `[]` means no targets. Related records do not automatically inherit standalone target CRUD permissions or restrictions. Exclude direct foreign keys when association changes must go through relation policies. Static endpoint policies cannot restore missing relation grants. Because DB Policy has one scope per node, differing field/relation capabilities may conservatively intersect scopes. See [declaration details](skills/nocobase-app-plugin-authorization/references/fluent-registration.md).

## Subjects and transactions

Use `authz.subjects.define(type, { resolveFor, filterActive, administration })` for inherited team/department permissions. `resolveFor(principal)` returns current IDs; `filterActive(ids, transaction?)` filters disabled/deleted subjects. Registration returns cleanup for provider shutdown. The HTTP middleware and user inspector resolve these memberships. `authz.for(identity)` does not automatically resolve them.

`administration` is `{ title, selection }`: `selection: { type: 'fixed', id }` describes a fixed audience; `type: 'collection'` implements `list({ search, page, pageSize }, { authz })` returning `{ items, total }` and `resolve(ids, { authz })` returning items. Items contain `{ id, title, description? }`. The calling management endpoint already checks its settings permission. If the directory has additional read permissions or row restrictions, enforce those in both callbacks; do not invent a separate directory permission when the entry permission is sufficient. Picker visibility does not grant assignment rights. Preserve stored unknown/unreadable subject IDs.

Permission-set revocation/replacement uses the database Store's transaction and lock protocol to preserve a final active administrator. For user removal/disable flows, call `permissionSets.withTransaction(connection).assertSubjectRemovable(subject)` in the same transaction as the user mutation and notify through `notifyAssignmentsChanged(subject)` after commit. See the [transaction and protection API](../../libs/authorization/README.md#permission-sets).

## Client API and page access

```tsx
import { useCan } from '@nocobase/app-plugin-authorization/client';
const { can, isPending, error, retry } = useCan({
  resource: { type: 'resource', id: 'sales.quotes' },
  action: 'submit',
});
```

`useCan(request, { enabled?: boolean })` returns false while pending/failed, handles session changes and permission invalidation. Outside React, resolve `authorizationClientToken` and call `client.can(request)`; components use `useAuthorizationClient()`. `useAuthorizationRevision()` supports custom caches. Never retain a module-global client or reuse a snapshot across sessions.

Client route declarations use `authz: { resource: { type: 'page', id: 'sales.quotes' }, action: 'access' }`. Page IDs are stable names, independent of URLs. `authz: 'skip'` skips that page's authorization check, not authentication or its server APIs. Navigation determines page display groups; backend business groups use `resourceGroups`. A page grant does not grant data access, and a business grant does not open a page.

## Management HTTP API

Paths below are relative to the application's `/api` prefix; all require authentication. Request/response contracts are implemented in [management](server/management). User-entered labels are strings; seeded labels may be `{ key, ns }` and should be preserved on unrelated edits.

| Method and path                                                                                                                         | Required settings capability                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /authz/permissions`                                                                                                                | Current authenticated identity's visibility snapshot                          |
| `GET /authz/permission-sets`, `GET /authz/permission-sets/:key`                                                                         | `authorization.permission-sets/read`                                          |
| `POST /authz/permission-sets`                                                                                                           | `authorization.permission-sets/create`                                        |
| `PUT /authz/permission-sets/:key`                                                                                                       | `authorization.permission-sets/update`                                        |
| `DELETE /authz/permission-sets/:key`                                                                                                    | `authorization.permission-sets/delete`                                        |
| `GET /authz/permission-sets/:key/assignments`                                                                                           | `authorization.permission-sets/read`                                          |
| `POST /authz/permission-sets/:key/assignments`, `DELETE /authz/permission-sets/assignments/:id`                                         | `authorization.permission-sets/assign`                                        |
| `GET /authz/permission-sets/effective/:type/:id`                                                                                        | `authorization.permission-sets/read`                                          |
| `GET /authz/permission-sets/options`, subject selection subroutes                                                                       | `authorization.permission-sets/read`, plus any directory-specific read checks |
| `POST /authz/inspect`, `/authz/inspect/batch`, `/authz/inspect/configured`; `GET /authz/inspector/options` and inspector subject routes | `authorization.inspector/inspect`                                             |

Settings requests use `{ resource: { type: 'settings', id }, action }`. Creating/updating a set sends `{ key, title?, grants }`; assignment sends `{ subject: { type, id } }`. Generic management honors protection metadata: protected keys cannot be renamed, the default set's title/grants can be edited, and removing the final active root assignment returns `409 LAST_ASSIGNMENT`.

The inspector evaluates one subject, resource and action, with sources, reasons, fields and record conditions. User inspection includes authenticated audience and resolved memberships; inspecting a team directly describes that team's grants, not every member's effective access. It does not count accessible records. `configured` summarizes assigned configurations, not successful access to every record. Rule results are fresh per request and shared within a batch.

## Administration resources

Register a flat `administration` group, then a composed resource whose actions grant `authz.settings.grant(id, actions)`. Server routes independently check the underlying `settings` capability. Registering the resource only makes it configurable; assign it through a permission set to activate it. Do not register a second settings item catalog or include page grants inside composed operations. See the [system settings development reference](../../../.agents/skills/nocobase-plugin-development/references/system-settings.md) and the runnable [sales example](../../examples/app-plugin-authorization-example/README.md).
