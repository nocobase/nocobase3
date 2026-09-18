# Authorization declarations

Register simple page and Collection metadata with `authz.pages.add(...)` and `authz.db.collections.add(...)`. Define composed resources with `defineAuthorizationResource(name, configure)` from `@nocobase/authorization/core` and reusable data permissions with `defineDatabasePermission(configure)` from `@nocobase/app-plugin-authorization`. Both callbacks execute synchronously and return immutable builders; neither registers into an application, queries a database, or assigns permissions to a user.

```ts
const readQuotes = defineDatabasePermission((permission) =>
  permission
    .collection<Quote>('quotes')
    .title('Quotes')
    .read((read) => read.fields('id', 'title', 'amount')),
);
const quotesResource = defineAuthorizationResource('sales.quotes', (resource) =>
  resource
    .title('Quotes')
    .group('sales')
    .action('view', (action) =>
      action.title('View').grant('quotes', readQuotes),
    )
    .action('edit', (action) =>
      action.title('Edit').grant('quotes', readQuotes.update(['amount'])),
    ),
);

// In the application's Provider:
authz.resourceGroups.add({ name: 'sales', title: 'Sales' });
authz.pages.add({ name: 'sales.quotes', title: 'Quotes', actions: ['access'] });
authz.db.collections.add({
  name: 'quotes',
  title: 'Quotes',
  actions: ['read', 'update'],
});
quotesResource.register(authz.resources);

// In permission-set declarations:
const target = quotesResource.reference();
const role = permissionSet('sales')
  .grant({
    resource: { type: 'page', id: 'sales.quotes' },
    actions: [{ action: 'access' }],
  })
  .grant(target.grant({ edit: { quotes: 'recordsIOwn' } }))
  .build();
const defaults = defaultAccessRule(target)
  .scope('view', 'quotes', databaseScope('recordsIOwn'))
  .build();
```

`Quote` supplies compile-time field checks, not another runtime schema. DB metadata remains authoritative. Collection registration defines which operations participate in authorization; the permission builder describes requested capabilities independently. The registered Collection action catalogue is enforced when authorizing requests.

`grant(key, permission, { title? })` binds a reusable permission to one action's configuration key. The key maps to the existing persisted `scopeKey`; it does not change the permission's records or bind the original permission to an action. The title defaults to the permission's explicit title, or the collection name. Use a title override when one action has multiple roles for the same table. Different keys allow independent multi-table configuration. Repeated binding keys and database operations are rejected. Permissions and built snapshots remain independent when reused or mutated by a caller.

`read` describes output fields, while `create` and `update` describe input fields. `delete()` takes no fields. Use `'*'` or `.allFields()` explicitly for all fields. `.options(...recordAccessReferences)` restricts the selectable policies and preserves option-name inference through resource references; `.default(reference)` supplies a default selection. The references must apply to the selected collection. Omitting options leaves the dynamic record-access catalogue available.

Define policies with defineRecordAccess(key, configure) from @nocobase/authorization/core, then register with authz.recordAccess.add(policy). Use .resources({ type, id }) for applicability (id '*' covers one resource type), .params<P>(schema) for typed parameters, and .resolve(...) for evaluation. The context contains principal, resource, action and params; it contains no DB objects. Database policies directly use buildFilter from @nocobase/repository-input; the DB adapter validates the resulting FilterAst and converts it to executable Policy scope. Other resource plugins consume their own result types. Resolver functions are never stored in permission grants: .options(policy), .default(policy) and relation .recordAccess(policy) use policy references. Defaults, sharing and restrictions retain existing persisted keys.

## Plugin contribution protocol

Core's `AuthorizationActionBuilder.grant(contribution)` accepts `AuthorizationContribution<Selections>`, whose `build()` returns `{ grants, scopes? }`. The optional type-only `scopeSelections` carries named selections into resource references. Plugin permissions supporting named binding implement `BindableAuthorizationPermission`: `bind(key, metadata)` produces the contribution, and the optional type-only `recordAccessSelection` describes selectable values. Core never imports DB Policy or dispatches on database builder methods. Registration and request authorization remain explicit.

## Relation permissions

Permission declarations own their types independently of DB Policy. Their fields, relations, operation names and through structures align with Policy. For example:

```ts
const deliveryPermission = defineDatabasePermission((permission) =>
  permission
    .collection<Order>('orders')
    .read((read) => read.fields('id', 'title'))
    .update((write) =>
      write
        .relation('team', (team) =>
          team.recordAccess('activeTeams').connect().disconnect(),
        )
        .relation('checks', (checks) =>
          checks
            .create((create) => create.fields('id', 'title'))
            .update((update) => update.fields('title'))
            .delete(),
        )
        .relation('collaborators', (teams) =>
          teams.set((edge) =>
            edge.through((through) => through.fields('note')),
          ),
        ),
    ),
);
```

A relation's `recordAccess` resolves against its target Collection. Omitting it leaves targets unrestricted within that explicitly granted relation; an empty list allows no target. Reads and writes use separate field and relation allowlists. Writes support create, update, upsert, connect, disconnect, set and delete; beneath root create only create and connect are allowed. Upsert requires both branches. Provide target row generics for target-field type checking; runtime metadata validates actual fields and relations.

Relation writes follow the originating permission and do not automatically inherit the target Collection's standalone CRUD grants or constraints. Keep direct foreign keys out of writable fields when association changes must use relation operations. Static endpoint policies only narrow user grants; they do not supply absent relation permissions.

DB Policy has one scope per node. Different relation shapes conservatively intersect their contributing parent scopes, and merged target capabilities intersect target scopes. Identical relation declarations may union their parent scopes. Separate resource actions keep incompatible scope/capability combinations independent. The adapter never broadens relation access to make such combinations succeed.
