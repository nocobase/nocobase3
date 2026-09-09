---
name: nocobase-app-plugin-users
description: Integrate the Users plugin into a NocoBase App, configure its page placement and permissions, or add an application-owned role scope through the public Server contracts.
metadata:
  short-description: Integrate reusable user administration
---

# User Management App Plugin

Use this Skill when an application needs a user management page or API, or when
another plugin needs to expose application-specific roles in the Users page. Do
not use it to modify the Users plugin source or to replace Authentication's
user, account, or Session storage.

## Public surfaces

- Client registration factory and `UsersClientOptions`:
  `@nocobase/app-plugin-users/client`.
- Typed API client: `UsersClient` and its types from
  `@nocobase/app-plugin-users/client/user-client`.
- Server contracts: `userManagementServiceToken`,
  `userRoleScopeRegistryToken`, `UserRoleScope`, and related types from
  `@nocobase/app-plugin-users/server/tokens`.
- HTTP API: `/api/users`, `/api/users/options`, and the user-specific update,
  enable, disable, role-scope, password-reset, and Session-revocation routes.

Every HTTP route requires Authentication and Authorization. Routes check a
`user` resource with one of `read`, `create`, `update`, `disable`, `enable`,
`assign-role`, `reset-password`, or `revoke-sessions`. Account creation checks
both `create` and `assign-role`.

## Register and place the page

1. Register Authentication, Authorization, and then Users in the App's Client
   and Server plugin arrays.
2. Configure the Client factory. `users({ mount: 'settings', path: '/users' })`
   produces `/settings/users`; `mount: 'app'` makes the path App-relative and
   registers a primary-navigation entry protected by the same page access rule.
   Set `navigationParent` when the App groups that entry below another resource,
   and `navigationOrder` when the host navigation supports an explicit sibling order.
3. Grant `page:users/access` to roles that may open the page.
4. Grant only the `user` actions those roles need. The plugin creates no roles
   and grants no access by itself.
5. Use `componentLoader` only to replace the page implementation. It does not
   change the route identity, mount, or path.

## Add an application role scope

Resolve `userRoleScopeRegistryToken` in an application or business plugin
ServiceProvider and register one `UserRoleScope` during `boot()`. The scope owns
its available options, current assignment lookup, role filtering, atomic
replacement, and any disable guard. Unregister it during `shutdown()`.

Use the `DatabaseConnection` passed to each scope method. This is the
caller-owned transaction used to keep account creation or state changes atomic
with role assignments. Do not open an unrelated transaction and do not write
Authentication's internal tables.

For a required single-role scope, set `selection: 'single'` and
`requiredOnCreate: true`. Reject invalid values in the scope and enforce
business invariants such as the last-administrator rule on the server.

## Ownership

- Authentication owns user identity, credentials, account state, password
  hashing, and Sessions.
- Authorization owns Permission Sets, grants, and assignments.
- Users owns the management API, built-in page, orchestration transaction,
  `user` authorization handler, and role-scope registry.
- The App or business plugin owns role definitions, role grants, assignments,
  page placement, and role-specific invariants.
- The plugin's `skills/` source is authoritative. `.agents/skills/` is a
  synchronized copy and must not be edited.

## Permissions and constraints

- Browser route access is only navigation control. The Server independently
  authenticates and authorizes every request.
- An App-mounted page hides its primary-navigation entry until
  `page:users/access` is allowed. Direct navigation is checked separately by
  the Client Route.
- A conditional grant is not accepted as an unrestricted user-management
  grant; use explicit static grants for this resource.
- The plugin does not provide user deletion or invitations.
- Disabled users are rejected by Authentication and lose their existing HTTP
  Sessions and Realtime connections.
- Password hashes, Session tokens, reset tokens, and submitted passwords are
  never returned by the service or included in security events.

## Verification

- A role without `page:users/access` cannot navigate to the page.
- Anonymous API requests return `401`; authenticated requests without the
  requested `user` action return `403`.
- Creating a user with a required role scope creates both records, while role
  assignment failure rolls back the user.
- Disabling a user invalidates HTTP Sessions and Realtime connections; enabling
  the user requires a new login.
- Role changes become visible after transaction commit and do not alter
  assignments outside the registered scope.
- The target App passes its relevant tests, typecheck, and build. Skill
  synchronization alone proves only that the copy matches this source.
