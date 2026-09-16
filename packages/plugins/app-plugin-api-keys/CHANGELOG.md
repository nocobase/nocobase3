# @nocobase/app-plugin-api-keys

## 0.1.0-beta.1

### Patch Changes

- a60decd: Require an explicit absolute baseDir for Server plugins and resolve migrations, seeds, jobs, and package metadata from the loaded plugin copy. Generate and validate database task manifests during builds so TypeScript and JavaScript share source checksums, with verified legacy JavaScript history conversion and synchronized plugin scaffolding and application templates.
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [a60decd]
- Updated dependencies [1a85a86]
- Updated dependencies [1c70f60]
- Updated dependencies [63db898]
  - @nocobase/app-server@1.0.0-beta.15
  - @nocobase/db@1.0.0-beta.7
  - @nocobase/app-plugin-authentication@0.1.0-beta.14
  - @nocobase/app-client@1.0.0-beta.16
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.0

### Minor Changes

- 154e09e: Add `@nocobase/app-plugin-api-keys`, which lets scripts and integrations call an application's API as the user who issued the key.

  The package is Better Auth's API Key plugin plus the parts an application needs around it: the `apikey` table migration, a self-service Settings page where each user creates and revokes their own keys, and `apiKey` and `apiKeyClient` carrying Better Auth's own names and options. `apiKey` is wrapped only to supply three defaults, all of them overridable; its documentation applies unchanged.

  The re-export is what keeps the migration honest. That table has to match the schema the installed `@better-auth/api-key` declares, so both come from one package rather than from a dependency each application pins separately; a test asserts the table carries a column for every field the plugin declares.

  Configured in `auth.plugins`, `Auth.getSession()` resolves an `x-api-key` header the same way it resolves a session cookie, so `auth.required()`, the route guards, and Authorization all see the owning user and exactly the roles that user holds. No application route needs to know a request arrived by key.

  The three defaults are `enableSessionForAPIKeys: true`, `rateLimit: { enabled: false }` and `requireName: true`. The first is the one that has to be set: Better Auth defaults it off, and with it off a key authenticates nothing — the page still issues keys and every request carrying one answers 401, with nothing pointing at the configuration. The second avoids the upstream default of 10 requests per key per day, which is a quota for issuing keys rather than for using them. Supplying them here rather than in each application's auth config is what keeps a required setting from being something an application can silently get wrong.

  A key is its owner, so it also reaches the Better Auth endpoints a session reaches — including `/api-key/create`, which means a key can mint a successor with its own expiry that revoking the first key does not revoke. Revoking a leaked key means reviewing the owner's whole list. An application that wants that closed adds its own `before` hook.

### Patch Changes

- Updated dependencies [154e09e]
- Updated dependencies [154e09e]
- Updated dependencies [c01baf6]
  - @nocobase/app-plugin-authentication@0.1.0-beta.12
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/app-client@1.0.0-beta.15
  - @nocobase/app-server@1.0.0-beta.13

## 0.0.1

### Patch Changes

- Add the initial plugin scaffold.
