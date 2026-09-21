# @nocobase/app-plugin-users

The user record of a NocoBase application: its type, identity constraints, status fields, soft deletion, locking, and the lifecycle other plugins take part in when a user is disabled or deleted. Authentication reads and writes users through this plugin; user management builds its page and API on it. This plugin has no page, no HTTP API, and no dependency on Better Auth, authorization, or user management.

## Register the plugin

Register Users before Authentication and User management in the server plugin list. There is no client plugin.

```ts
// server/plugins.ts
users;
```

## Server contracts

- `userServiceToken` resolves `UserService`: `get`, `require`, `create`, `updateProfile`, `enable`, `disable`, `remove`, and `withConnection` for a caller-owned transaction. Creation takes no password and no roles; deleted users read as `undefined`.
- `userLifecycleToken` resolves `UserLifecycleRegistry`. A plugin registers one `UserLifecycleHandler` with a stable key during `boot()` and releases it during `shutdown()`. `before` runs after the user row is locked and may reject the change; `after` runs in the same transaction once the status is written. Effects that must wait for the commit use `connection.afterCommit`.
- `createUserStore` is the storage contract authentication's database adapter uses for the Better Auth `user` model: typed conditions, field selection, sorting, paging, counting, and the same normalization, uniqueness, and soft-delete filtering as the service. Every status write through it runs the lifecycle, so no path bypasses the registered protections.
- `lockUser(connection, userId)` serializes a user's deletion with the creation of resources that user owns. Call it inside a transaction.
- `UserError` carries `USER_NOT_FOUND`, `USER_EMAIL_CONFLICT`, `USER_USERNAME_CONFLICT`, or `USER_IDENTITY_CONFLICT`. `UserLifecycleError` carries a handler's own code and HTTP status.

Emails and usernames are trimmed and lower-cased; a friendly conflict is raised before the write and the database unique index remains the guarantee under concurrency. A soft-deleted user keeps its email and username reserved.

## Deletion policy

Deletion is off until the application enables it:

```ts
// server/config/users.ts
deletion: {
  enabled: true,
  requiredHandlers: ['authentication.credentials', 'hub.ownership'],
},
```

`requiredHandlers` names the lifecycle participants that must be registered before any deletion runs; an application that enables deletion without them fails to start. A deletion through any path with the policy off is rejected with `USER_DELETION_NOT_CONFIGURED`.

## Data ownership

This plugin owns the runtime contract for the `user` table. The historical migrations that created and extended that table live in `@nocobase/app-plugin-authentication` and are never edited; new user columns are added by migrations in this plugin. Installing this plugin without authentication is not yet supported.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-users lint
pnpm --filter @nocobase/app-plugin-users typecheck
pnpm --filter @nocobase/app-plugin-users test
pnpm --filter @nocobase/app-plugin-users build
```
