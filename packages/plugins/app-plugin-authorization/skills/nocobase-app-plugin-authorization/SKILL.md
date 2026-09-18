---
name: nocobase-app-plugin-authorization
description: 'Add authorization to a NocoBase 3 application or plugin: register resources, protect routes and Repository API endpoints, apply database field and record conditions to queries, configure Permission Sets, and diagnose a permission decision.'
metadata:
  short-description: Add authorization to a NocoBase 3 application
  domain-owner: '@nocobase/app-plugin-authorization'
---

# Authorization development

Use this skill when a coding agent needs to add authorization to a NocoBase module or configure business permissions for an installed module. The goal is to keep business code calling its own API while authorization runs at the boundary of that API.

For a complete end-to-end implementation, read [references/orders-module.md](references/orders-module.md). It is a compact Orders module example covering schema, service, routes, and all four database access-range features.

## Choose the right layer

- Use `authz.resourceTypes.add()` when a module owns a new resource type and needs to define how that resource is authorized.
- Use `authz.db.repositories()` when a module exposes collections through `defineRepositoryApiRoutes()`. It authorizes endpoints for explicitly registered collections.
- Use `authz.guard()` for an HTTP route or action that needs one authorization check before the handler runs.
- Use `authz.db.policyFor()` when the handler reads or writes a registered collection: it returns a Repository Policy to bind with `repository.withPolicy()`.
- For composed business operations, call `context.get('authz').authorize()` once. Reject denied results, then pass each table's `decision.conditions.database[collection]` to `repository.withPolicy`. The result already includes scoped database policies and underlying `conditions.checks`; do not call `require` or `db.policyFor` again. `can` on composed resources is feature visibility only; `require` rejects conditional decisions.
- Use Permission Sets and the authorization settings API/UI for business configuration. Do not hard-code end-user assignments in a feature route.

Do not add a second permission system inside a module. The module should keep its normal service/repository API and add an authorization check immediately before the operation.

## Fluent registration

For new code, use [plugin-owned fluent builders](references/fluent-registration.md) to compose business actions with typed database field permissions and named record scopes, plus independent page-access grants. The sales authorization example demonstrates independent scopes on a multi-table operation.

## Register the collections the module governs

Database authorization is built in — an application no longer lists it among its plugins — and it is reached as `authz.db`.

```ts
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';

const authz = createAppAuthorization({
  connection,
  config: {
    plugins: [defaultAccess(), sharingRules(), restrictionRules()],
  },
});

authz
  .getResource('database.collection')
  .items.add({ name: 'orders', title: 'Orders' });
```

Registration is the opt-in into the permission model, and it carries intent only: a name, plus an optional `title` and `description` for the permission UI. Each of those is either a string, used as written, or `{ key, ns }` naming an entry in a catalogue your package ships; the options endpoint preserves the translation descriptor and namespace. Register these keys in your plugin's client locale catalogue; the client translates display options when the language changes without refetching business data. Field names, the primary key, and whether the database generates it are still read from `connection.collections` at authorize time. Registering the same thing twice is a no-op — boot runs more than once in some hosts — while a second registration that disagrees throws.

Nothing registers a collection for you. `authz.db.repositories()` narrows Policies and registers nothing, so a collection exposed over HTTP still needs its own `add()`; that is what gives it the title the permission UI shows. Put that call in the service provider that owns the module, at boot — a route file builds routes and should carry no registration of its own.

**An unregistered collection has no permission.** The request is denied with `COLLECTION_NOT_REGISTERED` before any metadata or grant lookup, for an unrestricted identity too — a superuser bypasses grants, not the model. This is what keeps system and bookkeeping tables out of the permission UI and out of every grant.

- The resource id is the registered collection name — `orders`, with no connection prefix. The plugin reads one connection.
- The actions are fixed: `read`, `create`, `update`, `delete`.
- Fields are the collection's own columns. Relations are governed by a Repository Policy's `relations`, not by a field list.
- `recordsIOwn` and `recordsICreated` take the column to compare as `params.field`, defaulting to `ownerId` and `createdById`.

An unregistered collection, a collection db does not hold, an action outside those four, and a field the collection does not have are each denied.

## Protect a module API

