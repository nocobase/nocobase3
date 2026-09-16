# @nocobase/db

## 1.0.0-beta.7

### Major Changes

- 1c70f60: Remove the `syncMetadata` execution option from CollectionBuilder. Executed schema changes always validate and synchronize supplemental metadata so logical field types, relations, and optimistic locking remain available to data input and output. Legacy calls that pass the removed option now fail before DDL; remove the option to migrate.

### Minor Changes

- 63db898: Let a driver declare the connection shape its hooks receive.

  Splitting the dialects into packages left the driver descriptor's hooks disagreeing about how to say "a connection": seven took `unknown` and `resolveConnection` took the closed `ConnectionConfig` union. Neither is a type a contributed dialect can work with, so each package asserted its way back to its own — `@nocobase/db-dameng` through `source as unknown as DamengConnectionConfig`, a double assertion, which is what two types with no overlap require.

  `DatabaseDriverDefinition<TDialect, TConfig>` now carries the connection type, and every hook receives it. All eight dialect packages name theirs and the assertions are gone; the lint rule that reports a redundant assertion is what removed the last of them.

  The hooks are declared as methods rather than function properties. TypeScript checks method parameters bivariantly, which is what lets a driver narrowed to one dialect sit in the `drivers` map holding drivers for all of them. The pairing that gives up on is one the runtime enforces anyway: a driver is looked up by the connection's own dialect, so it is only ever handed a config of the dialect it declares.

  `DatabaseConfig` is now an alias of `ExtensibleDatabaseConfig<ConnectionConfig>` rather than a second interface. The two were written out separately and stayed field-for-field identical, which left every consumer choosing between two names for one shape — `@nocobase/app-server` chose the closed one, which is why an application could not configure a contributed dialect at all.

  Also: `AnyConnectionConfig` is exported as the constraint to write connection-generic code against; `BaseConnectionConfig.pool` is `Knex.PoolConfig` instead of `unknown`, which is what `configurePool` already said it was; and `@nocobase/db-oceanbase` declares `OceanbaseConnectionConfig` instead of reusing `MysqlConnectionConfig`, whose dialect literal is `'mysql'`.

  This is a step toward inferring a database's connections from its registered `drivers`, which would turn `Database dialect "..." is not registered.` from a startup error into a compile error. That inference needs the driver to own its connection type first.

- 63db898: Move concrete database connection types into their owning dialect packages and keep the core connection contract independent of installed dialects. Import `SqliteConnectionConfig`, `PostgresConnectionConfig`, `MysqlConnectionConfig`, `OracleConnectionConfig`, and `MssqlConnectionConfig` from the corresponding `@nocobase/db-<dialect>` package instead of `@nocobase/db`.

  `ConnectionConfig` and the default `DatabaseConfig` and `AppDatabaseConfig` now describe the common runtime contract. For strict configuration checking, supply a concrete connection type or use `DatabaseConfigFromDrivers` and `AppDatabaseConfigFromDrivers`. The core also exports `DriverConnectionConfig` and `ConnectionConfigFromDrivers` for reusable driver inference. Preserve mutually exclusive host and socket targets in MySQL and OceanBase configuration and factory options.

- a60decd: Require an explicit absolute baseDir for Server plugins and resolve migrations, seeds, jobs, and package metadata from the loaded plugin copy. Generate and validate database task manifests during builds so TypeScript and JavaScript share source checksums, with verified legacy JavaScript history conversion and synchronized plugin scaffolding and application templates.

### Patch Changes

- 63db898: Require each driver registration key to match the driver's declared dialect in inferred database configurations. Reject aliases and mismatched keys even when no connection uses that driver or the connections map is empty, while preserving connection inference for correctly registered factories and descriptors.

## 1.0.0-beta.6

### Minor Changes

