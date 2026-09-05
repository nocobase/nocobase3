# Repository test map

This is a test-maintenance index, not a specification of new Repository behavior. The public usage guides are in [Repository documentation](../../../docs/zh-CN/repository/overview.md). A related assertion is not proof that every method, relation type, or input form has been tested.

## Test ownership

| Layer                  | Location                                       | Responsibility                                                                                                   |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Unit                   | [unit/repository](../../unit/repository)       | Builder output, expression resolution, identity selection, validation and diagnostics without a live database    |
| Types                  | [types/repository](../../types/repository)     | Public input constraints and inferred output types; verified by TypeScript, not by the runtime test result alone |
| Method integration     | [methods](./methods)                           | Method-specific matching, results, execution and mutation boundaries                                             |
| Capability integration | [capabilities](./capabilities)                 | Shared Filter, Values, pagination and Distinct semantics in SQL                                                  |
| Relation integration   | [relations](./relations)                       | Relation reads, writes, scope, aggregation, pagination, variables and through data                               |
| Identity integration   | [identity](./identity)                         | Declared keys, keyless collections and operations that require identity                                          |
| Transactions           | [transactions.test.ts](./transactions.test.ts) | Connection binding and rollback across Repository calls                                                          |

Put each assertion in one primary home. Method tests should exercise shared capability wiring, not repeat every Filter or Values permutation. Relation-specific Filter/Select/Sort cases belong under `relations`, not under scalar capability files.

## Migration baseline

The structural migration preserves the existing test bodies and parameterized cases. The Repository-only baseline on SQLite is **99 passed, 1 skipped** across unit, integration and type-test files. The skipped case is PostgreSQL-specific bigint identity preservation. This is a baseline, not a coverage percentage or a claim that other database runs passed.

The former `scalar.test.ts`, `relations.test.ts` and `mutations.test.ts` have been partitioned by subject. Their fixed schemas and seed routines now live in [fixtures](./fixtures). Smaller regression files have moved to their subject directories.

Some existing tests intentionally remain transitional:

- `methods/read-contracts.test.ts` and `methods/write-contracts.test.ts` retain multi-method workflows. Add independent method contracts before splitting their assertions into individual method files.
- `relations/values/nested-operations.test.ts` retains cross-relation workflows. Follow-up tests should use relation-type-specific files when behavior differs by cardinality or foreign-key ownership.
- Unit Values tests still contain a few embedded type checks. Move those during the type-test phase without losing their negative compile-time checks.
- Existing fixtures seed through Repository calls. Preserve that baseline for this move; future mutation-specific tests should use independent setup and physical-row checks when circular verification could hide a defect.

## Method contracts

“Partial” below means executable coverage exists, but the independent public contract matrix is not complete.

| Methods                            | Existing primary coverage                                                                                                                                                                        | Status / next boundary                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| findOne, findMany, count, exists   | [read contracts](./methods/read-contracts.test.ts), [filter](./capabilities/filter.test.ts)                                                                                                      | Partial: independent empty/missing/multiple-match results and context errors; implement documentation scenarios FO-01/02, FM-01/02, CT-01/02 and EX-01/02 |
| createOne, updateOne, deleteOne    | [write contracts](./methods/write-contracts.test.ts), [identity safety](./identity/safety.test.ts)                                                                                               | Partial: per-method result, exact-cardinality and rejection-without-side-effects cases                                                                    |
| createMany, updateMany, deleteMany | [bulk values](./methods/bulk-values.test.ts), [bulk returning](./methods/bulk-returning.test.ts), [create context](./capabilities/create-context.test.ts)                                        | Partial: empty inputs, explicit all-record scope, invalid rows and complete rollback                                                                      |
| upsertOne                          | [root upsert](./methods/upsert-one.test.ts), [relation upsert](./relations/root-upsert.test.ts)                                                                                                  | Partial: isolate selector rules and both branches; do not infer concurrency guarantees from sequential tests                                              |
| aggregate                          | [aggregate](./methods/aggregate.test.ts), [relation filter](./relations/aggregate-filter.test.ts)                                                                                                | Partial: empty/null behavior and validation exist; extend cross-method context and relation combinations                                                  |
| groupBy                            | [groupBy](./methods/group-by.test.ts)                                                                                                                                                            | Partial: grouping, having, alias sorting and invalid inputs exist                                                                                         |
| stream                             | [stream](./methods/stream.test.ts), [relation rejection](./relations/stream-validation.test.ts)                                                                                                  | Partial: completion and early break exist; add consumer/driver failure and resource-release checks                                                        |
| describeMutation, validateMutation | [mutation validation](./methods/mutation-validation.test.ts), [Values variables](./capabilities/values-variables.test.ts), [required through data](./relations/required-through-payload.test.ts) | Partial: capability reporting and validation exist; add limit boundaries, no-write guarantees and applicable operation matrix                             |

