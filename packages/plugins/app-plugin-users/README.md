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
owned route under the App, or provide `componentLoader` to replace only the page
implementation without changing its identity or path.

The application must grant `page:users/access` and the required `user` actions.
Users does not create roles or grant access by itself.

## Server contracts

- `userManagementServiceToken` provides list, create, update, enable, disable,
  password reset, Session revocation, and role-scope replacement operations.
- `userRoleScopeRegistryToken` lets an application plugin expose its own role
  choices and assignment implementation through `UserRoleScope`.
- All `/api/users/*` routes require an authenticated session and a matching
  `user:<id>:<action>` grant. Creating a user requires both `create` and
  `assign-role`.

Authentication owns the `user`, `account`, and `session` tables. This plugin
uses Authentication's public administration service and never duplicates or
directly owns those records. Creating a user and assigning application roles
uses one database transaction.

## Client contract

`UsersClient` is available from
`@nocobase/app-plugin-users/client/user-client` for App-owned UI that needs the
same API contract. The built-in page supports pagination, search, status and
role filters, account editing, enable/disable, password reset, Session
revocation, and application-provided role scopes.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-users lint
pnpm --filter @nocobase/app-plugin-users typecheck
pnpm --filter @nocobase/app-plugin-users test
pnpm --filter @nocobase/app-plugin-users build
```