- 1d5ee9a: Add Collection artifact serialization, `Migrator.history()`, and skip NocoBase bookkeeping tables when listing Collections

  `serializeCollectionArtifact()` and `serializeCollectionArtifactManifest()` turn one Collection's resolution, physical schema and stored metadata document into the three deterministic JSON files an application commits under `database/<connection>/collections/<name>/`, plus a connection-level manifest recording the dialect, the schema management mode and the last applied migration. Object keys are sorted and `undefined` members dropped; arrays whose order carries meaning — fields, index columns, relations — are left in resolution order, and only unordered sets such as warnings are sorted. `validateCollectionArtifactDirectoryName()` and `assertCollectionArtifactDirectoryNames()` apply the file-system rules a logical name has to satisfy to become a directory, including rejecting names that differ only by case.

  `Migrator.history()` returns the applied migrations, oldest first, without creating the history table when none exists. It is what lets a read-only command record which migration a snapshot was taken after.

  `connection.collections.list()` and `scan()` used to throw on any migrated database: the registry only treated the metadata store's own table as internal, so the first `__nocobase_migration_lock` or `__nocobase_migrations` table it met failed to map to a logical name. Every table under the `__nocobase_` prefix is now recognised as NocoBase's own bookkeeping and skipped, and a connection can declare further bookkeeping tables — a migration or seed history or lock table given a custom name — through the new `internalTables` option.

- 211538b: Add `db.collections(name?)` to `DatabaseManager`

  The Manager already mirrored three of the four Connection handles that work in logical names — `builder`, `query` and `repository` — but not `collections`, so reading one Collection definition from the Manager took `db.connection().collections.get('orders')` while the neighbouring handles took one call. The omission read as an accident rather than a boundary.

  `db.collections(name?)` returns the very object `db.connection(name).collections` holds, so the resolution cache stays shared with every Builder, Repository and Migration on that connection. The mirroring stops at these four: `schema`, `schemaInspector` and `collectionMetadata` work in physical names or write supplemental metadata and remain Connection-only.

- 1d5ee9a: Add `DirectoryCollectionMetadataStore` and a declarative `metadataStore` configuration

  `DirectoryCollectionMetadataStore` reads supplemental Collection metadata from a Collection artifact directory — one `<name>/metadata.json` per Collection, in the format `serializeCollectionArtifact()` writes — so the files an application commits are the metadata source for a connection whose schema it does not own. It is read-only, like the Module store, and treats a missing directory or a `null` document as no metadata.

  A connection's or the top-level `metadataStore` may now be given declaratively as `{ type: 'directory', directory }` instead of an instance; `createDatabaseManager` resolves it when the connection is first created. An instance still passes through, and an external connection without a store at either level still raises `CollectionMetadataStoreRequiredError`.

### Patch Changes

- 1d5ee9a: Resolve a json column's default to the document it encodes

  `connection.collections.get()` reported a json Field's `defaultValue` as the text between the quotes of the SQL literal — `'{"storage":"local"}'` came back as the string `{"storage":"local"}` — while the Builder had been given the object. The inspector parses defaults at the literal level and does not know the column's type, so the resolver now decodes the text for `json` columns; the physical literal stays in `db.defaultExpression`. A default that is not valid JSON keeps `defaultValue` unset and adds a `COLLECTION_JSON_DEFAULT_INVALID` resolution warning instead of failing.

## 1.0.0-beta.5

### Major Changes

- ceb356b: Move all concrete dialect connection resolution, schema inspectors, native
  driver loading, pool hooks, precise integer codecs, and capability profiles into
  the corresponding dialect packages. `@nocobase/db` now requires an explicitly
  registered dialect driver and no longer exports concrete dialect inspectors or
  native-driver fallbacks.
- ceb356b: Expose the dialect runtime strategy contract used by database connections and
  the Knex-backed query, repository, schema, and application composition
  adapters. Dialect packages now own connection defaults, ownership identity, and
  local storage preparation, while the database configuration API accepts
  additional dialect identifiers without core changes.

### Minor Changes

- ceb356b: Add dialect driver registration support and the initial PostgreSQL dialect package.
- ceb356b: Add the destructive `pnpm migrate --fresh --force` workflow for managed
  connections. It clears dialect-owned schema objects, reruns visible migrations,
  requires confirmation in interactive terminals, and rejects external
  connections.
- c960d07: Add `narrow` to a policy-bound Repository, and publish the policy types and
  `ScopedDatabaseConnection` from the package entry. Narrowing intersects scopes,
  field lists and relations, and `false` on either side wins, so no patch can
  widen what is already in force.
- c960d07: Add `ref(target)` for reusing another Collection's read node inside
  `read.relations`. References resolve against the same `withPolicies` map and
  are expanded when the map is bound, so a cycle or a missing target is a
  configuration error rather than a failure at request time.
- c960d07: Constrain relation write targets by `RelationWriteNode.scope`. A `connect`,
  `disconnect`, `set`, `delete`, or relation `update`/`upsert` now locates its
  target within that scope, so a caller confined to their own rows can no longer
  attach or modify somebody else's through a relation.
