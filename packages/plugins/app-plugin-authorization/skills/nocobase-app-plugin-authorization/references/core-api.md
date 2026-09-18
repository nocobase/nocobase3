# Core and permission-set API

The App normally resolves `authorizationToken`; use the pure library factory only for a separate host or test.

## Exports

| Import                                | Public capability                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nocobase/authorization/core`        | `createAuthorization`, resource and record-access builders, registries, decisions, grants, constraints, identity middleware and route dispatch |
| `@nocobase/authorization/permissions` | `permissionSets`, `permissionSet`, `PermissionSetsApi`, `PermissionSetStore`, protection errors                                                |

The root export re-exports Core and the four rule/permission-set subpaths. Each rule factory requires its own `store`; the library does not supply a persistence adapter or management HTTP handlers. See the exported Store interfaces for the required methods and transaction handle type.

## Create and evaluate

```ts
import { createAuthorization } from '@nocobase/authorization/core';
import {
  permissionSets,
  permissionSet,
} from '@nocobase/authorization/permissions';

// store implements PermissionSetStore for your persistence backend.
const authorization = createAuthorization({
  plugins: [permissionSets({ store })],
});
authorization.resourceTypes.add({
  resourceType: 'report',
  async authorize(request, context) {
    const grants = await context.grants.resolve({
      principal: request.principal,
      subjects: request.subjects,
      resource: request.resource,
      action: request.action,
    });
    return { effect: grants.length ? 'permit' : 'deny', reasons: [] };
  },
});
await authorization.permissionSets.create(
  permissionSet('report-reader')
    .title('Report reader')
    .grant({
      resource: { type: 'report', id: 'sales' },
      actions: [{ action: 'view' }],
    })
    .build(),
);
await authorization.permissionSets.assign({
  permissionSet: 'report-reader',
  subject: { type: 'user', id: 'alice' },
});
const scope = authorization.for({ principal: { type: 'user', id: 'alice' } });
await scope.require({
  resource: { type: 'report', id: 'sales' },
  action: 'view',
});
```

The principal is the authenticated actor; `subjects` adds verified memberships such as teams. The principal also participates in grant matching. Subject IDs are literals, including the `*` in `authenticated:*`; resource IDs can use `*` as a wildcard. A manually constructed `for(identity)` uses the supplied identity: resolve and include memberships yourself.

| Request-scope API                          | Result and use                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `authorize({ resource, action, params? })` | Full decision: `permit`, `deny`, or `conditional` with `conditions`                                   |
| `explain(request)`                         | Full decision with reasons and contributing sources                                                   |
| `can(request)`                             | Boolean; composed resource checks report feature availability, not record access                      |
| `require(request)`                         | Throws `AuthorizationDeniedError` on denied or conditional access; use for unconditional capabilities |
| `permissions()`                            | Client visibility snapshot with `unrestricted` and permissions; not an executable data policy         |

Create one scope per request. Its grant and constraint caches are shared by underlying composed checks; reuse that scope within the request, never across identities or requests. Execute conditional decisions only through the resource adapter that understands their conditions. Unknown types, invalid conditional decisions and handler failures deny access.

## Registries and extension APIs

| API                                                                    | Responsibility                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `resourceTypes.add(handler)`                                           | Register a handler with `resourceType`, `authorize`, optional `authorizeUnrestricted`      |
| `getResource(type).items.add(item)`                                    | Add flat resource metadata for that handler                                                |
| `resourceGroups.add({ name, title, category? })`                       | Flat `business` or `administration` groups                                                 |
| `resources.add(definition)`                                            | Declare user-facing operations, underlying grants and named scopes                         |
| `defineAuthorizationResource(name, configure)`                         | Immutable typed resource builder; `.register(authz.resources)`, `.reference()`, `.build()` |
| `defineRecordAccess(key, configure)` / `recordAccess.add(policy)`      | Define/register a reusable record-scope strategy                                           |
| `subjects.define(type, definition)`                                    | Register `filterActive(ids, transaction?)` and `resolveFor(principal)`; returns cleanup    |
| `subjects.resolveFor(principal)`                                       | Resolve active inherited subjects                                                          |
| `use(middleware)` / `middleware()`                                     | Resolve HTTP identity, then attach request scope as `context.get('authz')`                 |
| `guard(requestOrFactory)`                                              | Middleware using `require`; install identity middleware first                              |
| `onGrantsChanged(listener)`                                            | Subscribe to grant-provider changes; returns unsubscribe                                   |
| `routes.add(path, handler)` / `routes.list()` / `routes.handle(input)` | Dispatch plugin Fetch handlers; unmatched paths return `undefined`                         |
| `permissions.handler({ request, authorization })`                      | Fetch handler for the current request's visibility snapshot                                |
| `describe()`                                                           | Registered plugins, resource types and constraint resolvers                                |

An `AuthorizationPlugin` supplies `id`, optional `authorizationApi` and `setup(authz)`. The host's optional `connection` is passed through to plugins. Grant providers resolve grants and may implement request scoping, unrestricted access and change subscriptions; constraint resolvers add scope constraints. Plugin extensions use the exported `AuthorizationPlugin`, `AuthorizationGrantService` and `AccessConstraintResolver` contracts. An unrestricted identity bypasses grants and rule constraints, but a resource handler's `authorizeUnrestricted` can still validate the resource/action and produce execution conditions.

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

`permissionSets({ store, rootSet, defaultSet })` optionally declares protected sets. `rootSet` accepts a key or `{ key, assignableTo?, requireActiveAssignment? }`; it permits assignment/revocation, grants unrestricted access and normally requires a remaining active assignment. `defaultSet` permits content updates. These options declare protection, not initial records or audience assignments. NocoBase's application plugin seeds/configures those separately.

Generic HTTP management rejects changes to a protected key, even if content updates are allowed. Owner-side service calls are trusted and bypass generic `assertWritable` checks. `requireActiveAssignment` and `assignableTo` are enforced by assignment APIs. Relevant failures include `PermissionSetProtectedError`, `PermissionSetLastAssignmentError` and `PermissionSetSubjectNotAllowedError`.

A Store implements `withTransaction(transaction)`; persistent Stores should implement `transaction(run)` and `lock(key)` for safe concurrent revocation. `revoke` and `replaceSubjectAssignments` then lock protected sets before reading assignments, check and write in one transaction, and notify after commit. `filterActive` must use the supplied transaction when checking subject validity. When binding an external transaction, the caller owns commit and notification:

```ts
const subject = { type: 'user', id: userId };
await database.transaction(async (connection) => {
  const sets = authorization.permissionSets.withTransaction(connection);
  await sets.assertSubjectRemovable(subject);
  await disableUser(connection, userId); // Application-owned mutation.
});
await authorization.permissionSets.notifyAssignmentsChanged(subject);
```

Never separate the removal check from the user mutation's transaction. A custom Store without transactional locking cannot promise safe concurrent last-administrator protection.

## Optional record-scope rules

Default access, sharing and restrictions require separate App plugins. Follow [capability discovery](optional-capabilities.md) and the owning installed Skill for implementation, APIs and seeds. Core library exports alone do not establish an installed App capability.
