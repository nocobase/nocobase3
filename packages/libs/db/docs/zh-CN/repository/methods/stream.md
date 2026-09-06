---
title: findMany asynchronous iteration
description: Consume the same Repository findMany query with await or for-await, including relations, combine, distinct and pagination, with explicit lifecycle and buffering rules.
---

# Asynchronous iteration with findMany

There is no public `repository.stream()` method or `StreamOptions` type. Use [findMany](./find-many.md) for both consumption modes. The existing page URL is retained as the topic guide.

## One query API, two consumption modes

```ts
const projects = db.repository('projects');

// Collect a complete array.
const rows = await projects.findMany({
  filter: { status: 'active' },
});

// Execute a separate query and consume its records incrementally.
for await (const project of projects.findMany({
  filter: { status: 'active' },
  select: (s) =>
    s.fields('id', 'name').include('tasks', (tasks) =>
      tasks
        .fields('id', 'title')
        .sort((s) => s.field('id').asc())
        .limit(10),
    ),
  sort: (s) => s.field('id').asc(),
  limit: 1000,
})) {
  console.log(project);
}
```

The example uses the explicitly declared keys in the [overview model](../overview.md); Repository does not infer an id field.

Both modes share filter, select, sort, distinct, cursor, direction, limit, offset and context validation. Relation filters, all four relation cardinalities, nested includes, combine and relation-local options work in both modes. Under the same data snapshot, they produce the same records, projections and order. Separate executions do not automatically share a snapshot.

## Lazy query lifecycle

`findMany()` returns `RepositoryQuery<T>`, implementing `PromiseLike<T[]>` and `AsyncIterable<T>`, plus catch/finally. It is not a native Promise.

| Operation                                        | Behavior                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Construct a query                                | No SQL or Builder callback execution                                                   |
| First await/then/catch/finally                   | Start array execution; repeated promise consumption shares the same success or failure |
| Obtain an async iterator                         | Reserve iterator mode and snapshot plain input data; SQL starts on next()              |
| Iterate a second time or mix modes               | QUERY_ALREADY_CONSUMED; create another findMany query to execute again                 |
| Return a query from an async function            | JavaScript assimilates the thenable and collects an array                              |
| Complete, break, consumer throw, iterator return | Close the producer and clean up resources                                              |

Plain option/context objects, arrays, Date and Buffer inputs are copied when consumption begins. The execution does not reread their external mutable containers. Functions retain JavaScript closure semantics; avoid changing external state captured by callbacks. Do not abandon a manually acquired active iterator: call return() in finally.

## Execution and buffering

- Scalar forward iteration uses the driver stream and does not collect the entire result array.
- Relation selections and backward pages first spool the root query to a private disk file. Only one root query is executed; offset queries are not repeatedly issued to reconstruct a stream.
- The root driver stream is closed before relation queries run. This avoids interleaving relation commands with an active root stream on the same transaction or a single-connection pool.
- Relations are loaded for batches of 100 roots, then complete selected records are yielded. This is an internal implementation detail, not a public batchSize option.
- Backward pages are read from the buffer in the required final order. Distinct representatives and pagination are computed by the original root query, not independently per batch.
- These buffered modes read all selected roots before yielding the first result. Early break saves later relation loading, not the already completed root read.
- The buffer uses a private temporary directory and a mode-0600 file, preserves driver value types through binary serialization, and is removed on completion, early return or error. The process needs writable temporary storage and sufficient disk space. Abrupt process termination may leave temporary files for operational cleanup.
- Nested selections can still be large: one root with an unbounded relation can consume substantial memory. There is no universal constant-memory guarantee.

## Transactions and failures

Create and consume transaction-bound queries inside the transaction callback. Queries first consumed after commit/rollback fail with QUERY_TRANSACTION_COMPLETED. Returning a query directly from an async transaction callback consumes it as an array; wrap it in an object only when intentionally testing deferred-consumption rejection.

Root and relation queries stay on the transaction connection. Isolation follows the database transaction's configured isolation level; batching does not introduce a stronger snapshot guarantee.

A scalar driver stream can occupy the connection until consumption finishes. Do not issue unrelated commands on the same connection while it is active. Structure read/write workflows explicitly.

Structural validation happens before records are emitted. An execution failure may occur after some records have already reached the consumer. Iteration does not automatically retry, roll back consumer side effects, or checkpoint progress.

## Driver setup and verification

PostgreSQL requires pg and pg-query-stream resolvable by Knex. This package includes them as development dependencies for integration testing, not as automatically installed application drivers.

SQLite, PostgreSQL and MySQL have been exercised for both consumption modes, including relations and lifecycle behavior. Oracle and MSSQL are not claimed as verified by this pass.

See [query lifecycle tests](../../../../tests/integration/repository/methods/find-many-consumption.test.ts), [relation parity tests](../../../../tests/integration/repository/relations/find-many-iteration.test.ts) and [driver cleanup tests](../../../../tests/integration/repository/methods/stream-lifecycle.test.ts).
