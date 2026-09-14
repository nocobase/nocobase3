# @nocobase/config

## 0.1.0-beta.1

### Minor Changes

- f17f3a6: Support TypeScript authentication options in application templates and use the native authentication client. Keep authentication plugins and callbacks in editable server and client configuration, with YAML as the default format for deployment settings.

  Runtime assembly now prepares complete configuration before application creation. Module configuration factories use defineAppConfig and defaultAppConfigs, receive the runtime once, and retain their defaults when environment configuration reloads.

## 0.0.2-beta.0

### Patch Changes

- ac3f033: Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.

## 0.0.1

- Add a koanf-inspired configuration container with composable providers and parsers.
