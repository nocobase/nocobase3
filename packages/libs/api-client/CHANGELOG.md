# @nocobase/api-client

## 0.1.0-beta.0

### Minor Changes

- 90a4903: Support asynchronous iteration of remote Repository `findMany` queries over framed NDJSON while preserving array consumption through `await`.
- 90a4903: Add portable Repository AST and mutation input builders shared by browser and server clients. Support synchronous builder callbacks and complete JSON options helpers for all nine remote Repository actions, including nested selections, relation mutations, and numeric updates. Preserve relation create client keys through an explicit JSON envelope and reject unserializable builder inputs before sending requests.
- 90a4903: Expose opt-in aggregate and groupBy Repository HTTP actions with JSON AST validation, grouped filters and sorting, and lossless BigInt result serialization. Add matching remote Repository methods and public types. Switch the aggregate example to the generic authenticated endpoints and display its actual Repository requests.

### Patch Changes

- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
  - @nocobase/repository-input@0.1.0-beta.0

## 0.0.1

### Patch Changes

- Add a lightweight HTTP client with JSON, raw body, streaming, and remote Repository APIs.
