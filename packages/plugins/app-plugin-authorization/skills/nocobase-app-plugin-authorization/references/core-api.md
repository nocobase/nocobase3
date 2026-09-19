# Request scopes and permission-set services

Resolve the existing `authorizationToken` in the application. This reference covers request evaluation and runtime assignment; use [runtime setup](runtime-api.md) for installation and [code versus seeds](code-and-seeds.md) for initial configuration. Do not construct a separate authorization engine for a business feature.

## Evaluate a request

The principal is the authenticated actor; `subjects` adds verified memberships such as teams. The principal also participates in grant matching. Subject IDs are literals, including the `*` in `authenticated:*`; resource IDs can use `*` as a wildcard. A manually constructed `for(identity)` uses the supplied identity: resolve and include memberships yourself.

| Request-scope API                          | Result and use                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `authorize({ resource, action, params? })` | Full decision: `permit`, `deny`, or `conditional` with `conditions`                                   |
| `explain(request)`                         | Full decision with reasons and contributing sources                                                   |
| `can(request)`                             | Boolean; composed resource checks report feature availability, not record access                      |
| `require(request)`                         | Throws `AuthorizationDeniedError` on denied or conditional access; use for unconditional capabilities |
| `permissions()`                            | Client visibility snapshot with `unrestricted` and permissions; not an executable data policy         |

Create one scope per request. Its grant and constraint caches are shared by underlying composed checks; reuse that scope within the request, never across identities or requests. Execute conditional decisions only through the resource adapter that understands their conditions. Unknown types, invalid conditional decisions and handler failures deny access.

## Permission sets

`permissionSet(key).title(title).grant(grant).build()` returns `{ key, title?, grants }`. Each grant is `{ resource: { type, id }, actions: [{ action, policy? }] }`. Policies are interpreted by their resource type. Titles accept strings or `{ key, ns }` descriptors.

| `authz.permissionSets`                                                                     | Contract                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `create(input)`, `update(key, input)`                                                      | Complete `{ key, title?, grants }` definition, not a partial patch        |
| `get(key)`, `list()`, `delete(key)`                                                        | Read/manage definitions                                                   |
| `assign({ id?, permissionSet, subject })`, `revoke(id)`                                    | Create/remove an assignment                                               |
| `listAssignments(permissionSet?)`                                                          | List all assignments or those of one set                                  |
| `replaceSubjectAssignments({ subject, managedPermissionSets, permissionSets })`            | Replace only the specified managed subset; preserve unrelated assignments |
| `getEffective({ principal, subjects? })`                                                   | Sets matching supplied identity                                           |
| `protect({ owner, keys, allow?, requireActiveAssignment?, assignableTo?, unrestricted? })` | Register code ownership and invariants; returns cleanup                   |
| `protection(key)`, `assertWritable(key, operation)`                                        | Read/enforce generic-management protection                                |
| `isUnrestricted(key)`, `unrestricted(identity)`                                            | Check declaration/identity unrestricted status                            |
| `assertSubjectRemovable(subject)`                                                          | Ensure disabling/removing a subject leaves protected sets usable          |
| `withTransaction(transaction)`                                                             | Bind all Store operations to a caller-owned transaction                   |
| `onChange(listener)`, `notifyAssignmentsChanged(subject)`                                  | Subscribe/publish assignment invalidation                                 |

The App's platform integration protects root and member sets. Root grants unrestricted access, accepts user assignments and requires a remaining active assignment; member permits content updates. Business features create their own editable sets and leave platform protection and audience assignments to their owner.

Generic HTTP management rejects changes to a protected key, even if content updates are allowed. Owner-side service calls are trusted and bypass generic `assertWritable` checks. `requireActiveAssignment` and `assignableTo` are enforced by assignment APIs. Relevant failures include `PermissionSetProtectedError`, `PermissionSetLastAssignmentError` and `PermissionSetSubjectNotAllowedError`.

The application's permission-set service runs protected assignment changes in a database transaction and locks the protected set before checking remaining active assignments. Custom subject `filterActive` callbacks must use the supplied transaction. When a business mutation owns the transaction, bind the service to that connection and notify after commit:

```ts
const subject = { type: 'user', id: userId };
await database.transaction(async (connection) => {
  const sets = authorization.permissionSets.withTransaction(connection);
  await sets.assertSubjectRemovable(subject);
  await disableUser(connection, userId); // Application-owned mutation.
});
await authorization.permissionSets.notifyAssignmentsChanged(subject);
```

Never separate the removal check from the user mutation's transaction. Use the App service's existing Store; replacing persistence is outside ordinary business feature development.

## Optional record-scope rules

Default access, sharing and restrictions require separate App plugins. Follow [capability discovery](optional-capabilities.md) and the owning installed Skill for implementation, APIs and seeds. Core library exports alone do not establish an installed App capability.
