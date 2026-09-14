# @nocobase/repository-input

## 0.1.0-beta.1

### Patch Changes

- ceb356b: Support exact BIGINT and DECIMAL string filters, validate plain integer writes before SQL execution, and preserve numeric atomic-update operands without floating-point promotion. Reject SQLite int64 arithmetic overflow before storage and retain native PostgreSQL/MySQL read and aggregate behavior.
- ceb356b: Unify aggregate result types using native PostgreSQL/MySQL behavior. COUNT returns a safe integer number and rejects values above Number.MAX_SAFE_INTEGER. SUM/AVG of integer, BIGINT and DECIMAL fields return database-formatted strings; FLOAT/DOUBLE SUM/AVG return numbers. MIN/MAX preserve field result types. Do not strip trailing zeros. Preserve nulls, numeric filtering, ordering, grouping, aliases and relation aggregates.

  Remove PostgreSQL AVG input casts and accept native computation and rounding. SQL Server promotes integral SUM/AVG inputs to DECIMAL(38,0), retains native DECIMAL precision rules, and preserves exact outputs before driver conversion. SQLite retains exact aggregates for integral/decimal fields while floating fields use native aggregation. Prepare aggregate field information only on adapters that need it, once per execution; PostgreSQL/MySQL do not load collections for numeric adaptation. Broaden shared SUM/AVG TypeScript results to string | number | null.

- c960d07: Add the Repository Policy read model: policy types, scope normalization, scope
  pushdown into the query, and field and relation allowlists enforced across
  every read surface — select, filter, sort, distinct, cursor, aggregate and
  group by, including the returning select of a write and each relation branch,
  which is judged by its own collection's allowlist and narrowed by its own
  scope.

## 0.1.0-beta.0

### Minor Changes

- 90a4903: Add portable Repository AST and mutation input builders shared by browser and server clients. Support synchronous builder callbacks and complete JSON options helpers for all nine remote Repository actions, including nested selections, relation mutations, and numeric updates. Preserve relation create client keys through an explicit JSON envelope and reject unserializable builder inputs before sending requests.

### Patch Changes

- 90a4903: Add server-owned writePolicy for single and bulk creates/updates, root upserts and
  mutation preflight. Internal Repository calls default to true. Explicit policies
  restrict scalar fields, each relation operation, nested create/update/upsert branches
  and through payloads before any writes. Add buildWritePolicy, buildUpsertWritePolicy
  and synchronous callback input, frozen snapshots and structured policy errors.

  Replace defineRepositoryApiRoutes action arrays with configuration objects and move
  maxLimit to actions.findMany. API create/update actions default to writePolicy false
  and require explicit allowlists; true and client-supplied policies are rejected.
  Return HTTP 403 for forbidden writes and migrate the Repository example's routes,
  fixtures and integration guidance to field and relationship policies.

## 0.0.1

### Patch Changes

- Add shared, portable Repository input contracts and JSON builders.
