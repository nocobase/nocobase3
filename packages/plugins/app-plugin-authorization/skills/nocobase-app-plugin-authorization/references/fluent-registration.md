# Authorization declarations

Register simple page and Collection metadata with `authz.pages.add(...)` and `authz.db.collections.add(...)`. Define composed resources with `defineAuthorizationResource(name, configure)` from `@nocobase/authorization/core` and reusable data permissions with `defineDatabasePermission(configure)` from `@nocobase/app-plugin-authorization`. Both callbacks execute synchronously and return immutable builders; neither registers into an application, queries a database, or assigns permissions to a user.

Use the complete [quote resource declaration](runtime-api.md#declare-a-business-operation) as the starting point and [permission-set declaration](code-and-seeds.md#share-declarations-not-runtime-instances) to select its scopes. This reference adds builder semantics and relation capabilities.

The row type passed to `.collection<Row>(name)` supplies compile-time field checks, not another runtime schema. DB metadata remains authoritative. Collection registration defines which operations participate in authorization; the permission builder describes requested capabilities independently. The registered Collection action catalogue is enforced when authorizing requests.

`grant(key, permission, { title? })` binds a reusable permission to one action's configuration key. The key is persisted as `scopeKey` and identifies the scope selected for this action. The title defaults to the permission's explicit title, or the collection name. Use a title override when one action has multiple roles for the same table. Different keys allow independent multi-table configuration. Repeated binding keys and database operations are rejected. Permissions and built snapshots remain independent when reused or mutated by a caller.

`read` describes output fields, while `create` and `update` describe input fields. `delete()` takes no fields. Use `'*'` or `.allFields()` explicitly for all fields. `.options(...recordAccessReferences)` restricts the selectable policies and preserves option-name inference through resource references; `.default(reference)` supplies a default selection. The references must apply to the selected collection. Omitting options leaves the dynamic record-access catalogue available.

Define policies with `defineRecordAccess(key, configure)` from `@nocobase/authorization/core`, then register with `authz.recordAccess.add(policy)`. Use .resources({ type, id }) for applicability (id '*' covers one resource type), .params<P>(schema) for typed parameters, and .resolve(...) for evaluation. The context contains principal, resource, action and params; it contains no DB objects. Database policies directly use buildFilter from @nocobase/repository-input; the DB adapter validates the resulting FilterAst and converts it to executable Policy scope. Other resource plugins consume their own result types. Resolver functions are never stored in permission grants: .options(policy), .default(policy) and relation .recordAccess(policy) use policy references. Use stable policy keys because grants and rules persist their references.

## Relation permissions

Permission declarations own their types independently of DB Policy. Their fields, relations, operation names and through structures align with Policy. For example:

```ts
import { buildFilter } from '@nocobase/repository-input';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization';

interface Order {
  id: string;
  title: string;
}
const activeTeams = {
  key: 'customFilter',
  params: { filter: buildFilter((f) => f.boolean('active').isTrue()) },
};
const deliveryPermission = defineDatabasePermission((permission) =>
  permission
    .collection<Order>('orders')
    .read((read) => read.fields('id', 'title'))
    .update((write) =>
      write
        .relation('deliveryTeam', (team) =>
          team.recordAccess(activeTeams).connect().disconnect(),
        )
        .relation('checks', (checks) =>
          checks
            .create((create) => create.fields('id', 'title'))
            .update((update) => update.fields('title'))
            .upsert((upsert) =>
              upsert
                .create((create) => create.fields('id', 'title'))
                .update((update) => update.fields('title')),
            )
            .delete(),
        )
        .relation('collaborators', (teams) =>
          teams
            .recordAccess(activeTeams)
            .set((edge) => edge.through((through) => through.fields('note'))),
        ),
    ),
);
```

A relation's `recordAccess` resolves against its target Collection. Omitting it leaves targets unrestricted within that explicitly granted relation; an empty list allows no target. Reads and writes use separate field and relation allowlists. Writes support create, update, upsert, connect, disconnect, set and delete; beneath root create only create and connect are allowed. Upsert requires both branches. Provide target row generics for target-field type checking; runtime metadata validates actual fields and relations.

Relation writes follow the originating permission and do not automatically inherit the target Collection's standalone CRUD grants or constraints. Keep direct foreign keys out of writable fields when association changes must use relation operations. Static endpoint policies only narrow user grants; they do not supply absent relation permissions.

DB Policy has one scope per node. Different relation shapes conservatively intersect their contributing parent scopes, and merged target capabilities intersect target scopes. Identical relation declarations may union their parent scopes. Separate resource actions keep incompatible scope/capability combinations independent. The adapter never broadens relation access to make such combinations succeed.
