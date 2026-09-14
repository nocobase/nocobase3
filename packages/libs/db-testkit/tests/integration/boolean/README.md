# Boolean Integration Tests

These tests cover the portable boolean value contract for Repository and Query:

- `true`, `false`, and nullable `null` values
- Repository create, read, and update operations
- Repository `createMany` and `updateMany` operations
- Query insert, select, update, and boolean filters
- Query aliased selections and scalar subqueries
- Repository relation and nested relation selections

Database-specific storage such as `0`/`1` is an internal representation. The
Repository and Query APIs expose JavaScript booleans.
