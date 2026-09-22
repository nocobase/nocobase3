# @nocobase/db-testkit

## 0.0.2-beta.1

### Patch Changes

- 24e771f: Remove circular development dependencies between the database core, shared testkit, and dialect packages. Move runnable database examples, the playground, and benchmarks to repository development tools.
- Updated dependencies [24e771f]
- Updated dependencies [26ac480]
  - @nocobase/db@1.0.0-beta.9

## 0.0.2-beta.0

### Patch Changes

- ceb356b: Improve Dameng integration compatibility for typed numeric query results, streaming rows, temporal projections, default-only inserts, schema capability warnings, and native constraint error messages.
- ceb356b: Distinguish native numeric results from dialect support for insert returning in the integration profile.
- 35f9722: Give every dialect package a `check` script.

  `db-sqlite`, `db-mysql`, `db-oracle`, `db-mssql` and
  `db-testkit` gain the `check` script the other dialect packages already had;
  `db-testkit` also typechecks its unit and integration trees there, which its
  base `typecheck` does not cover.

- ceb356b: Describe JSON default support in dialect integration profiles and avoid
  misclassifying OceanBase expression defaults as generated columns.
- ceb356b: Make dialect integration tests own their disposable Docker Compose environments
  with random host ports and automatic cleanup.
- ceb356b: Add explicit `--test-file` selection and `--pause-on-failure` support to database integration test commands.
- ceb356b: Declare runtime imports in the published package dependencies.
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [590861e]
- Updated dependencies [e11b855]
- Updated dependencies [72ed008]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [e11b855]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [590861e]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
  - @nocobase/db@1.0.0-beta.5

## 0.0.1

### Minor Changes

- Add shared database contract types and integration test helpers for NocoBase dialect packages.