- c960d07: Degrade the record type a policy-bound Repository returns: binding a `read`
  node makes reads come back as `Partial<TRecord>`, since a query with no select
  returns `read.fields` alone. `read: true` keeps the complete record type.
- c960d07: Enforce the Repository Policy write-back invariant: a created or updated record
  must still satisfy that operation's scope once the write lands, or the
  transaction rolls back with `SCOPE_VIOLATION`. An upsert whose target exists
  outside `update.scope` raises `RECORD_OUTSIDE_SCOPE` instead of degrading to an
  insert, and no longer merges the scope into the unique selector that locates
  the target.
- c960d07: Add the Repository Policy read model: policy types, scope normalization, scope
  pushdown into the query, and field and relation allowlists enforced across
  every read surface — select, filter, sort, distinct, cursor, aggregate and
  group by, including the returning select of a write and each relation branch,
  which is judged by its own collection's allowlist and narrowed by its own
  scope.
- c960d07: Replace the Repository API's per-action `writePolicy` with a Repository Policy
  declared once per exposure.

  **Breaking.** `defineRepositoryApiRoutes()` no longer accepts `writePolicy` on
  an action, and every exposure must declare a `policy`. An action configuration
  now says only that an endpoint exists; what it may do is the exposure's Policy,
  which governs reading, creating, updating and deleting together. Declaring one
  is required rather than optional because `writePolicy` defaulted to refusing
  writes while an absent Policy restricts nothing — making it optional would have
  turned every existing declaration from "refuse every write" into "allow
  everything" without a word of warning.

  Declare `policy` as a function of a principal, together with a
  `principal(context)` resolver, to scope rows to the caller. The resolver belongs
  to the application, since this router installs no authentication; one that
  returns nothing refuses the request with 403 `PRINCIPAL_REQUIRED` rather than
  binding a Policy built from a principal that is not there. A fixed Policy is
  still normalized when the routes are defined, so a malformed one fails where it
  is written; a Policy function cannot be, and its `INVALID_POLICY` now reaches
  the host error handler as a server error instead of being reported to the caller
  as a 400.

  `@nocobase/db` gains `buildRepositoryPolicy`, a builder whose unmentioned nodes
  are denied, so the four-node requirement costs nothing to satisfy while the
  default stays refusal. Two related fixes travel with it: `create`, `update` and
  `delete` nodes that are `false` now refuse a write before its payload is read,
  so an empty body is reported as forbidden rather than as invalid input; and a
  `create` node whose relations grant `update`, `upsert`, `disconnect`, `set` or
  `delete` is refused during normalization, since a root create performs none of
  them.

  `@nocobase/app-plugin-file` exposures declare a Policy too, and it reaches
  uploads: the upload path binds a Policy derived from the exposure's, inheriting
  `create.scope` and `create.defaults` and substituting the file columns for the
  field allowlist. A file uploaded under a scoped Policy therefore lands inside
  the scope the same exposure reads from. The public content route under
  `accessPath` is unchanged and deliberately outside it.

  The method-level `writePolicy` option on `db.repository()` calls is unaffected
  and remains available for narrowing a single call.

### Patch Changes

- ceb356b: Normalize JSON field values at the Repository and Query API boundaries so
  direct JSON columns accept and return structured `JsonValue` values across
  database drivers.
- ceb356b: Improve Dameng integration compatibility for typed numeric query results, streaming rows, temporal projections, default-only inserts, schema capability warnings, and native constraint error messages.
- ceb356b: Decode Dameng LOB values returned by mutation returning queries before exposing records.
- ceb356b: Return DECIMAL fields as database-formatted decimal strings across Query and Repository,
  including aliases, scalar subqueries, grouped fields, relation records, streaming,
  mutation results, and MIN/MAX. Preserve PostgreSQL/MySQL native strings and
  avoid numeric metadata lookups and redundant text projections on these drivers.
  Use PostgreSQL RETURNING without a decimal-specific reload. Enforce mysql2
  `decimalNumbers: false` to preserve precision, including when driverOptions requests numbers. Other drivers project
  decimal text before number conversion while preserving numeric filtering and ordering. Avoid SQLite
  text formatting truncating stored significant digits; SQLite REAL storage remains
  approximate. Synchronous Query.compile does not resolve field metadata and may
  omit decimal result projections added during execution on other drivers.

  Preserve the declared logical type of implicitly generated belongsTo foreign
  keys so Oracle integer references are not decoded as decimal strings.