The module still calls its own service or repository. Authorization supplies the constraints used by that service; it does not replace the service.

```ts
routes.get('/orders', async (context) => {
  const policy = await authz.db.policyFor('orders', context.get('authz'));
  if (policy.read === false) return context.json({ code: 'FORBIDDEN' }, 403);
  const orders = database.repository('orders').withPolicy(policy);
  return context.json({ data: await orders.findMany() });
});
```

The authorization resource id in this example is the collection name itself:

```ts
resource: { type: 'database.collection', id: 'orders' }
```

For routes where only a yes/no decision is needed, use the guard middleware. For example, a module that registers a `reports` resource can protect its export endpoint like this:

```ts
routes.use(
  '/reports/:id/export',
  authz.guard((context) => ({
    resource: {
      type: 'reports',
      id: context.req.param('id'),
    },
    action: 'export',
  })),
);
```

The application must run `authz.middleware()` before the guard. It resolves the request principal and subjects from the authentication session and from any other step registered with `authz.use()`.

## Apply database conditions safely

`policyFor()` folds this request's read, create, update and delete decisions into one `RepositoryPolicy`: a denied action is `false`, an unconditional one `true`, and a conditional one `{ scope, fields }`. Binding it with `withPolicy()` is what makes the record scope and the field allowlist part of every statement — there is nothing left for the service to compile or check by hand, and no window in which a record is fetched, checked in memory, and then written without its scope.

```ts
const orders = database
  .repository('orders')
  .withPolicy(await authz.db.policyFor('orders', scope));

await orders.updateOne({ filter: { id }, values: input });
```

A row outside the scope raises `RECORD_NOT_FOUND`, which a route turns into a 404. A write grant must name every column the route stores, timestamps included; explicit field lists avoid granting access to future columns. Wildcard create permissions exclude a database-generated primary key.

## Protect Repository API routes

When the module exposes collections with `defineRepositoryApiRoutes()`, `authz.db.repositories()` authorizes them without a handler of its own. Each exposure that names a `resource` declares the static Policy it offers; the middleware narrows that shape with the caller's grants per request. Register each named collection explicitly from its owning provider.

```ts
const authorize = authorization.db.repositories(repositories);
router.use('/orders:findMany', authentication.required(), authorize);
router.route(
  '/',
  await defineRepositoryApiRoutes({
    principal: authorize.principal,
    repositories: authorize.repositories,
  }).createRouter(app),
);
```

- Mount the middleware on every action of every exposure that names a `resource`. An action it did not run on resolves no principal, and app-server answers `403 PRINCIPAL_REQUIRED` rather than falling back to the shape.
- A grant carries no relation model, and a member the grant does not mention stays as it was — so relation rules come from the shape while scope and fields are intersected with the grant. Write `read` out as a node with its `fields` and `relations`; `read: true` narrows to a node with no readable relations.
- An exposure that names a `resource` needs a static `policy`. A function throws a `TypeError` where the routes are defined.
- An exposure with no `resource` is passed through and never consults authorization.

`@nocobase/app-plugin-authorization-example` is the runnable reference: one owned collection, its Repository API endpoints authorized by name, and a hand-written create route that stamps the owner from the principal.

## Configure business permissions

Permission configuration has two parts:

1. The module declares the resources and endpoints it authorizes in code.
2. An administrator assigns Permission Sets and configures database rules.

Use a Permission Set when the same access should be reused for several users, roles, or other subjects. Put the database resource and its actions in the grant, then configure fields and record access per action. Use Default Access for a collection-wide baseline, Sharing Rules to expand access for selected subjects, and Restriction Rules to narrow effective access.

The settings API uses the same authorization instance as application code:

```ts
const permissionSet = await authz.permissionSets.create({
  key: 'orders-manager',
  title: 'Orders manager',
  grants: [
    authz.db.grant('orders', {
      read: {
        fields: { output: ['id', 'number', 'amount', 'status'] },
        recordAccess: ['allRecords'],
      },
    }),
  ],
});

await authz.permissionSets.assign({
  permissionSet: permissionSet.key,
  subject: { type: 'user', id: userId },
});
```

