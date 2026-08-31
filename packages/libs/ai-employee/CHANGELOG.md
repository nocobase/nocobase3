# @nocobase/ai-employee

## 0.1.0

### Minor Changes

- Refactor AI Employee into a framework-neutral core runtime with reusable managers, loaders, providers, contracts, repositories, and file managers.
- Remove application-specific and redundant `Runtime*` public types, and expose the native `@nocobase/caching` and `@nocobase/logging` types from Core APIs instead.

### Patch Changes

- Remove the obsolete document manager, its public API, and the direct FlexSearch dependency.