- 590861e: Remove the integration test scripts from `@nocobase/db`.

  `test:integration`, `test:integration:<dialect>` and `test:integration:all` only
  forwarded to the dialect packages, and the indirection misled more than it
  helped: `pnpm --filter @nocobase/db test:integration` read as a full run while
  it ran SQLite alone, and `test:integration:all` invited an eight-dialect serial
  run that CI already performs on every pull request. Run a suite through the
  package that owns it, as CI does:
  `pnpm --filter @nocobase/db-<dialect> test:integration`.

- e11b855: Read temporal columns that still hold epoch milliseconds from before the query builder normalized temporal Fields, so an application upgraded in place on SQLite can read its existing users, sessions, and records instead of failing with `FIELD_CAPABILITY_NOT_SUPPORTED`.
- 72ed008: Stop reporting a MySQL expression default as a generated column

  MySQL describes a column whose default has to be written as an expression with `EXTRA = 'DEFAULT_GENERATED'`, and the schema inspector matched on the word `GENERATED`. That is the wrong signal: `DEFAULT_GENERATED` describes a default, while a generated column reports `VIRTUAL GENERATED` or `STORED GENERATED` and is the only kind that carries a `GENERATION_EXPRESSION`. The inspector now derives it from that expression.

  Two things were wrong while it did not. The column's default was dropped from the introspected schema, and the Repository refused to write the column at all — `createOne` and `updateOne` rejected it as `FIELD_NOT_WRITABLE`, "managed by the database or Repository".

  Every defaulted `json` column on MySQL was affected, because MySQL accepts no literal default on `json` and the builder therefore emits `DEFAULT (json_object())` for one. A Collection declaring `collection.json('options').notNull().defaultTo({})` could not have its `options` written on MySQL, while the same Collection worked on every other database.

- ceb356b: Return BIGINT columns as exact strings before driver number conversion in Query and Repository reads. Preserve precision through aliases, relationships, streaming, transaction clients, and mutation results across the five supported databases, while normalizing Repository integer and increment fields to safe numbers.

  Align the file Repository size type with exact string results from BIGINT-backed collections.

- ceb356b: Avoid issuing a second SELECT after creating a record when no relations need to be loaded.
- ceb356b: Support exact BIGINT and DECIMAL string filters, validate plain integer writes before SQL execution, and preserve numeric atomic-update operands without floating-point promotion. Reject SQLite int64 arithmetic overflow before storage and retain native PostgreSQL/MySQL read and aggregate behavior.
- e11b855: Prevent relation indexes from colliding with an explicitly indexed foreign-key field, and report conflicting physical index names before schema execution.

  A `belongsTo` relation's automatic index is now suppressed by an index on the relation's foreign-key **column** rather than on the relation's field name, which is what removes the collision: `collection.index('productId')` alongside a `product` relation used to compile to the same physical index twice.

  Suppression is also narrower than it was. Only a single-column index on that foreign key stands in for the automatic one; a composite index no longer does, even when it already leads with the same column. An application that indexed `['productId', 'scannedAt']` and relied on it to suppress the relation index will therefore see a single-column index on `productId` appear at its next schema synchronization. Declaring the same physical index name twice with different definitions now fails before execution rather than silently taking one of them.

- ceb356b: Preserve SQL `NULL` values when Query writes nullable temporal fields.
- 590861e: Decode JSON columns according to a result form the dialect declares instead of guessing from the value.

  A driver either parses a JSON column before returning the row or hands back the stored text, and the returned value carries no evidence of which. Decoding by attempting to parse any string therefore corrupted a JSON string whose content is itself JSON: writing `'{"a":1}'` and reading it back produced the object `{ a: 1 }` on PostgreSQL, Kingbase, MySQL, and OceanBase, whose drivers parse JSON themselves. Each dialect now declares `jsonResults`, and a value that a text driver cannot parse is reported as `INVALID_STORED_VALUE` rather than returned as the raw string.

  Where the driver can be told to behave the other way, the declaration is derived from the resolved connection rather than fixed: mysql2 returns a json column as text under `jsonStrings`, which reaches it through `driverOptions`, and the Dameng driver decodes the column under `parseJson`. A fixed declaration would be wrong for exactly those connections, which is the failure this change exists to remove.

  Query and Repository also no longer disagree about a column holding the JSON literal `null`: Query fell back to the raw value whenever a decoder legitimately returned `null`, so the stored text leaked back to the caller.

  Altering a JSON column on Oracle no longer fails with `ORA-40664`. Knex compiles a JSON column to `varchar2(4000) check (col is json)`, and repeating that definition on a MODIFY asks Oracle for a second IS JSON check constraint on the same column. A dialect now learns whether a column is being created or redefined, and Oracle omits the constraint while altering; the MODIFY leaves the constraint the original definition created in place.

  A dialect that builds a JSON column as something other than Knex's `json()` also loses the JSON default handling that comes with it, and an object default would reach the column as `[object Object]` — on Oracle that is text its own IS JSON constraint then rejects. Such a dialect now asks for the default as encoded text, while MySQL keeps receiving the value because that is what makes it compile the expression form its engine requires. A JSON default consequently works on Dameng, where the column is a plain clob and the default was silently stored as something that could not be read back.

