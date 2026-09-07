# @nocobase/db

## 1.0.0-beta.3

### Major Changes

- 90a4903: Replace the accidental flat export surface with a single Agent-oriented root API. Internal Knex, collection composition, migration history and locking, and seed history and locking implementations are no longer package exports. The root entry includes the reusable `CollectionOperation` plan type accepted by `CollectionBuilder.apply()`. The public package entry is protected by a value-and-type API baseline, and published builds now contain source output only.
- 90a4903: Remove arbitrary Collection `tableName` and Field `columnName` mappings while retaining Connection- and Collection-level `underscored` and `tablePrefix` naming options. Table Collection renames now update the physical table and metadata together, reject dependencies that cannot be updated atomically, and reject View or Materialized View renames until kind-specific DDL is supported. Legacy physical-name mappings are validated before a connection starts. Query table sources now accept Connection-relative identifiers and automatically apply the Connection `tablePrefix`; complete physical table names must use the underlying connection client instead.
- 90a4903: Replace the legacy database connection `managed` flag with the explicit `schemaManagement` mode, and prevent external-schema connections from executing Builder DDL or migrations while retaining query access and dry-run compilation. Remove unused Collection `writable`, Field `interface` and `uiSchema` properties, and implicit virtual-field metadata creation.

### Minor Changes

- 90a4903: Return a lazy, awaitable and asynchronously iterable query from Repository findMany. Repeated promise consumption shares one execution; mixing consumption modes or repeating iteration raises QUERY_ALREADY_CONSUMED.
- 90a4903: Integrate Collection Builder with resolved Collections and supplemental Metadata documents, invalidate Collection Registry entries after physical Schema changes, and reject non-atomic renames or read-only Metadata writes before DDL.
- 90a4903: Add read-only module and persistent database Collection Metadata document Store backends with content revisions, atomic compare-and-swap, stable pagination, and self-contained internal table initialization.
- 90a4903: Add the revisioned Collection Metadata document Store contract, an in-memory compare-and-swap backend, stable Store errors, paginated summaries, and a read-only legacy transition adapter.
- 90a4903: Add CollectionMetadataService for validated compare-and-swap collection, field, and relation updates with deterministic patch semantics and post-commit Registry invalidation.
- 90a4903: Finalize the Collection Metadata architecture by making the V1 supplemental document Store the only `CollectionMetadataStore` contract, using persistent database Metadata by default for managed connections, requiring an explicit Store for external connections, and removing the legacy full-Collection Store and Builder Metadata-only APIs.
- 90a4903: Add the versioned Collection Metadata V1 document contract, strict runtime validation, TypeScript definition helper, structured validation issues, and legacy Collection definition extraction diagnostics.
- 90a4903: Isolate Collection Metadata and Registry changes inside database transactions, publish targeted invalidations after commit, discard them after rollback, and invalidate Collection caches after Migration batches.
- 90a4903: Add the Collection Registry, Naming Index, lazy resolved Collection reads, lightweight listing and explicit scanning, cache invalidation, cross-Collection relation validation, and DatabaseConnection collections and collectionMetadata entry points.
- 90a4903: Define the Collection Resolver input, result, warning, naming context, and stable aggregate error contracts, and support the complete set of inspected referential actions.
- 90a4903: Implement the pure Collection Resolver with deterministic logical naming, physical Schema mapping, supplemental Metadata merging, inspection warnings, and aggregate local drift validation.
- 90a4903: Add `database.createMigrator()` and `database.createSeeder()` convenience methods that bind migration and seed runners to a Database Manager.
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

- 90a4903: Add `connection.collections.getPhysical(name)` to inspect the physical database schema backing a logical Collection name.
- 90a4903: Add `migrator.upTo(name)` to run pending migrations through an inclusive target without rolling back later applied migrations.
- 90a4903: Add Microsoft SQL Server support through Knex and the `tedious` driver, including connection configuration, Collection Builder and Query behavior, Schema Inspector introspection, real Docker integration tests, generated-application driver installation, and template runtime packaging.
- 90a4903: Add Oracle Database support through the `oracledb` Thin driver, including connection configuration, Collection Builder and Query behavior, Schema Inspector introspection, real Docker integration tests, generated-application driver installation, and template runtime packaging.
- 90a4903: Add portable Repository AST and mutation input builders shared by browser and server clients. Support synchronous builder callbacks and complete JSON options helpers for all nine remote Repository actions, including nested selections, relation mutations, and numeric updates. Preserve relation create client keys through an explicit JSON envelope and reject unserializable builder inputs before sending requests.
- 90a4903: Add Repository V1 public contracts and persisted Collection optimistic-lock metadata.
- 90a4903: Add transactional Repository relation mutations, nested creates, capability discovery, validation, and optimistic-lock integration.
- 90a4903: Add Collection-aware Repository relation selection, filtering, sorting, and batched result assembly.
- 90a4903: Add Collection-aware scalar Repository CRUD, filtering, selection, sorting, and optimistic locking.
- 90a4903: Remove the public Repository stream method and StreamOptions type. Consume findMany queries with await or for-await using the same filters, projections, relations, combine, sorting, distinct and pagination semantics. Relation and backward queries use a private disk buffer before batched relation loading; scalar forward queries retain driver streaming. Reject consumption after transaction completion and snapshot plain input data when consumption begins.

### Patch Changes

