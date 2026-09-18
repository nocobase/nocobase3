# Fluent authorization registration

Use plugin-owned builders to declare permissions in a service provider. Business operations compose database grants. Page access is a separate permission grant, and administration groups compose system capabilities. Each plugin constructs its own declarations. Builders emit the existing serializable authorization declarations and do not authorize a request or assign permissions to users.

```ts
const sales = authz.resourceGroups.define('sales', {
  title: 'Sales',
  category: 'business',
});
const page = authz.pages.define('sales.quotes', { title: 'Quotes' });
const quotes = authz.db
  .collection('quotes')
  .typed<Quote>()
  .title('Quotes')
  .actions('read', 'update')
  .register();
const own = quotes
  .recordAccess('sales.prepared')
  .title('Prepared by this user')
  .resolve(({ principal, filter }) => filter.eq('preparedById', principal.id))
  .register();
const scope = quotes
  .scope('quotes', { title: 'Quotes' })
  .options(own)
  .default(own)
  .read(['id', 'title', 'amount']);
const resource = sales
  .resource('sales.quotes', { title: 'Quotes' })
  .action('view', { title: 'View' }, (action) => action.grant(scope))
  .action('edit', { title: 'Edit' }, (action) =>
    action.grant(scope.update(['amount'])),
  )
  .register();

// Page entry and business data are assigned independently.
const grants = [page.access(), resource.grant('view')];
resource.grant({ edit: { quotes: 'sales.prepared' } });
```

`Quote` is the module's existing row type; `.typed<Quote>()` supplies compile-time field and filter-value checks without registering another runtime schema. Alternatively, `db.collection({ name, fields })` infers field names from a static collection definition whose literal types have not been widened. That form does not infer field value types; use the row type for value checking. A name-only collection accepts dynamic field names. In all cases the database remains the runtime authority for actual fields and types.

Collection actions default to `read`, `create`, `update`, and `delete`; `.actions(...)` narrows both registration and the methods callers may use. `read(fields)` declares output fields; `create(fields)` and `update(fields)` declare input fields; `delete()` has no field list. Pass `'*'` explicitly for all fields. Repeating an operation on the same scope throws rather than replacing a previous field allowlist.

Scope builders are immutable: `scope.update(...)` does not change `scope`. Attach each scope once per business action and chain its database operations before `.grant()`. Duplicate scope keys fail registration composition. Use multiple `.grant()` calls with distinct scope keys for operations involving independent tables. `.options(...)` limits the configurable record-access policies; `.default(...)` must belong to those options and apply to the collection. Omitting options leaves the existing dynamic record-access catalogue available.

For a policy shared across collections, use `authz.db.recordAccess.define(key, { collections: [...], title }).resolve(resolver).register()`. Resolvers may be asynchronous and retain the usual principal, collection, action, and params context. The additional `filter.eq(field, value)` helper builds a filter node. A policy reference may be used by any collection listed in its declaration.

The registered business resource's `.grant()` checks operation names, scope names per operation, and statically declared scope options. It returns a permission grant for a permission-set declaration; it does not persist an assignment. Business registration occurs only at `.register()`, while groups and pages register at `.define()`.

## Plugin contribution protocol

Implement `AuthorizationContribution<ScopeSelections>` from `@nocobase/authorization/core`. Its `build()` returns `{ grants, scopes? }`; grants are ordinary `PermissionGrant` objects, and scopes describe selectable ranges. The optional `scopeSelections` property is type-only metadata (declare it without emitting a runtime value) that carries the scope keys and selection types into the business builder. Plugins with no scopes implement `AuthorizationContribution` without a type argument. Plugin builders must snapshot their declarations so later reuse cannot change an already constructed action.

Core does not call database builder methods or dispatch on plugin names. Plugins consume the resulting policies through their existing authorization handlers. Server routes must still enforce the composed decision and its executable conditions as described in the main Skill.

## Portable declarations and JSON DSL

Use `businessResource(name, { group, title })` from `@nocobase/authorization/core`, and `databaseCollection(name)` / `authorizationPage(name, { title })` from `@nocobase/app-plugin-authorization`, when definitions must be shared by startup registration, seeds, or tooling. These factories do not need a running application or mutate a registry. `.reference()` exposes a typed reference without registration; `.build()` returns a fresh declaration snapshot. Register explicitly with `.register(authz.resources)`, `.register(authz.db)`, or `.register(authz.pages)` respectively.

```ts
const quotes = databaseCollection('quotes')
  .typed<Quote>()
  .actions('read', 'update');
const resource = businessResource('sales.quotes', {
  group: 'sales',
  title: 'Quotes',
}).action('view', { title: 'View' }, (action) =>
  action.grant(
    quotes
      .reference()
      .scope('quotes', { title: 'Quotes' })
      .read(['id', 'title']),
  ),
);

// Both registration paths consume the same declaration; choose one.
authz.resources.add(JSON.parse(JSON.stringify(resource.build())));
// resource.register(authz.resources);
```

Groups must exist before business resources are registered. JSON carries data, not TypeScript types: use `.reference()` on the shared builder to retain inferred action and scope names. A record-access resolver's `.build()` returns an executable `RecordAccessPolicy` for `authz.db.recordAccess.add(...)`; its `resolve` function is not JSON. JSON permission and rule declarations reference that registered policy by key and parameters.

## Permission-set and rule data

Each authorization plugin exports a pure builder. Pass the resulting `.build()` value to its existing create/set API or a seed's table serializer. Building does not persist records or make assignments.

```ts
import { permissionSet } from '@nocobase/authorization/permissions';
import { defaultAccessRule } from '@nocobase/authorization/default-access';
import { sharingRule } from '@nocobase/authorization/sharing-rules';
import { restrictionRule } from '@nocobase/authorization/restriction-rules';
import { databaseScope } from '@nocobase/app-plugin-authorization';

const target = resource.reference();
const role = permissionSet('sales-reader')
  .title('Sales reader')
  .grant(target.grant('view'))
  .build();
const defaults = defaultAccessRule(target)
  .scope('view', 'quotes', databaseScope('recordsIOwn'))
  .build();
const share = sharingRule('handover', target)
  .scope('view', 'quotes', { type: 'records', ids: ['quote-1'] })
  .subjects({ type: 'user', id: 'alex' })
  .build();
const restriction = restrictionRule('public-only', target)
  .scope('view', 'quotes', databaseScope('sales.public'))
  .subjects({ type: 'user', id: 'alex' })
  .build();
```

Rule builders infer actions and each action's scope keys from the resource reference and reject duplicate action/scope pairs. Sharing selections retain their distinction between selected record IDs and a policy. Rule and permission-set builders are immutable and return serializable snapshots. The sales example's `database/seed-data/` keeps table definitions separate from the seed's transactional insertion order and keeps assignments separate from their permission sets and rules.
