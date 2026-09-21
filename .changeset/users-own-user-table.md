---
'@nocobase/app-plugin-users': minor
'@nocobase/app-plugin-authentication': minor
'@nocobase/app-plugin-hub': patch
'@nocobase/app-plugin-notification-in-app': patch
---

Move ownership of the `user` table to `@nocobase/app-plugin-users`.

The users plugin now registers `userStoreToken`, the storage contract authentication declares, and Better Auth reads and writes its `user` model through it: identity normalization, uniqueness checks and soft-delete filtering apply to every path, and a soft-deleted user no longer resolves a cached session. `userAdministrationServiceToken`, `UserAdministrationService`, `AdministratedUser`, `UserAdministrationError` and the user lock (now `lockUser`) moved from `@nocobase/app-plugin-authentication` to `@nocobase/app-plugin-users/server`; authentication keeps passwords, credential accounts and sessions behind the new `userAuthenticationServiceToken` (`UserAuthenticationService`, `UserAuthenticationError`). Applications that imported the administration service from authentication change the import path; management URLs, the API, client entries and configuration are unchanged, and no migration runs. The historical migrations that created the `user` table stay in authentication; new user columns are added by the users plugin.
