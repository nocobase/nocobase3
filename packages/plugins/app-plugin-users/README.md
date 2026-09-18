# @nocobase/app-plugin-users

Reusable user administration for NocoBase applications. The plugin provides a
Settings or App page, authenticated and authorized HTTP APIs, and a role-scope
extension point. Authentication remains the source of user and session data;
applications and business plugins remain responsible for roles and grants.

## Register the plugin

Register Authentication and Authorization before Users on both runtimes:

```ts
// client/plugins.ts
users({ mount: 'settings', path: '/users' });

// server/plugins.ts
users;
```

The default route is `/settings/users`. Set `mount: 'app'` to mount the same
owned route under the App and add its protected primary-navigation entry. The
route and navigation use the same `page:users/access` check. Provide
`componentLoader` to replace only the page implementation without changing its
identity, path, or navigation.

The application must grant `page:users/access` and the required `user` actions.
Users does not create roles or grant access by itself.

## Server contracts

- `userManagementServiceToken` provides list, create, update, enable, disable,
  password reset, Session revocation, and role-scope replacement operations.
- `userRoleScopeRegistryToken` lets an application plugin expose its own role
  choices and assignment implementation through `UserRoleScope`.
- Role options may be marked non-assignable or non-removable when a scope needs
  to display protected assignments without letting the Users page change them.
  A scope can also declare that authenticated-subject defaults apply separately
  so the page does not present inherited access as a direct user role.
  Application-owned labels can provide an i18n key and namespace while keeping
  the plain label as a fallback.
- Scopes backed by a shared assignment store should implement optional
  `getMany()` so one user-list page does not issue one role query per user.
- All `/api/users/*` routes require an authenticated session and a matching
  `user:<id>:<action>` grant. Creating a user requires both `create` and
  `assign-role`.

Authentication owns the `user`, `account`, and `session` tables. This plugin
uses Authentication's public administration service and never duplicates or
directly owns those records. Creating a user and assigning application roles
uses one database transaction. Password reset and database Session revocation
also share a transaction, so a revocation failure does not leave the new
password committed. Duplicate administrator-created emails or usernames return
a stable `409` conflict instead of exposing a database error.

## Client contract

`UsersClient` is available from
`@nocobase/app-plugin-users/client/user-client` for App-owned UI that needs the
same API contract. The built-in page supports pagination, search, status and
role filters, account editing, enable/disable, password reset, Session
revocation, and application-provided role scopes. Empty scopes are shown as
unassigned rather than silently disappearing from the user row.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-users lint
pnpm --filter @nocobase/app-plugin-users typecheck
pnpm --filter @nocobase/app-plugin-users test
pnpm --filter @nocobase/app-plugin-users build
```

## Authorization subject selector

When authorization is installed, the plugin registers the `user` subject type with its active-account filter and an administration selector. Searches reuse the user administration service with server-side pagination and return enabled accounts. Name resolution queries the requested IDs, including disabled accounts already referenced by a saved rule. Both callbacks require `user` resource read permission before querying; the authorization plugin separately checks settings-page access and assignment writes.

## Permission-set integration

When the authorization plugin is installed, Users automatically registers the `app` permission-set scope. No application Provider is needed. Set `users.permissionSets: false` in application configuration when providing a replacement scope, as Hub does. Direct assignments remain separate from permissions inherited through authenticated users or other subjects. Protected unrestricted assignments cannot be changed through this scope.

The Settings page uses a searchable selection list for both user creation and the assignment drawer. Changes are saved together; labels use permission-set presentation metadata and update with the client locale while custom titles remain unchanged.
