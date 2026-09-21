---
name: nocobase-app-plugin-users
description: Read or change NocoBase user records from server code, take part in the user disable and delete lifecycle from another plugin, or enable and configure user deletion for an application.
metadata:
  short-description: User records and their lifecycle
  domain-owner: '@nocobase/app-plugin-users'
---

# Users

`@nocobase/app-plugin-users` owns the NocoBase user record: the `User` type, identity normalization and uniqueness, `disabledAt`, `deletedAt` and `deletedBy`, soft-delete filtering, the user lock, and the lifecycle registry. It does not own passwords, accounts, sessions, Better Auth flows, the management page, or role assignment. Use `nocobase-app-plugin-authentication` for credentials and sessions and `nocobase-app-plugin-user-management` for the administration page and API.

## Public surfaces

From `@nocobase/app-plugin-users/server`:

- `userServiceToken` resolves `UserService`: `get`, `require`, `create({ name, email, username? })`, `updateProfile`, `enable`, `disable`, `remove(userId, actorId?)`, `withConnection`. Creation has no password and no roles.
- `userLifecycleToken` resolves `UserLifecycleRegistry`: `register(handler)`, `deletionReady()`, `assertDeletionReady()`.
- `UserLifecycleHandler` with `key`, optional `order`, `before(context)` and `after(context)`; `UserLifecycleContext` carries `operation` (`disable` or `delete`), `userId`, `actorId` and the transaction `connection`.
- `createUserStore`, `lockUser`, `toUser`, `UserError`, `UserLifecycleError`.

## Change a user from server code

Resolve `userServiceToken`. Errors are `UserError` with a stable `code`; map `USER_NOT_FOUND` to 404 and conflicts to 409. Disabling or deleting a user runs every registered lifecycle handler in the transaction that writes the status, so do not revoke sessions or clean up again afterwards. Call `withConnection` when the change must commit together with other rows.

## Take part in the lifecycle

Register a handler with a stable key during your Provider's `boot()` and release it in `shutdown()`. Put checks that may reject the operation in `before`; it runs once the user row is locked. Put your own database cleanup in `after`; it runs in the same transaction after the status is written, so a failure rolls the whole change back. Anything that must wait for the commit, such as disconnecting a realtime client, goes through `context.connection.afterCommit`. Never use `actorId` from a request body; the service receives it from an authenticated entry point.

## Enable deletion

Deletion is off by default. Set `users.deletion` in application configuration with `enabled: true` and the `requiredHandlers` the application depends on, for example `authentication.credentials` and `hub.ownership`. The users Provider verifies those handlers during the ready phase and the application fails to start when one is missing. Management entries still decide their own policy, such as refusing self-deletion.

## Constraints

- Do not write the `user` table directly from another plugin; go through the service or the store.
- Historical migrations that created the `user` table stay in `@nocobase/app-plugin-authentication` and are never edited. New user columns are added by migrations in this plugin.
- A post-commit failure surfaces as `TransactionPostCommitError` with `committed: true`. Retry the effect, never the user write.