Prefer the authorization settings UI for administrator-managed assignments. Use the API from migrations or controlled provisioning flows where a fixed business configuration is required.

## Add a non-database resource

For a module operation that is not a database collection, register a resource handler. The handler receives the request context and the grant service; it should return a permit, deny, or conditional decision.

```ts
authz.resourceTypes.add({
  resourceType: 'files.download',
  async authorize(request, context) {
    const grants = await context.grants.resolve({
      principal: request.principal,
      subjects: request.subjects,
      resource: request.resource,
      action: request.action,
    });
    return grants.length > 0
      ? { effect: 'permit', reasons: [] }
      : { effect: 'deny', reasons: [] };
  },
});
```

The module can expose its own API, for example `files.download()`, while the route or service performs the authorization request before invoking it.

## Review and diagnose

When a permission does not behave as expected, inspect in this order:

1. Confirm the resource type and id exactly match the resource, that the collection a `database.collection` id names is registered in `authz.getResource('database.collection').items`, and that db holds it.
2. Confirm the action is one the resource supports.
3. Confirm the request principal and subjects were resolved by middleware.
4. Check the user's Permission Set assignments.
5. Check Default Access, Sharing Rules, and Restriction Rules for that action.
6. Call `authz.explain()` with the same resource, action, and params used by the module. The returned reasons identify the authorization decision and its contributing constraints.

`authz.explain()` remains the way to settle one concrete request. The Permission Inspector under Settings → Authorization asks the same question from the browser: pick a person, a resource and an action, and it reports the effect, each reason with the plugin that gave it, and the conditions when the decision is conditional, exactly as the core returned them. It is gated by `settings.authorization.inspector/inspect`. Otherwise the settings pages edit one layer each and report nothing across layers, because each authorization plugin owns its own rules.

Do not treat a successful permission snapshot as proof that a database query is safe: a snapshot contains grants, while database authorization may still narrow the rows and fields a Policy allows.

## Resource registration

Register user-facing groups with `authz.resourceGroups.add({ name, title, category })` and resources with `authz.resources.add({ name, title, group, actions })`. Groups are flat; category is `business` (default) or `administration`. Business actions compose only database collection grants; administration actions may compose other system capabilities. Page access must be granted independently and cannot be included in composed actions. Permission sets and the inspector expose registered pages as a separate category, including when no business group exists. Raw collection and custom handlers remain internal. Settings resources use this same catalog and reference underlying permissions through `authz.settings.grant(id, actions)`, which returns declarations without granting access. Backend routes still check `settings` permissions. Underlying resource handlers expose flat item registries without a grouping API. Page display groups come only from client navigation routes; business and administration groups use `authz.resourceGroups`. Do not register settings display items with `getResource('settings').items`. Only resources with data scopes appear in data-rule editors.

## Register selectable subject types

Use `authz.subjects.define()` for users, departments, positions, or other authorization subjects. Keep `filterActive` responsible for object validity. Add optional `administration: { title, selection }` to expose the type in permission-set, sharing-rule, and restriction-rule pickers. A collection selector implements `list({ search, page, pageSize }, { authz })` returning `{ items, total }` and `resolve(ids, { authz })` returning items; each item is `{ id, title, description? }`. Both callbacks must check directory read permission and reuse the owning module's service. A fixed subject uses `selection: { type: 'fixed', id }`. See the package README for a complete registration example.

The selector controls discovery and name resolution, not assignment permission. Keep write checks at the assignment or rule endpoint, and add runtime memberships to `request.subjects` separately. Do not hard-code user-only pickers or silently discard stored subjects whose plugin or directory is unavailable.

## Optional rule plugins

Default access, sharing rules and restriction rules are separate application plugins. Import their factories from `@nocobase/app-plugin-authz-default-access/server`, `@nocobase/app-plugin-authz-sharing-rules/server` and `@nocobase/app-plugin-authz-restriction-rules/server` respectively in `server/config/authorization.ts`. Register each installed plugin's default client factory in `client/plugins.ts` and default server definition in `server/plugins.ts`. Removing a feature requires removing both runtime registrations and its authorization config factory. The authorization library subpaths contain pure rule engines and Store contracts, not management HTTP handlers.

