# @nocobase/queue

## 0.1.0-beta.4

### Patch Changes

- 028dd7c: Use host-provided peers for shared database types, authorization errors, service tokens, cache registries, and repository filter metadata. Declare their production providers in all application templates so deployments with automatic peer installation disabled retain the required runtime packages. Document the provider contract for generated plugins.

  Existing applications upgrading these packages must add compatible versions of their required shared peers to production dependencies: @nocobase/db, @nocobase/service-provider, @nocobase/repository-input, @nocobase/authorization, @nocobase/caching, @nocobase/i18n, and @nocobase/queue for the standard server stack, plus @nocobase/ai-employee when using its plugin. Update the lockfile and verify the production install; peer declarations do not remove incompatible historical versions automatically.

- Updated dependencies [028dd7c]
  - @nocobase/db@1.0.0-beta.8

## 0.1.0-beta.3

### Patch Changes

- Updated dependencies [174eab5]
  - @nocobase/db@1.0.0-beta.2

## 0.1.0-beta.2

### Minor Changes

- ac3f033: Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.

### Patch Changes

- Updated dependencies [948304d]
- Updated dependencies [ac3f033]
  - @nocobase/logging@0.1.0-beta.3

## 0.1.0-beta.1

### Minor Changes

- 7cdffbd: Add explicit `server/plugin.ts` definitions for Providers, API routes, root routes, database sources, and queue jobs. Register routes in a dedicated Application phase after Provider boot, add reusable HTTP and runtime composition helpers to their owning packages, and remove the default template's duplicate runtime layer and legacy plugin discovery contract.

### Patch Changes

- ce4eab8: Add a focused ServiceProvider plugin example with a tokenized heartbeat
  service, lifecycle management, and an HTTP status route. Pass the Application
  directly to providers and standardize service access through `app.container`.
- Updated dependencies [ce4eab8]
- Updated dependencies [7cdffbd]
  - @nocobase/logging@0.1.0-beta.2
  - @nocobase/service-provider@0.0.2-beta.0
  - @nocobase/app-database@0.0.1-beta.1

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
- Updated dependencies [da1b1b0]
  - @nocobase/app-database@0.0.1-beta.0
