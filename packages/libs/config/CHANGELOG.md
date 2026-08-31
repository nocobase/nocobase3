# @nocobase/config

## 0.0.2-beta.0

### Patch Changes

- ac3f033: Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.

## 0.0.1

- Add a koanf-inspired configuration container with composable providers and parsers.
