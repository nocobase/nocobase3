# Temporal Integration Tests

These tests cover the portable date and time value contract for Repository and
Query:

- `date`, `time`, `datetime`, and `datetimeTz` values
- canonical millisecond precision on reads
- nullable temporal fields and database `NULL`
- Repository create, read, update, `createMany`, and `updateMany`
- Query insert, select, update, and scalar subquery selections
- Repository relation selections with nested temporal fields

Database-specific temporal storage and driver-native `Date` values are internal
details. The Repository and Query APIs expose canonical strings.
