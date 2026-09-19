# Runtime integration and API

Use this reference inside the installed authorization Skill. Snippet variables such as `app`, `database`, `userId` and `input` are supplied by the owning App; declarations and route bodies belong in separate files as indicated.

## Installation and service

Register this package's default `client` and `server` exports in the application's plugin composition roots, with authentication registered. Apply application migrations and seeds. Resolve `authorizationToken` in a provider or route factory; create one shared service per application, not per feature.

```ts
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
const authz = app.container.resolve(authorizationToken);
```

The normal application provider creates the shared service with its database and persistence connection. `AuthorizationConfig.permissionSets` selects the platform root/default set names; business features leave those settings to the platform owner. `AuthorizationConfig.plugins` lists optional rule factories. Permission sets, pages and database authorization are built in.

Optional rule factories and their configuration are documented only in their owning Skills. Follow [capability discovery](optional-capabilities.md) before adding one to the App; the main service does not imply those capabilities are installed.

Client registration calls factories; server registration uses the exported declarations. Merge these entries into existing lists rather than replacing other plugins:

```ts
// client/plugins.ts
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import authentication from '@nocobase/app-plugin-authentication/client';
import authorization from '@nocobase/app-plugin-authorization/client';
export default defineClientPlugins([authentication(), authorization()]);
```

```ts
// server/plugins.ts
import { defineServerPlugins } from '@nocobase/app-server/plugins';
import authentication from '@nocobase/app-plugin-authentication/server';
import authorization from '@nocobase/app-plugin-authorization/server';
export default defineServerPlugins([authentication, authorization]);
```

Optional rule clients follow the same `plugin()` form, and their server default exports are declarations. Register only installed packages. Install their migrations before configuration writes and run the App's normal Skills synchronization after dependency changes.

## API map

| Export/surface                                                                                         | Purpose                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `./server`: `authorizationToken`, `permissionSetsToken`                                                | Resolve `AppAuthorizationService` or its permission-set service                                            |
| Root or `./server`: `defineDatabasePermission`, `databaseGrant`, `databaseScope`                       | Portable typed declarations and JSON grant/scope helpers                                                   |
| `authz.for(identity)`, `middleware()`, `guard(request)`                                                | Request identity and authorization; [Core API](core-api.md)                                                |
| `authz.permissionSets`                                                                                 | Definition, assignment, protection and transaction APIs; [permission-set API](core-api.md#permission-sets) |
| `authz.pages.add(definition)`, `pages.grant(id, actions)`                                              | Page catalog and independent `access` grant                                                                |
| `authz.settings.grant(id, actions)`                                                                    | Declare settings capabilities for composed administration actions                                          |
| `authz.db.collections.add(definition)`                                                                 | Opt a collection into authorization                                                                        |
| `authz.db.grant(name, definition)`, `db.scope(recordAccess)`                                           | JSON equivalents of `databaseGrant` / `databaseScope`                                                      |
| `authz.db.policyFor(collection, scope, operation?)`                                                    | Resolve all CRUD operations into a `RepositoryPolicy`                                                      |
| `authz.db.authorizeRepository({ repository, resource, actions })`                                      | Middleware binding Repository methods to typed business actions                                            |
| `./client`: `useCan`, `useAuthorizationClient`, `authorizationClientToken`, `useAuthorizationRevision` | Session-aware visibility checks                                                                            |
| `./client/management`, `./server/management`                                                           | Shared management components, options, subjects and request helpers for rule plugins                       |

## Declare a business operation

Use stable business names (`sales.quotes`, `submit`) and separate scope keys for every independently controlled table. Builders are immutable; return the builder from each callback. They perform no registration or persistence.

```ts
import { defineAuthorizationResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization';

interface Quote {
  id: string;
  projectId: string;
  preparedById: string;
  notes: string;
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
    .read(['id', 'projectId', 'preparedById', 'amount', 'status', 'notes']),
);
const projectData = defineDatabasePermission((p) =>
  p.collection<Project>('projects').title('Projects').read(['id', 'title']),
);
export const quotes = defineAuthorizationResource('sales.quotes', (r) =>
  r
    .title('Quotes')
    .group('sales')
    .action('view', (a) => a.title('View').grant('quotes', quoteData))
    .action('edit', (a) =>
      a.title('Edit').grant('quotes', quoteData.update(['amount', 'notes'])),
    )
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

Use [code versus seeds](code-and-seeds.md) for the engineer permission-set declaration, initial persistence and runtime assignment. Use [record-access strategies](business-module.md#3-register-and-resolve-scopes) for its preparer and region scopes. Page access and business actions are independent; registration alone grants neither.

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

For generated Repository APIs, retain the normal `defineRepositoryApiRoutes` declaration and install `authz.db.authorizeRepository({ repository, resource: businessResource.reference(), actions: { findMany: 'view', updateOne: 'edit' } })` after authentication. It binds each endpoint to one business action and narrows its existing policy. See [complete Repository integration](repository-routes.md) for validation, response contracts and limits. Multi-scope operations require custom handlers.

## Add the feature-specific pieces

Read only the references needed by the requirement:

- [Record strategies](business-module.md#3-register-and-resolve-scopes) for ownership, regional membership and related-record scopes.
- [Relation declarations](fluent-registration.md#relation-permissions) for target access, nested writes and join fields.
- [Teams and administration](subjects-and-administration.md) for inheritance, selection and revocation.
- [Client development](client-development.md) for pages, buttons, record eligibility and permission refresh.
- [Request scopes and permission sets](core-api.md) for service methods and transaction ownership.

## Management HTTP API

Paths below are relative to the application's `/api` prefix; all require authentication. The request shapes below describe the management boundary. User-entered labels are strings; seeded labels may be `{ key, ns }` and should be preserved on unrelated edits.

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

Register a flat `administration` group, then a composed resource whose actions grant `authz.settings.grant(id, actions)`. Server routes independently check the underlying `settings` capability. Registering the resource only makes it configurable; assign it through a permission set to activate it. Do not register a second settings item catalog or include page grants inside composed operations. For page and settings implementation, use [client development](client-development.md). For seed ownership, use [code-and-seeds](code-and-seeds.md).
