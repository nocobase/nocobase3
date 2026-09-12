# JSON Integration Tests

These tests cover the portable JSON value contract for Repository and Query:

- object and array values, including nested scalar values
- scalar JSON values such as strings, numbers, booleans, and `null`
- nullable fields and database `NULL`
- Repository create, read, and update operations
- Repository `createMany` and `updateMany` operations
- Query insert, select, and update operations
- Query scalar subquery selections
- Repository relation selections

JSON filter operators live under
`tests/integration/repository/capabilities/` because they are a separate
database capability from JSON value storage.