- 90a4903: Add the logical char field type and explicit-length Collection Builder shortcut, preserve CHAR inspection and UUID compatibility, and support strict string mutations, filtering, selection, sorting, pagination, and returning without trimming native padding.
- 90a4903: Add bounded string enum fields, Collection Builder declarations, member metadata persistence and additive evolution safeguards, strict Repository values and stored-data validation, and exact equality filters across five databases. Explicitly reject unsupported enum identity, join-key, ordering, grouping, and value aggregate operations.
- 90a4903: Persist declared scalar field types in metadata, add temporal and floating-point Builder helpers, and define explicit temporal schema mappings. Validate final metadata for combined field alterations and preserve schema management permission checks before metadata writes.
- 90a4903: Support enum fields as Repository groupBy keys with exact member identity across database collations, nullable groups and stored-value validation. Preserve existing enum ordering restrictions. Replace per-status aggregate queries in the Repository example with a single enum groupBy request.
- 90a4903: Make database integration test commands explicit for SQLite, PostgreSQL, MySQL, Oracle, and SQL Server, and wait for Docker services to become healthy before testing.
- 90a4903: Fix Oracle default-only repository inserts with returning fields and read ordinary view definitions directly from the catalog to reduce schema inspection overhead.
- 90a4903: Preserve configured API and realtime endpoints after splitting the client services. Integrate file inventory and the plugin-owned inbox with the shared API and realtime clients, including reconnection refresh and isolated event listeners.

  Allow the Oracle driver install script in both templates’ standalone deployment workspace settings.

  Resolve SQLite auto-incrementing bigint metadata correctly, narrow Oracle LOB values before reading their type, preserve legacy file timestamps, and rebuild the AI registry against the current API client.

- 90a4903: Recognize inspected MySQL FLOAT columns as numeric fields, restoring Repository numeric Filter support for those columns.
- 90a4903: Validate malformed Repository Sort ASTs before inspecting their nodes or requiring a nonempty sort. Invalid structures now return INVALID_SORT instead of silently falling back to default ordering or raising native TypeErrors.
- 90a4903: Validate relation Select result and combine branch structures before execution. Reject malformed projections with structured diagnostics instead of accepting unintended record selections or throwing native type errors.
- 90a4903: Align Repository relation keys, locking, aliases, numeric versions, and logical unique constraints across SQLite, PostgreSQL, MySQL, Oracle, and MSSQL.
- 90a4903: Validate Repository Filter callback results, groups, nodes, field paths and relation quantifiers before traversal. Malformed inputs now return structured Filter diagnostics before executing queries or mutations, instead of throwing native errors or treating unknown relation quantifiers as existence checks.
- 90a4903: Recognize physical FLOAT columns as numeric fields so Repository numeric filters work for SQLite decimal, float and double columns emitted by Knex. Preserve the existing MSSQL FLOAT-to-double mapping.
- 90a4903: Return structured diagnostics for invalid relation Filter callback results and non-string variable paths before executing mutations.
- 90a4903: Validate malformed Repository Select structures before traversing them, returning structured Select diagnostics instead of native type errors and rejecting invalid projections before writes.
- 90a4903: Wait for Repository streams to close before completing iterator cleanup, preventing delayed connection release after database pool teardown.
- 90a4903: Expose physical string length units, numeric widths, character collations, and SQLite declaration capabilities. Distinguish fixed-length character columns and preserve their physical category through Collection resolution. Keep Oracle NUMBER columns decimal and distinguish SQL Server floating-point precision.
- 90a4903: Enforce strict boolean Repository inputs and consistent boolean results across database drivers, including variables, filters, unique selectors, cursors, returning, relations, grouping, and streaming. Report invalid stored representations instead of silently coercing them. Reject non-portable boolean value aggregates before issuing database queries; boolean counting remains supported.
- 90a4903: Distinguish instant-bearing physical columns from local date-times during schema inspection, retain PostgreSQL offset times as native types, and expose fractional-second precision separately from numeric precision and column length.
- 90a4903: Validate and normalize temporal Repository values, filters, cursors, and projections using explicit local-date-time and UTC-instant semantics. Add five-database temporal regression coverage, precision guards, safe Oracle temporal batch inserts, and updated usage documentation. Oracle floating-point Builder fields now use binary floating-point storage rather than decimal NUMBER aliases.
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
  - @nocobase/repository-input@0.1.0-beta.0

## 1.0.0-beta.2

### Major Changes

- 174eab5: Rename four packages, dropping the qualifiers they only carried to avoid names the v2 line had taken.

  | Before                     | After                  |
  | -------------------------- | ---------------------- |
  | `@nocobase/app-database`   | `@nocobase/db`         |
  | `@nocobase/app-i18n`       | `@nocobase/i18n`       |
  | `@nocobase/app-server-kit` | `@nocobase/app-server` |
  | `@nocobase/id-generator`   | `@nocobase/snowflake`  |

  There is no compatibility shim: the old names receive no further releases, and a dependency on one has to be repointed by hand. Each package keeps its version history, which is why the changelogs say which name the earlier releases went out under.

  `@nocobase/app-server` reclaims a name the v2 line abandoned at `0.11.1-alpha.5`, so it starts at `1.0.0-beta.0` rather than continuing its own `0.1.0-beta` line — `0.1.0` sorts below `0.11.1`, and npm would have rejected the publish. The other three take names that were never published.

  `@nocobase/snowflake` also now matches what it implements; its only source file was already called `snowflake.ts`.

The versions below were published as `@nocobase/app-database`, the name this package carried until it was renamed to
`@nocobase/db`. They are kept because they describe this same codebase; the `@nocobase/app-database` releases they
name are not, and never will be, versions of `@nocobase/db`.

## 0.0.1-beta.1

### Patch Changes

- Updated dependencies [ce4eab8]
  - @nocobase/service-provider@0.0.2-beta.0

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
