# DECIMAL string result tests

`reads.test.ts` checks the same types and exact values (allowing native decimal formatting) on PostgreSQL, MySQL, SQLite,
Oracle, and SQL Server. No test is skipped by dialect. Coverage includes
ordinary values and nulls, aliases, selectAll, scalar subqueries, MIN/MAX,
transactions, creation/defaults/update results, native streaming, streamed
relations, joins, groupBy, numeric ordering, DISTINCT and relation pagination.

The high-significance sample `100000000000000.25` is exactly representable
in SQLite REAL, so it can detect result conversion truncation on all five
engines without pretending SQLite has arbitrary-precision decimal storage.
Previously rounded stored values remain rounded. Numeric type comparisons
with INTEGER and BIGINT live in [numeric-types.test.ts](../bigint/numeric-types.test.ts).

```sh
# From packages/libs/db, with all four test services running and Node 24:
INTEGRATION_DB_CONNECTIONS=all pnpm exec vitest run tests/integration/decimal tests/integration/bigint
```

`native-results.test.ts` also verifies PostgreSQL/MySQL preserve trailing zeros,
execute decimal reads and MIN/MAX without extra metadata SQL or text casts, and
PostgreSQL creation returns decimal defaults without an extra SELECT. All five
databases execute these tests; SQLite uses an exactly representable fixture.