Their settings routes use entry-level `parent: 'authorization'` to join this plugin's group while retaining their own translation namespace. The rule plugins own their database migrations; reinstall when adopting this source-level split rather than editing historical migration checksums.

## Session-aware client permissions

The authorization React provider runs inside the authentication provider and clears the permission snapshot before rendering a new session. Keep both providers registered. The client discards obsolete permission responses after invalidation; custom menus and route guards should subscribe with `useAuthorizationRevision()` and rerun checks when its value changes. Cached Refine checks must include the revision in their query parameters and disable previous-result placeholders so protected content stays hidden while new permissions load. Frontend checks do not replace server authorization.

Explicit route domain checks use `access: { resource: 'type:id', action: 'action' }` (for example `hub.app:*` and `upload-release`). Do not use a bare domain type as the resource: a plain name is interpreted as a page id. These snapshot checks do not enforce record ownership; keep the server's authorization boundary.

## Predefined permission-set titles

Titles accept plain strings or `{ key, ns }` translation descriptors, directly on permission sets and rules. Built-in and example seeds persist descriptors; ordinary user-entered names remain strings. Render titles with the existing i18n translator. Preserve descriptors when saving unrelated edits; a user rename replaces the title with a string. User names are ordinary data and must not be translated as role names.

Permission-set CRUD uses `read`, `create`, `update`, and `delete`; assigning and revoking subjects both require `assign` on `settings/authorization.permission-sets`. The inspector owns `settings/authorization.inspector` with action `inspect`, including its options and subject-picker endpoints. Subject providers still enforce their own directory query permissions. Default access uses `read` and `configure`; configure covers saving and clearing defaults regardless of whether a rule already exists.

## Business action scope choices

A custom resource item can declare `actionScopes[action]` with a `policyType` and named `fields`, each containing `key`, `title`, `defaultValue` and finite `options: [{ value, title }]`. The existing Permission Sets workspace renders these choices in its configuration drawer and preserves custom action policies when saving. Titles can be localization descriptors. This is presentation metadata; the resource's `authorize` handler must validate policy values, apply matching defaults and compile the actual grants.

For a business operation example, read the authorization example plugin's `server/sales-authorization.ts` and business routes. Permission sets configure named operation scopes; business endpoints obtain the complete repository policy before executing queries and validate workflow transitions separately.

## Composed business action scopes

Register flat business groups with `authz.resourceGroups.add` and resources with `authz.resources.add`. An action may declare `scopes: { key: { title, resource, options?, defaultValue? } }`; every scope binds one underlying database collection. Reference the key in `authz.db.grant(collection, { read: { scope: key, fields: ... } })`. Permission-set action policies use `{ type: 'resource', [key]: recordAccessPolicy }`. An empty selection uses default access and sharing. No global `authz.dataScopes` registry is needed.

Default access, sharing and restriction rules may target `{ type: 'resource', id: businessResourceName }`, with each action entry specifying `action` and `scopeKey`. Records and conditions belong to that scope's collection. Sharing never grants the operation itself and never follows relations implicitly. Use `authz.db.policyFor(collection, requestScope, { resource: businessResourceName, action })` when an endpoint must enforce only that operation's grants. Omit the third argument for ordinary aggregate underlying authorization. Collection-level restriction rules still apply across every grant branch.

Record-access policies have one global registry, `authz.db.recordAccess`. Policies may declare `collections` and `requiredFields` to limit applicability. Omit action scope `options` to use all applicable policies; specify it only to narrow that list. Permission-set scopes and all rule selectors share these choices, including custom filters. Permission sets and the inspector configure registered pages independently from business operations. Business groups compose database grants only; administration groups compose system capabilities. Raw table permissions remain internal, and no composed operation may include page grants. Inspector rows show each resource’s own actions; action details explain the business grant and underlying database checks.

Register inherited authorization subjects, such as teams, with `authz.subjects.define(type, { resolveFor, filterActive, administration })`. `resolveFor(principal)` returns current subject IDs; authenticated requests and user inspection resolve these memberships server-side. `filterActive` excludes disabled or deleted subjects. A manually constructed `authz.for(identity)` uses the supplied identity; include resolved subjects explicitly outside HTTP middleware.
