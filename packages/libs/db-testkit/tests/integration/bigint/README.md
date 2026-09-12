# BIGINT Integration Tests

This directory groups BIGINT precision tests across public APIs and database
drivers. Each test runs against the databases selected by
`describeIntegrationDatabases`: SQLite by default, or all five supported
databases with `INTEGRATION_DB_CONNECTIONS=all`.

| File                                             | Coverage                                                                                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [query.test.ts](./query.test.ts)                 | Query insert/read examples, small integers, integer comparison, and table/column aliases.                                                                                                                                         |
| [transport.test.ts](./transport.test.ts)         | Query and Repository round trips, value boundaries, native bigint bindings, predicates, arithmetic, joins, relations, streams, and transactions.                                                                                  |
| [aggregates.test.ts](./aggregates.test.ts)       | Query COUNT, SUM, MIN, MAX, and AVG with aliases, small/large integers, nulls, empty input, and precision regression cases.                                                                                                       |
| [numeric-types.test.ts](./numeric-types.test.ts) | INTEGER/BIGINT/DECIMAL/FLOAT/DOUBLE comparisons through Query and Repository: ordinary reads, aliases, aggregate types, positive/negative/zero/null values, empty input, fractional decimals, and numeric floating-point MIN/MAX. |

Add future BIGINT-specific Query, Repository, schema, and driver scenarios
here. General API tests that happen to use a BIGINT field stay with their
capability, such as [Repository identity tests](../repository/identity/key-types-and-returning.test.ts).

Run from `packages/libs/db` with Node 24+:

```sh
pnpm exec vitest run tests/integration/bigint

# With all database services available:
INTEGRATION_DB_CONNECTIONS=all pnpm exec vitest run tests/integration/bigint
```

See the [transport contract and known limitations](../repository/README.md#bigint-precise-string-transport)
for database-specific behavior characterized by these tests.

## Aggregate results

COUNT returns a safe integer number, including Repository.count(); values above Number.MAX_SAFE_INTEGER are rejected. SUM/AVG of exact fields
return database-formatted strings or null; FLOAT/DOUBLE SUM/AVG return numbers or null. MIN/MAX preserve the logical field
contract: bigInt/decimal return strings; integer/float/double return numbers. Aliases, scalar
subqueries, grouped results and relation aggregates use the same rules.

`aggregates.test.ts` covers small and unsafe integers, nulls and empty input.
`aggregate-contract.test.ts` compares Query and Repository directly, checks
numeric sorting and HAVING, DISTINCT, transactions, scalar subqueries, and
sums beyond int64, relation aggregates, and empty relations. Assertions compare values and types without Number coercion.

AVG follows native PostgreSQL/MySQL computation, including PostgreSQL rounding
of extreme BIGINT averages. Tests allow decimal formatting and fractional precision
differences but check exact stored BIGINT reads without Number coercion.
`native-aggregates.test.ts` covers floating aggregates in groups, HAVING, scalar
subqueries and relations, absence of PostgreSQL/MySQL metadata queries, and native
exact aggregate formatting. All five databases execute every scenario.

Ordinary DECIMAL reads and MIN/MAX preserve database decimal strings on all five databases,
including aliases and Repository results: PG/MySQL retain `'42.00'`; other databases may return `'42'`. Additional
[DECIMAL read tests](../decimal/reads.test.ts) cover transactions, subqueries,
mutation results, joins, relations and streaming. SQLite still uses numeric/REAL
storage; already-rounded stored values cannot be recovered by the read codec.
