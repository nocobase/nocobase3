---
'@nocobase/app-plugin-users': major
'@nocobase/app-plugin-authentication': major
'@nocobase/app-plugin-user-management': minor
'@nocobase/app-plugin-hub': minor
'@nocobase/app-plugin-notification-in-app': patch
'@nocobase/db': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Split the user record from authentication and move user administration into its own package.

`@nocobase/app-plugin-users` now owns the user record: `userServiceToken`, the storage contract Better Auth reads and writes users through, identity normalization, soft-delete filtering, `lockUser`, and a lifecycle registry (`userLifecycleToken`) that runs registered `before` and `after` handlers inside the transaction that disables or deletes a user. Deletion is off until an application enables `users.deletion` with the handlers it requires. The former management page, API, role scopes, and client entries moved unchanged to the new `@nocobase/app-plugin-user-management` package; `UserRoleScope` lost its `assertCanDelete`, `onDelete`, and `assertCanDisable` methods in favour of lifecycle handlers.

`@nocobase/app-plugin-authentication` no longer exports `userAdministrationServiceToken`, `UserAdministrationService`, `UserAdministrationError`, or `lockUserForAdministration`. Credentials and sessions are operated through `authenticationCredentialServiceToken`, and the plugin registers the `authentication.credentials` lifecycle handler that revokes sessions and removes accounts. `Auth.administrationContext` is now `Auth.credentialContext`.

`@nocobase/db` transactions expose `inTransaction` and `afterCommit(effect)`; effects registered in a savepoint run only after the root transaction commits and a failing effect surfaces as `TransactionPostCommitError` with `committed: true`.

Hub registers its deletion rules as the `hub.ownership` lifecycle handler and enables deletion in its template configuration. Applications built from the templates register `@nocobase/app-plugin-user-management` on both runtimes and import its client entry instead of `@nocobase/app-plugin-users/client`. The historical migrations that created the `user` table remain in authentication; installing users without authentication is not yet supported.