## Relation coverage

### Reads and query expressions

| Contract                                                                        | Existing assertion location                                                                        | Follow-up gaps                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Root relation Filter: some, none, empty, notEmpty; direct to-one path           | [filter](./relations/filter.test.ts)                                                               | Applicable relation-type matrix, multi-hop conditions, logical groups, null/empty combinations, root-method wiring |
| Four relation cardinalities; missing to-one = null, missing to-many = []        | [select](./relations/select.test.ts)                                                               | Shared targets across parents, projection isolation, identity variants                                             |
| Nested include, local Filter/Sort, parent preservation, Builder/AST equivalence | [select](./relations/select.test.ts)                                                               | Deep combinations, sibling independence, context reuse                                                             |
| To-one field Sort, count/max aggregate Sort, nullsLast, root pagination         | [sort](./relations/sort.test.ts)                                                                   | Successful sum/avg/min sorts, nullsFirst, ties, belongsToMany and deeper paths                                     |
| Invalid relation Select/Sort expressions                                        | [select](./relations/select.test.ts), [sort](./relations/sort.test.ts)                             | Parameterized invalid-input matrix and stable diagnostic paths                                                     |
| combine records/count/sum/avg/min/max, branch filters, empty sets               | [aggregate select](./relations/aggregate-select.test.ts)                                           | Exact nonempty aggregate values, all-null data, applicable relation types and invalid branches                     |
| Per-parent limit and shared forward/backward cursor                             | [pagination](./relations/pagination.test.ts)                                                       | belongsToMany, compound/tied sort keys, invalid local cursors, multi-level pagination                              |
| Root Distinct representatives and related records; local Distinct               | [distinct](./relations/distinct.test.ts), [aggregate select](./relations/aggregate-select.test.ts) | Shared targets and pagination/filter combinations                                                                  |
| Relation selections returned from mutations                                     | [select returning](./relations/select-returning.test.ts)                                           | Per-method snapshots and projection boundaries                                                                     |
| Batch loading efficiency                                                        | Result shapes covered by [select](./relations/select.test.ts)                                      | **No query-count guarantee established**: add a bounded-query test rather than relying on the existing test title  |

### Values operation matrix

These cells identify representative existing assertions, **not API support declarations or exhaustive coverage**. “Not isolated” does not mean unsupported. Read the executable capability description and confirm the intended contract before adding an allowed/rejected case.

| Relation type | Representative existing operation assertions                                                                        | Missing systematic coverage                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| belongsTo     | connect/switch target; nested assignee connect                                                                      | Individually verify applicable create/disconnect/update/upsert/delete behavior and foreign-key ownership boundaries |
| hasOne        | connect, update, disconnect, delete                                                                                 | Individually verify applicable create/upsert, empty target, replacement and non-null constraints                    |
| hasMany       | create, connect, disconnect, update, both upsert branches, delete; composite-identity replacement in identity tests | Per-operation zero/one/multiple targets, duplicate selectors, non-null constraints and complete rejection state     |
| belongsToMany | create, connect, set including empty set in identity tests, target update/delete, edge cleanup                      | Shared-target edge isolation, disconnect-versus-delete, duplicate operations and applicable upsert behavior         |

Primary sources: [nested operations](./relations/values/nested-operations.test.ts), [keys and relations](./identity/keys-and-relations.test.ts), [through payload](./relations/through-payload.test.ts), [required through payload](./relations/required-through-payload.test.ts).

### Cross-cutting mutation invariants

| Contract                                                                   | Existing evidence                                                                                                                | Follow-up                                                                                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Nested updates/upserts/deletes stay within the parent relation             | [nested operations](./relations/values/nested-operations.test.ts), [variables](./relations/variables.test.ts)                    | Apply the rejection matrix to each applicable relation type; verify unrelated targets and edges remain unchanged        |
| JSON and callback operations, nested variable resolution, literal data     | [nested operations](./relations/values/nested-operations.test.ts), [variables](./relations/variables.test.ts)                    | Pair equivalent inputs and assert equal persisted state; avoid evaluating context-supplied expression-shaped data twice |
| Required/writable through fields, preservation of existing required values | [through payload](./relations/through-payload.test.ts), [required through payload](./relations/required-through-payload.test.ts) | Two parents sharing one target; invalid payload after another branch has written                                        |
| Version conflict, implicit reassignment rejection and rollback             | [nested operations](./relations/values/nested-operations.test.ts), [atomicity](./relations/atomicity.test.ts)                    | Root, target and edge snapshots after late failures; concurrent version competition after semantics are confirmed       |
| Mutation depth and node limits                                             | Defaults are asserted by [mutation validation](./methods/mutation-validation.test.ts)                                            | **Boundary execution not established**: at-limit and over-limit cases, with no residual writes                          |