- ceb356b: Support local `Date` values for `date`, `time`, and `datetime` mutations while
  preserving Better Auth date values when records are read through its adapter.
- c960d07: Fix two Policy configurations that were refused although they are legitimate: a
  relation `combine` branch judged the relation's own scope as if the caller had
  written it, and narrowing a `create` node with `defaults` was rejected as an
  unsupported update option.
- c960d07: Treat a foreign key as readable when the relation it points through is
  authorized and returns the key it points at. Refusing `ownerId` while allowing
  `owner { id }` hid nothing, since the same value came back by the other route.
- c960d07: Close four ways a Policy claimed more than it enforced: a bound Repository can
  no longer have its Policy replaced by another `withPolicy` call, the degraded
  read type survives a Policy held in a variable of its declared type, a
  malformed `through` rule is refused instead of reinterpreted as an empty
  allowlist, and `explainPolicy` hands out a copy of a Date default rather than
  the instance the writes read from. `validateMutation` also reports an
  unsatisfiable `create.scope` instead of deferring it to the first insert.
- c960d07: Let a Repository API action declare a `policy`, normalized when the routes are
  defined and bound to the Repository the handler uses. `@nocobase/db` gains
  `RepositoryOperations`, the operation methods a plain and a policy-bound
  Repository share, so code that only runs queries can accept either.
- c960d07: Close five ways a relation write escaped its Policy scope: a to-one
  `connect`/`disconnect` writing the root foreign key now triggers the root
  write-back check, the relation scope reaches the to-one target resolved before
  an insert, `disconnect` and `set` may only detach targets the scope can locate,
  and a relation `update` is judged again after its values are applied.
- c960d07: Reject a dotted field name in a Policy scope when the Policy is bound, the same
  way an explicit relation path already was. `{ 'owner.tenantId': 'T1' }` kept the
  dotted name as one path segment, so it slipped past the relation check and
  failed much later as an unknown field.
- ceb356b: Unify aggregate result types using native PostgreSQL/MySQL behavior. COUNT returns a safe integer number and rejects values above Number.MAX_SAFE_INTEGER. SUM/AVG of integer, BIGINT and DECIMAL fields return database-formatted strings; FLOAT/DOUBLE SUM/AVG return numbers. MIN/MAX preserve field result types. Do not strip trailing zeros. Preserve nulls, numeric filtering, ordering, grouping, aliases and relation aggregates.

  Remove PostgreSQL AVG input casts and accept native computation and rounding. SQL Server promotes integral SUM/AVG inputs to DECIMAL(38,0), retains native DECIMAL precision rules, and preserves exact outputs before driver conversion. SQLite retains exact aggregates for integral/decimal fields while floating fields use native aggregation. Prepare aggregate field information only on adapters that need it, once per execution; PostgreSQL/MySQL do not load collections for numeric adaptation. Broaden shared SUM/AVG TypeScript results to string | number | null.

- ceb356b: Make dialect integration tests own their disposable Docker Compose environments
  with random host ports and automatic cleanup.
- ceb356b: Add the `@nocobase/db/testing` subpath for dialect packages to exercise shared database internals without importing core source files directly.
- ceb356b: Normalize boolean field values at the Repository and Query API boundaries so
  direct boolean columns accept and return JavaScript booleans consistently
  across database drivers.
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
  - @nocobase/repository-input@0.1.0-beta.1

## 1.0.0-beta.4

### Patch Changes

- 0a3fa83: Compile constraint removal according to the stored constraint type so unique, primary, check, and foreign-key constraints use the correct dialect operation.

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
