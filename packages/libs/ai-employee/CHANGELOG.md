# @nocobase/ai-employee

## 0.2.0-beta.2

### Patch Changes

- 8b18b47: Fixed knowledge-base document uploads in ESM applications, made parsed-document cache paths filesystem-safe, corrected embedding-model API requests and database boolean handling, and prevented non-image chat attachments from rendering as broken image previews.

## 0.2.0-beta.1

### Minor Changes

- 8d88ff4: Replace the public AI Employee LLM service filesystem loader with the application `config.yml` contract at `ai.llmServices`. Configured model entries use a simple label/value array and are converted internally to custom mode. The App plugin validates and synchronizes declarative service definitions at startup and on application-config reload while preserving repository-managed enabled state for matching services. The default App template includes a commented configuration example, and the App config validator supports unique object properties for rejecting duplicate service names.
- 81c6d6d: Replace the temporary AI file manager with metadata-aware, drive-backed file storage factories, configurable storage disks, and per-domain metadata repositories.

## 0.1.1-beta.0

### Patch Changes

- Updated dependencies [174eab5]
  - @nocobase/db@1.0.0-beta.2

## 0.1.0

### Minor Changes

- Refactor AI Employee into a framework-neutral core runtime with reusable managers, loaders, providers, contracts, repositories, and file managers.
- Remove application-specific and redundant `Runtime*` public types, and expose the native `@nocobase/caching` and `@nocobase/logging` types from Core APIs instead.

### Patch Changes

- Remove the obsolete document manager, its public API, and the direct FlexSearch dependency.