## Fixture and assertion rules

- Keep each test independent; use the existing database harness for schema cleanup and dialect selection.
- Declare primary, unique, source and target keys explicitly. The fixture's `id` name or numeric type must never become a universal assumption.
- A test name describes one contract. Use `it.each` for independent boundary variants; do not hide unrelated cases behind one long sequence.
- Assert exact projections and empty-result shapes where they are contractual. For mutation rejection, check persisted root/target/edge state, not only the error code.
- Use stable error codes and relevant diagnostic fields. Avoid exact driver wording or incidental SQL aliases.
- Query-count tests should detect growth with parent count without freezing an incidental complete SQL plan.
- Documentation IDs belong in corresponding test titles once their actual fixture and expected results are implemented. Do not tag a loosely related test as full scenario coverage.

## Validation

From the package directory:

```sh
INTEGRATION_DB_CONNECTIONS=sqlite pnpm exec vitest run tests/unit/repository tests/integration/repository tests/types/repository
pnpm typecheck
pnpm lint
pnpm build
```

Use the package's supported Node 24+ runtime, matching the ABI used to build native drivers. Reuse the existing integration harness and CI database matrix for PostgreSQL, MySQL, Oracle and MSSQL; do not copy a suite per database. Unsupported capabilities should assert a documented rejection. Environment/dependency failures are not capability skips.

## Follow-up phases

### Phase 2a: independent queries and write safety

- Implemented FO-01/02, FM-01/02, CT-01/02 and EX-01/02 in [findOne](./methods/find-one.test.ts), [findMany](./methods/find-many.test.ts), [count](./methods/count.test.ts) and [exists](./methods/exists.test.ts). The fixture contains the relevant project/task subset of the documented schema; data is seeded with physical queries rather than the API under test.
- Added [write safety](./methods/write-safety.test.ts): independent zero/multiple-match and stale-version rejections, invalid returning projection, missing/empty/conflicting bulk scope, zero-match returning and explicit all-record mutation. Rejections compare complete physical row snapshots.
- Added [createMany](./methods/create-many.test.ts): empty/invalid input, database constraint rollback, context resolution and exact returning/default results.
- These cover specific gaps in the matrix above, not all remaining method contracts. Read-only collection behavior, deeper validation limits, relation matrices and concurrency remain follow-up work.

### Phase 2b: relation reads

- [Filter matrix](./relations/filter-matrix.test.ts) independently covers some/none/empty/notEmpty on all four relation cardinalities, plus multi-hop relation predicates, logical groups, context and count/exists wiring.
- [Sort matrix](./relations/sort-matrix.test.ts) covers sum/avg/min/max in both directions, explicit null placement, tied belongsToMany counts before pagination and missing to-one targets. Existing Sort semantics coalesce empty sum to zero; Select sum remains null on an empty relation.
- [Batch loading](./relations/batch-loading.test.ts) verifies bounded SELECT query count when parent rows grow from 1 to 15, nested shared targets and exact projections. This establishes the measured graph only, not a universal query-count guarantee.
- [Aggregate Select](./relations/aggregate-select.test.ts) now asserts exact nonempty sum/avg/min/max values in addition to relationships between aggregates.

1. **Structural baseline (this phase):** partition files, extract fixed fixtures, retain assertions, repair documentation links and establish this map.
2. **Public contracts and safety:** add independent method cases and documentation scenarios, then split transitional workflows where useful. Prioritize write scope, cardinality, identity and atomic rollback.
3. **Relation matrix:** fill Filter/Select/Sort and applicable Values operations by relation type; add exact aggregate checks, isolation and limit boundaries.
4. **Unit/types/resources:** expand Builder and validation cases, finish type-test separation, verify query counts, stream cleanup and confirmed concurrency semantics.

Validate and commit each bounded phase separately. BigInt/Decimal transport redesign and unconfirmed concurrency behavior remain design work; do not freeze either as a new contract through tests.
