# @nocobase/app-plugin-notification-in-app

## 0.2.0-beta.4

### Minor Changes

- cee3251: Add authenticated realtime subscriptions, refresh their identity after authentication changes, and invalidate in-app notification state through user-scoped events.

### Patch Changes

- Updated dependencies [8d88ff4]
- Updated dependencies [813da59]
- Updated dependencies [cee3251]
  - @nocobase/app-server@1.0.0-beta.6
  - @nocobase/i18n@1.0.0-beta.2
  - @nocobase/app-plugin-authentication@0.1.0-beta.6
  - @nocobase/app-plugin-notification@0.1.0-beta.3
  - @nocobase/db@1.0.0-beta.2
  - @nocobase/service-provider@0.0.2-beta.1

## Unreleased

### Minor Changes

- Add the in-app test adapter with authenticated-user defaulting, keep the inbox
  API available when the core notification Server plugin is not registered,
  and fail fast when the required database service is missing. The package
  still requires the core package for its shared extension contracts.

## 0.2.0-beta.3

### Minor Changes

- 1527426: Declare identity-sensitive runtime packages as peer dependencies of every plugin.

  A plugin used to list `@nocobase/app-server`, `@nocobase/db`, `@nocobase/service-provider`, `@nocobase/i18n`, `@nocobase/queue`, `@nocobase/app-portal-sdk`, and the plugins it builds on among its `dependencies`. Each of these carries state that only works while exactly one copy of the module exists in the process: `ServiceContainer` keys its bindings by the token object itself, React contexts match only the provider created from the same module, and `@nocobase/queue` registers job classes into a global `Locator`. A `dependencies` range lets a package manager install a second copy to satisfy it, which splits that state.

  The monorepo could never show the problem, because `workspace:` links every consumer to one directory. It appears once a plugin is installed from a registry into an application, and it appears at runtime rather than at install time: a service that is registered reports `Service "..." is not registered`, or a context reads `undefined` under a mounted provider.

  Each of these packages is now a peer dependency paired with a devDependency. The peer is the published contract that makes the installing application provide the single copy; the devDependency pins this repository's copy for development and tests, which the deliberately wide peer range does not. Applications built from the templates are unaffected — they already install every one of these packages directly, which is what satisfies the new peer ranges.

  `pnpm plugin:create` generates the same shape, and `pnpm peers:check` enforces it in CI.

### Patch Changes

- 174eab5: Correct the `@nocobase/app-portal-sdk` range these Registry recipes declare. It named `^2.0.0`, a version the v3 package never had, so installing one of these recipes into an application could not resolve the dependency it needs for its v2 API calls.
- c64802c: Harden notification packaging, Provider error redaction, in-app pagination and input validation, migration coverage, Agent Skill safety, localization, and production demo-route defaults.
- Updated dependencies [174eab5]
- Updated dependencies [c64802c]
- Updated dependencies [1527426]
- Updated dependencies [174eab5]
- Updated dependencies [174eab5]
- Updated dependencies [c64802c]
  - @nocobase/app-server@1.0.0-beta.4
  - @nocobase/app-plugin-authentication@0.1.0-beta.5
  - @nocobase/app-plugin-notification@0.1.0-beta.2
  - @nocobase/db@1.0.0-beta.2
  - @nocobase/service-provider@0.0.2-beta.1

## 0.2.0-beta.2

### Minor Changes

- ac3f033: Export every server plugin from its package's `./server` entry point, and update application composition, plugin discovery, and generated plugins to use the unified entry point.

### Patch Changes

- fb1a752: Unify Client and Server application composition around the explicit `serviceProviders` contribution and rename Client React tree contributions to `reactProviders`.

  Replace Client bootstrap modules with application-owned ServiceProvider lifecycle hooks, make the default Client start through `ClientApplication` and render through the Browser host, and update built-in plugins and runtime inspection to the new static contribution protocol.

- Updated dependencies [948304d]
- Updated dependencies [78cf0a2]
- Updated dependencies [ac3f033]
- Updated dependencies [fb1a752]
- Updated dependencies [ac3f033]
- Updated dependencies [78cf0a2]
- Updated dependencies [fb1a752]
- Updated dependencies [fb1a752]
  - @nocobase/app-server-kit@0.1.0-beta.3
  - @nocobase/app-plugin-authentication@0.1.0-beta.4
  - @nocobase/app-plugin-notification@0.1.0-beta.1
  - @nocobase/session@0.1.0-beta.2
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.1-beta.1

### Patch Changes

- 7cdffbd: Replace separate API and root route arrays with one ordered `routes` contribution array. Route factories now receive the Application, create and return their own Hono router, and are mounted automatically at `/api` or the application root according to their definition.

  Standardize plugin server modules around `providers/index.ts` and `routes/index.ts` collection entries, `services/` domain implementations, and a stable `tokens.ts` public contract.

  Generated plugins now declare conventional database and queue contribution directories by default. Missing optional directories are ignored until executable migrations, seeds, or jobs are added.

  Generated plugins now include an App-facing starter Agent Skill under the package's `skills/` directory. Plugin registration and skill synchronization copy these package-owned Skills into registered applications' `.agents/skills/` directories.

  Unify Client page contributions behind one `routes` loader. Plugins now use `defineAppRoutes()` and `defineSettingsRoutes()` to add child Routes to the application's two built-in Client Routes, mirroring how Server plugins use `defineRootRoutes()` and `defineApiRoutes()` with the built-in Hono routers.

- 7cdffbd: Add explicit `server/plugin.ts` definitions for Providers, API routes, root routes, database sources, and queue jobs. Register routes in a dedicated Application phase after Provider boot, add reusable HTTP and runtime composition helpers to their owning packages, and remove the default template's duplicate runtime layer and legacy plugin discovery contract.
- Updated dependencies [b049266]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [ce4eab8]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [8438765]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
  - @nocobase/app-server-kit@0.1.0-beta.2
  - @nocobase/app-plugin-authentication@0.1.0-beta.3
  - @nocobase/service-provider@0.0.2-beta.0
  - @nocobase/session@0.1.0-beta.1
  - @nocobase/app-plugin-notification@0.0.2-beta.0
  - @nocobase/app-database@0.0.1-beta.1

## 0.1.1-beta.0

### Patch Changes

- Updated dependencies [c8f38c8]
- Updated dependencies [1a9732a]
  - @nocobase/app-plugin-authentication@0.1.0-beta.2

## 0.1.0

### Minor Changes

- 934d246: Add the in-app notification channel and database provider.
