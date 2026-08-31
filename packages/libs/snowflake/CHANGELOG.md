# @nocobase/snowflake

The versions below were published as `@nocobase/id-generator`, the name this package carried until it was renamed to
`@nocobase/snowflake`. They are kept because they describe this same codebase; the `@nocobase/id-generator` releases they
name are not, and never will be, versions of `@nocobase/snowflake`.

## 0.1.0-beta.2

### Minor Changes

- ac3f033: Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.

## 0.0.1-beta.1

### Patch Changes

- ce4eab8: Add a focused ServiceProvider plugin example with a tokenized heartbeat
  service, lifecycle management, and an HTTP status route. Pass the Application
  directly to providers and standardize service access through `app.container`.
- Updated dependencies [ce4eab8]
  - @nocobase/service-provider@0.0.2-beta.0

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
