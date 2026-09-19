# @nocobase/app-server

## 1.0.0-beta.20

### Minor Changes

- e9da3c2: Resolve installed official database drivers asynchronously from application configuration before provider registration or standalone database tasks. Configure only the needed dialects and install their optional peer packages in application dependencies. Preserve explicit driver registrations and synchronous core manager APIs; direct core consumers continue to register drivers explicitly. Standard development and test loaders require no synchronous ESM compatibility configuration.

### Patch Changes

- Updated dependencies [c84bfe8]
- Updated dependencies [e9da3c2]
- Updated dependencies [e9da3c2]
  - @nocobase/db@1.0.0-beta.11
  - @nocobase/db-postgres@0.1.0-beta.2
  - @nocobase/db-kingbase@0.1.0-beta.2
  - @nocobase/db-dameng@0.1.0-beta.2
  - @nocobase/db-mssql@0.1.0-beta.1
  - @nocobase/db-mysql@0.1.0-beta.2
  - @nocobase/db-oceanbase@0.1.0-beta.1
  - @nocobase/db-oracle@0.1.0-beta.2
  - @nocobase/db-sqlite@0.1.0-beta.2

## 1.0.0-beta.19

### Minor Changes

- e13ed84: Organize Hub storage by ownership, add explicit managed revision and log directories, retain legacy layouts, and provide an offline migration preview and copy workflow. Keep standalone Hub data outside build output and place template build archives under storage/exports with matching publishing defaults.
- e13ed84: Persist per-deployment phase and failure logs and expose application runtime logs in Hub with scoped access, incremental reading, retention, and independent file and console outputs.

  Unify runtime logging configuration and source routing, merge default outputs into app files, connect workflow diagnostics with execution identities, and preserve legacy configuration and historical log readability.

  Enforce hosted capture policy, declare the Host server runtime peer, merge paged source logs chronologically with bounded opaque cursors, and preserve correlation and error details when truncating oversized records. Handle expired scans explicitly in the Hub viewer and downloads.

  Route HTTP request logs to separate request files by default in all application templates.

- e13ed84: Unify application directory fields and path helpers in AppPaths, shared by configuration factories, runtime and Application. Replace ConfigPaths and runtime.configPaths with AppPaths and runtime.paths, and construct applications through createAppFromRuntime so Host logging policy and the runtime application reference are wired consistently.

  Standalone applications declare their deployment root separately from their code root. Configuration and default persistent storage use that deployment root in both source and compiled execution. Explicit storage paths take precedence over HUB_STORAGE_DIR, and embedded applications retain Host-provided volumes.

  Standardize Hub storage and expanded releases on the hub, host and apps layout, remove legacy layout detection and offline storage migration commands, and replace appDeploymentsDir with appRevisionsDir. Expanded releases use appRevisionsDir/<appId>/<sha256>; standalone discovery records the selected revision. Consumers must update removed path and storage APIs and configure existing data locations explicitly before adopting this release. Rebuild application artifacts with the updated runtime and templates.

### Patch Changes

- e13ed84: Preserve structured workflow context alongside queued run return values when integrating scheduled execution. Route terminal observer failures and registered queue jobs through application loggers while retaining committed workflow outcomes.
- e13ed84: Make development logs concise and application-scoped while retaining structured file diagnostics. Route configuration and authentication diagnostics through application logging, reduce routine startup and request noise, distinguish optional AI Skill directories from missing configured paths, and align development console settings across templates. Document that deployed applications need rebuilding to adopt the current logging protocol.
- 00362cf: Restore colored log levels in the development terminal. Replacing the pino-pretty transport with `console.pretty` dropped the ANSI escapes, so INFO, WARN and ERROR lost the colors developers had in v2. Pretty output colors the level label again, using the previous palette, and only when it helps: `console.color` decides when set, otherwise a terminal check applies, `NO_COLOR` disables the escapes, `FORCE_COLOR` requests them, and piped or captured output stays plain. Structured console output, journals and log files still never contain escapes. Applications pass an explicit `logging.console.color` (or `hub.logging.apps.console.color`) through to the logging library. A managed App Host child inherits a pipe and cannot see the terminal its output is relayed to, so the supervisor requests `FORCE_COLOR` for it when the environment states no preference, and captured child output drops terminal escape sequences so the Hub log viewer keeps showing readable text.
- Updated dependencies [e0c4b3d]
- Updated dependencies [e13ed84]
- Updated dependencies [e13ed84]
- Updated dependencies [00362cf]
- Updated dependencies [e13ed84]
  - @nocobase/queue@0.1.0-beta.6
  - @nocobase/db@1.0.0-beta.10
  - @nocobase/logging@0.1.0-beta.5
  - @nocobase/caching@0.1.0-beta.2
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1

## 1.0.0-beta.18

### Minor Changes

- 26ac480: Add code-defined Cron scheduling with timezone support, transactional synchronization, and stable schedule identities. Applications and plugins register schedules with `SchedulerService.defineSchedule(definition)` and execution targets with `registerTarget()` during provider registration or boot.

  Route scheduled jobs and workers through the application's configured logical queue, with an adapter-neutral schedule store. Keep the upstream queue dependency unmodified and store queue and scheduler timestamps compatibly with their adapters while preserving absolute instants.

  Move queue storage migrations from Scheduler into the queue library, which resolves configured database connections and physical tables. Assemble these sources centrally in app-server for startup and CLI commands, rejecting overlapping active queue tables before execution. Support immutable target parameters, shared migration history and locks, upstream-compatible physical schemas, and read-only execution conditions that leave skipped migrations unapplied.

  Track idempotent occurrences through the target's final outcome, including asynchronous Workflow completion and recovery with stable run references. Target registration returns a completion-reporting handle scoped to that target; long-running executions can report completion without a fixed scheduler observation timeout.

  Provide an authorized, read-only schedule management page and API with paginated schedules, trigger counts, execution history, and separate schedule and execution statuses. Register `pnpm nocobase schedule sync` as a global CLI command and integrate it into all application templates.

  Include application examples for custom task targets and scheduled Workflows, and agent guidance for schedule definition, target selection, asynchronous execution, diagnostics, and recovery.

  Keep the database manifest CLI entry available before compilation so fresh workspace installs link the command required by package builds.

  Declare the OpenTelemetry dependencies referenced by the upstream queue declarations so consumers can typecheck published Server APIs without enabling tracing or skipping library checks.

### Patch Changes

- Updated dependencies [24e771f]
- Updated dependencies [26ac480]
  - @nocobase/db@1.0.0-beta.9
  - @nocobase/queue@0.1.0-beta.5
  - @nocobase/caching@0.1.0-beta.2
  - @nocobase/i18n@1.0.0-beta.4
  - @nocobase/service-provider@0.0.2-beta.1

## 1.0.0-beta.17

### Patch Changes

- 028dd7c: Use host-provided peers for shared database types, authorization errors, service tokens, cache registries, and repository filter metadata. Declare their production providers in all application templates so deployments with automatic peer installation disabled retain the required runtime packages. Document the provider contract for generated plugins.

  Existing applications upgrading these packages must add compatible versions of their required shared peers to production dependencies: @nocobase/db, @nocobase/service-provider, @nocobase/repository-input, @nocobase/authorization, @nocobase/caching, @nocobase/i18n, and @nocobase/queue for the standard server stack, plus @nocobase/ai-employee when using its plugin. Update the lockfile and verify the production install; peer declarations do not remove incompatible historical versions automatically.

- Updated dependencies [028dd7c]
  - @nocobase/db@1.0.0-beta.8
  - @nocobase/queue@0.1.0-beta.4

## 1.0.0-beta.16

### Minor Changes

- 415d763: Add optional standalone HTTP and WebSocket proxy routing and configure Hub to forward paths outside its public mount to the current ready App Host port. Preserve public request identity and streaming, release proxy connections during shutdown, and use the shared public entry for hosted application links.

  Return 502 and close the upstream connection when a regular HTTP request receives an unexpected protocol upgrade. Validate App IDs against the normalized Hub mount and the managed Host's reserved `__` namespace before creating an application.

## 1.0.0-beta.15

### Major Changes

- a60decd: Require an explicit absolute baseDir for Server plugins and resolve migrations, seeds, jobs, and package metadata from the loaded plugin copy. Generate and validate database task manifests during builds so TypeScript and JavaScript share source checksums, with verified legacy JavaScript history conversion and synchronized plugin scaffolding and application templates.

### Minor Changes

- 63db898: Let `AppDatabaseConfig` accept a connection shape from a dialect package it does not know about.

  `@nocobase/db` split its dialects into packages and added `ExtensibleDatabaseConfig<TConnection>` for exactly this, with an overload on `createDatabaseManager` and a compile-time contract test. `AppDatabaseConfig` was left extending the closed `DatabaseConfig`, so an application could register `@nocobase/db-kingbase`, `@nocobase/db-oceanbase` or `@nocobase/db-dameng` and watch it work at runtime while `pnpm typecheck` rejected the configuration: `Type '"kingbase"' is not assignable to type '"mssql"'`.

  `AppDatabaseConfig` and `AppDatabaseConnectionConfig` now take the same type parameter, defaulting to the dialects `@nocobase/db` declares. Every existing configuration is unchanged — the bare form still means what it meant — and an application on a contributed dialect names its shape instead of reaching for an assertion:

  ```ts
  type KingbaseConnection = KingbaseOptions & { dialect: 'kingbase' };

  const database: AppConfigFactory<
    AppDatabaseConfig<ConnectionConfig | KingbaseConnection>
  > = defineAppConfig(() => ({ drivers: { kingbase }, ... }));
  ```

  Widening applies to the named shape alone: a dialect nobody named is still rejected, `sqlite` still requires `filename`, and `serviceName` on a `postgres` connection is still an error. The constraint to write against when code is generic over a connection is `AnyConnectionConfig`, from `@nocobase/db`.

- 63db898: Move concrete database connection types into their owning dialect packages and keep the core connection contract independent of installed dialects. Import `SqliteConnectionConfig`, `PostgresConnectionConfig`, `MysqlConnectionConfig`, `OracleConnectionConfig`, and `MssqlConnectionConfig` from the corresponding `@nocobase/db-<dialect>` package instead of `@nocobase/db`.

  `ConnectionConfig` and the default `DatabaseConfig` and `AppDatabaseConfig` now describe the common runtime contract. For strict configuration checking, supply a concrete connection type or use `DatabaseConfigFromDrivers` and `AppDatabaseConfigFromDrivers`. The core also exports `DriverConnectionConfig` and `ConnectionConfigFromDrivers` for reusable driver inference. Preserve mutually exclusive host and socket targets in MySQL and OceanBase configuration and factory options.

### Patch Changes

- 63db898: Add `defineAppDatabaseConfig` to infer connection types from the drivers returned by a runtime configuration callback. Application templates now directly export this helper without explicit factory annotations, driver type maps, or `satisfies` clauses. Keep declaration emission but use full TypeScript inference for application server builds; library packages retain isolated declaration checking.
- 63db898: Require each driver registration key to match the driver's declared dialect in inferred database configurations. Reject aliases and mismatched keys even when no connection uses that driver or the connections map is empty, while preserving connection inference for correctly registered factories and descriptors.
- Updated dependencies [63db898]
- Updated dependencies [63db898]
- Updated dependencies [a60decd]
- Updated dependencies [1c70f60]
- Updated dependencies [63db898]
  - @nocobase/db@1.0.0-beta.7

## 1.0.0-beta.14

### Patch Changes

- c258b92: Reject `auth.secret` and `session.secret` left at the placeholder `config.example.yml` ships.

  The example declares both as live keys carrying `replace-with-a-unique-secret`, so that `@nocobase/create-app` can fill them in by replacing a value rather than by uncommenting a line. That leaves one way to end up running on it: copying `config.example.yml` to `config.yml` by hand and starting the application without editing it. The placeholder is a non-empty string, so every existing check accepted it — and it is the same string in every installation that did this, published in this repository.

  `resolveAuthSecret` and `resolveAppSessionConfig` now refuse it, naming the setting and how to generate a replacement. `@nocobase/app-server/config` exports `PLACEHOLDER_SECRET`, `isPlaceholderSecret`, and `assertSecretIsNotPlaceholder` so that anything else reading a secret out of configuration can apply the same rule.

  Applications generated by `create-app` are unaffected: their `config.yml` has real secrets written into it.

## 1.0.0-beta.13

### Patch Changes

- c01baf6: Resolve application namespace aliases in React translations, synchronize the document language at startup and on changes, and inject the configured default language into served HTML. Allow client-only language selections with an English server fallback and an informational toast, and standardize documented locale checks on `pnpm nocobase app i18n:check`.
- Updated dependencies [c01baf6]
  - @nocobase/i18n@1.0.0-beta.4

## 1.0.0-beta.12

### Minor Changes

- 1d5ee9a: Add `generateAppCollectionsArtifact()` for writing and checking Collection artifacts

  Reads every Collection a managed connection resolves and writes it under `database/<connection>/collections/<name>/` as `collection.json`, `metadata.json` and `schema.json`, with a `_manifest.json` per connection recording the dialect, whether the schema is managed or external, and the last applied migration. Connection selection follows the migration and seed commands — the default connection, `connection` for one, or `all` for every one — except that external connections take part too: their schema is owned elsewhere and they record no migration head, but a snapshot of what they resolve to is exactly what a reader without database access needs from them.

  Each Collection's files are staged and swapped in as a unit, directories of Collections that no longer exist are removed, and entries the generator does not own make it fail rather than delete them. `check: true` compares the generated result with the files on disk and reports each difference as missing, stale or unexpected without writing anything, which is what a CI step runs.

  Nothing here is read back at runtime; the files are derived output for developers, documentation and AI tooling.

- 1d5ee9a: Read an external connection's metadata from `database/<connection>/collections` by default

  An `external` connection that configures no `metadataStore` — on the connection or at the top level — now reads `database/<connection>/collections/*/metadata.json` through a `DirectoryCollectionMetadataStore`, so an existing database can be connected from `config.yml` alone. `metadataStore` also accepts a directory as a plain string, resolved against the application root, for metadata kept elsewhere.

  `generateAppCollectionsArtifact()` treats `metadata.json` as the source on such a connection: regenerating only normalizes its formatting, and when the database no longer has a Collection the generated files are removed while `metadata.json` is kept and reported under `orphans`. The generator resolves each connection's directory through the same `resolveAppCollectionsDirectory()` the store default uses. A connection's configured migration and seed `tableName` and `lockTableName` are passed to `@nocobase/db` as `internalTables`, so a custom-named history table is not reported as a Collection or written as an artifact.

### Patch Changes

- Updated dependencies [1d5ee9a]
- Updated dependencies [211538b]
- Updated dependencies [1d5ee9a]
- Updated dependencies [1d5ee9a]
  - @nocobase/db@1.0.0-beta.6

## 1.0.0-beta.11

### Minor Changes

- ceb356b: Declare database dialect drivers on the application's own database config.

  An application lists the dialect packages it installs under `database.drivers`,
  next to the connections that use them, and the runtime, the CLI commands and the
  tests all resolve a dialect from that one place. The app-server runtime stays
  independent of every concrete database driver.

  This replaces the process-wide `registerAppDatabaseDrivers` registry and the
  `databaseDrivers` option on `Application`, both of which are removed. An
  application that used either one moves its drivers into `database.drivers` and
  drops the module it imported only for the registration side effect.

- f17f3a6: Provide editable TypeScript defaults for application modules, assembled by the runtime before services start. Module factories receive the runtime with application paths and plugin metadata; deployment files and environment variables override defaults, and configuration reload preserves code defaults.

  Keep deployment settings in YAML examples and reserve explicit environment overrides for secrets and startup integration. Simplify application configuration loading, merging and reload subscriptions.

  Align client configuration assembly with the server: runtime merges application TypeScript defaults beneath public configuration before services start. Client inspection reports the application configuration entry.

- f17f3a6: Support TypeScript authentication options in application templates and use the native authentication client. Keep authentication plugins and callbacks in editable server and client configuration, with YAML as the default format for deployment settings.

  Runtime assembly now prepares complete configuration before application creation. Module configuration factories use defineAppConfig and defaultAppConfigs, receive the runtime once, and retain their defaults when environment configuration reloads.

- ceb356b: Supply plugin migration and seed sources to database planning directly instead
  of through the database configuration.

  `AppDatabaseConfig.taskSources` is removed. It held the application's package
  name and the migration and seed directories contributed by registered server
  plugins — values the runtime derives from resolved plugins rather than values
  anyone configures. Carrying them in the `database` namespace put them where a
  `config.yml` deep-merges: `database.taskSources.migrations: []` silently
  dropped every plugin's migrations, and the application still started.

  They now travel as an `AppDatabaseTaskContributions` value alongside the
  configuration. `planAppDatabaseTasks`, `runAppDatabaseTasks`, `runAppMigrations`
  and `runAppSeeds` take an options object carrying it, with `paths`, `drivers`
  and the task selection, in place of their positional parameters.
  `createAppPluginDatabaseConfig` and `resolveAppPluginDatabaseConfig` are
  replaced by `createAppDatabaseTaskContributions`, which maps resolved plugins to
  that value. `contributions` is required, so a call site that has not been
  updated fails to compile rather than quietly planning without its plugins.

  An application's `server/config/database.ts` keeps only what it configures —
  drivers and connections — and no longer calls into the plugin resolver. Its
  `cli/database-command.ts` builds the contributions from the runtime it already
  resolves; `cli/commands/migrate.ts` and `cli/commands/seed.ts` are unchanged.

- ceb356b: Add the destructive `pnpm migrate --fresh --force` workflow for managed
  connections. It clears dialect-owned schema objects, reruns visible migrations,
  requires confirmation in interactive terminals, and rejects external
  connections.
- c960d07: Let a Repository API action declare a `policy`, normalized when the routes are
  defined and bound to the Repository the handler uses. `@nocobase/db` gains
  `RepositoryOperations`, the operation methods a plain and a policy-bound
  Repository share, so code that only runs queries can accept either.
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

- ceb356b: Register the split database dialect packages in the application server database manager.

### Patch Changes

- ceb356b: Expose the dialect runtime strategy contract used by database connections and
  the Knex-backed query, repository, schema, and application composition
  adapters. Dialect packages now own connection defaults, ownership identity, and
  local storage preparation, while the database configuration API accepts
  additional dialect identifiers without core changes.
- e11b855: Locate a built application's `config.yml` next to `dist/` when none exists inside it, build the client against the same `.env` files the server loads, and prefer the compiled dependency tree when resolving plugins from a production build.
- 40e2d49: Expose the application mode to plugin service providers

  `AppPluginApplication` carried no way to tell whether the app owns the process it runs in or is one of several an app host mounted, so a provider that needs the distinction had to infer it from configuration that cannot carry it. A template's defaults are merged in both modes, which means an embedded app holds a `server.port` it does not own — enough to mislead any provider reading it.

  The field is optional, so an application composed by hand need not state it, and absent means embedded, matching what `Application` itself defaults to.

- c960d07: Map the Repository Policy error codes to their HTTP status: the read and scope
  refusals answer 403 rather than 400, and an upsert onto a record outside the
  scope answers 409.
- Updated dependencies [f17f3a6]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [590861e]
- Updated dependencies [e11b855]
- Updated dependencies [72ed008]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [e11b855]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [590861e]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
- Updated dependencies [c960d07]
- Updated dependencies [c960d07]
- Updated dependencies [ceb356b]
- Updated dependencies [ceb356b]
  - @nocobase/config@0.1.0-beta.1
  - @nocobase/db@1.0.0-beta.5
  - @nocobase/logging@0.1.0-beta.4

## 1.0.0-beta.10

### Minor Changes

- a009e2d: Derive the languages an application offers from its own locale files, and configure the default language in one place.

  `i18n.defaultLocale` in `config.yml` now names the language the application starts in, for the browser and the server alike. The `i18n.locales` setting and its `APP_LOCALES` environment variable are removed, along with `client.app.defaultLocale`: an application offers whichever languages its own `client/locales/index.ts` and `server/locales/index.ts` declare loaders for, so adding a language means adding its file rather than editing a second list. A plugin's locale file supplies translations for those languages and no longer adds one, which keeps an installed plugin from putting an unexpected language in the picker.

  The browser resolves its startup language as the visitor's stored choice, then `i18n.defaultLocale`, then `en-US`. `navigator.language` is no longer consulted. Switching language in the interface remains a user-level choice and does not change the configured default.

  An untranslated key now falls back through `i18n.defaultLocale` and then `en-US`, rather than through the default alone. An application that defaults to Chinese and adds Spanish leaves its plugins translated in neither, and English is the language they are most likely to ship; the fallback languages are loaded alongside the one in use so the fallback has resources to read. `pnpm nocobase app i18n:check` reports a language declared in `client/locales/` but not `server/locales/`, or the reverse — the case where the interface offers a language the server then rejects.

  `LocaleResource` and `PartialLocaleResource` now accept an `overrides` block at the top level. The shape is derived from the source locale, which never declares that key, so annotating a locale file with it and adding the block documented for rewording a plugin's copy was a compile error — the documented example did not compile.

  To migrate, replace `i18n.locales` and `client.app.defaultLocale` with `i18n.defaultLocale`, and make sure every language the application offers has a file in its own `client/locales/` and `server/locales/`.

### Patch Changes

- Updated dependencies [a009e2d]
  - @nocobase/i18n@1.0.0-beta.3

## 1.0.0-beta.9

### Minor Changes

- e3fa827: Add reusable user administration and Hub-scoped role-based authorization. Authentication now supports disabled accounts, transaction-aware administration, stable duplicate-identity conflicts, Session revocation, and immediate Realtime disconnects. Authorization supports protected Permission Sets, atomic scoped assignment replacement, and Client permission invalidation. The Users page supports protected role options, readable multi-role editing, explicit unassigned states, and a distinction between direct roles and authenticated-user defaults; password reset and database Session revocation share one transaction. The default App exposes its direct Authorization Permission Sets as application roles while keeping System administrator changes in Authorization. The Hub defines Administrator, Operator, and Viewer roles, batch-loads their user assignments, enforces every Hub and user-management action on the server, protects the final enabled Administrator, and hides unauthorized Client controls. Both templates register the reusable Users plugin; Hub exposes Applications, User management, and a read-only role matrix directly in its control-plane navigation, while the default App keeps Users in Settings. Only the Hub template receives Hub roles, disables public sign-up, and omits ordinary App Settings, workflows, notifications, and example plugins.

### Patch Changes

- Updated dependencies [0a3fa83]
  - @nocobase/db@1.0.0-beta.4

## 1.0.0-beta.8

### Minor Changes

- d29d1fe: Run application migrations and seeds on explicitly selected database connections, with per-connection configuration, startup policies, isolated results and fail-fast execution. Keep plugin tasks on the default system connection and reject task execution against externally managed databases. Preserve legacy configuration and directory support while adopting database/<connectionName> source directories in both application templates; add --connection and --all CLI options and document upgrade rules.

### Patch Changes

- Updated dependencies [5281fd1]
  - @nocobase/drive@0.1.0-beta.4

## 1.0.0-beta.7

### Minor Changes

- 90a4903: Stream exposed Repository `findMany` records as framed NDJSON when requested through HTTP content negotiation.
- 90a4903: Finalize the Collection Metadata architecture by making the V1 supplemental document Store the only `CollectionMetadataStore` contract, using persistent database Metadata by default for managed connections, requiring an explicit Store for external connections, and removing the legacy full-Collection Store and Builder Metadata-only APIs.
- 90a4903: Add defineRepositoryApiRoutes to expose explicitly configured Collection Repository methods through the api-client HTTP protocol, with JSON request validation, bounded list queries, and Repository error mapping. This basic adapter does not install authentication or authorization.
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

- 90a4903: Replace the legacy database connection `managed` flag with the explicit `schemaManagement` mode, and prevent external-schema connections from executing Builder DDL or migrations while retaining query access and dry-run compilation. Remove unused Collection `writable`, Field `interface` and `uiSchema` properties, and implicit virtual-field metadata creation.
- a864497: Add standalone and Hub-managed host modes, startup-only YAML or JSON host configuration, FS and S3 release deployment through NocoBase Drive, strict desired deployment reconciliation, file configuration path selection, host-owned structured logging, shared ws-backed App WebSocket handling, private authenticated child-process management over Node IPC, and bounded managed-host crash recovery. Managed deployments use checksum-addressed immutable revision directories, stop-first Runtime replacement with bounded graceful request draining, and a three-revision local cache for fast rollback. Rename the Host's in-process runtime implementation to `InProcessAppHandle`.
- a864497: Register the Application Hub in the Hub template and provide an application control plane. Release artifacts supply their version and an optional `config.example.yml` or `config.example.yaml` template, while applications choose Config file or External configuration and reserve Hub-managed configuration for a future database-backed implementation. Hub actions reconcile only the selected application, reuse an already installed matching artifact, report deployment phase timings, and support removing an application and its persisted resources. Separate Hub desired configuration files from Host-owned runtime configuration, rebuild recovery targets when Host becomes ready, and split the management page into business modules.
- 90a4903: Add Microsoft SQL Server support through Knex and the `tedious` driver, including connection configuration, Collection Builder and Query behavior, Schema Inspector introspection, real Docker integration tests, generated-application driver installation, and template runtime packaging.
- 90a4903: Add Oracle Database support through the `oracledb` Thin driver, including connection configuration, Collection Builder and Query behavior, Schema Inspector introspection, real Docker integration tests, generated-application driver installation, and template runtime packaging.
- 90a4903: Expose opt-in aggregate and groupBy Repository HTTP actions with JSON AST validation, grouped filters and sorting, and lossless BigInt result serialization. Add matching remote Repository methods and public types. Switch the aggregate example to the generic authenticated endpoints and display its actual Repository requests.

### Patch Changes

- 90a4903: Extract the shared realtime wire protocol and browser WebSocket client into `@nocobase/realtime`. Replace the session-specific client reconnect method with a transport-level `reconnect()` operation, and make the application client and server consume the shared package.
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
- Updated dependencies [90a4903]
  - @nocobase/db@1.0.0-beta.3
  - @nocobase/realtime@0.0.2-beta.0

## 1.0.0-beta.6

### Minor Changes

- cee3251: Add authenticated realtime subscriptions, refresh their identity after authentication changes, and invalidate in-app notification state through user-scoped events.

### Patch Changes

- 8d88ff4: Replace the public AI Employee LLM service filesystem loader with the application `config.yml` contract at `ai.llmServices`. Configured model entries use a simple label/value array and are converted internally to custom mode. The App plugin validates and synchronizes declarative service definitions at startup and on application-config reload while preserving repository-managed enabled state for matching services. The default App template includes a commented configuration example, and the App config validator supports unique object properties for rejecting duplicate service names.
- Updated dependencies [813da59]
  - @nocobase/i18n@1.0.0-beta.2

## 1.0.0-beta.5

### Patch Changes

- 15c7197: Publish the `./i18n` subpath. `exports` declared it but `publishConfig.exports` did not, so it resolved from source in this repository and was absent from the published package. A generated application failed to start on `pnpm dev` with `ERR_PACKAGE_PATH_NOT_EXPORTED` for `./i18n`, imported by its own `server/app.ts`.

  `pnpm pack:check` now compares `exports` against `publishConfig.exports` and rejects a subpath present in one and missing from the other, in either direction. This class of defect is invisible in the workspace — every consumer resolves through the source map — and only appears once the package is installed from a registry.

  A generated application no longer stops its first install with `ERR_PNPM_IGNORED_BUILDS`. `tesseract.js` reaches the dependency tree through `officeparser` and its `postinstall` only prints a donation notice, so `allowBuilds` now records it as a deliberate `false` rather than leaving it undecided; entries accordingly carry their own value instead of always being written as `true`. The generated `pnpm-workspace.yaml` also sets `strictDepBuilds: false`, so a transitive dependency introduced later reports a skipped install script as a warning rather than failing the install of a project that is otherwise fine. The repository's own `pnpm-workspace.yaml` takes the same setting.

## 1.0.0-beta.4

### Major Changes

- 174eab5: Consolidate the browser packages into `@nocobase/app-client`.

  `@nocobase/app-sdk` is gone; its API client now lives in `@nocobase/app-client` and is imported from there. `@nocobase/app-portal-sdk` is deprecated and keeps only what still has consumers: `NocoBaseClient` and the runtime configuration it reads, which exist to reach a v2 NocoBase server, and the route surface containers under `/routing`. Its ACL, auth, data, extension, i18n, and system-settings modules are removed, as is the route tree that `/routing` used to export alongside the surfaces.

  `@nocobase/app-client` gains `resolveAppBase()`, which reports the path the application is mounted at.

  Four plugins built their API client at import time instead of resolving it from the application's service container, so they could not see `api.baseURL` from the application configuration. They now resolve it, which means an application that configures a base URL gets one client rather than two that disagree.

  The injected browser global `NOCOBASE_PORTAL_BASE` is renamed to `APP_BASE_PATH`. Its value has always been the `APP_BASE_PATH` environment variable, and the old name grouped it with the settings that address a v2 NocoBase server. Those keep their names. A client and the server that serves it must be upgraded together.

  `@nocobase/app-plugin-data-provider` is removed. It forwarded the Portal data provider, and applications built on the current client runtime do not use it.

  The Hub template is rebuilt from the default template and now runs the same client and server stack as every other v3 application. Its `/api/apps` endpoint and its v2 API proxy are gone, so a hub's `.env` no longer configures them.

  The Portal SDK's template compatibility check is removed with the rest: it had been disabled behind a constant, and its install script cost every generated project a `pnpm-workspace.yaml` `allowBuilds` entry it did not need. `createPortalViteConfig` no longer takes the plugin that injected it.

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

### Patch Changes

- Updated dependencies [174eab5]
  - @nocobase/db@1.0.0-beta.2
  - @nocobase/i18n@1.0.0-beta.1
  - @nocobase/snowflake@1.0.0-beta.3
  - @nocobase/queue@0.1.0-beta.3

The versions below were published as `@nocobase/app-server-kit`, the name this package carried until it was renamed to
`@nocobase/app-server`. They are kept because they describe this same codebase; the `@nocobase/app-server-kit` releases they
name are not, and never will be, versions of `@nocobase/app-server`.

## 0.1.0-beta.3

### Minor Changes

- ac3f033: Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.
- fb1a752: Unify Client and Server application composition around the explicit `serviceProviders` contribution and rename Client React tree contributions to `reactProviders`.

  Replace Client bootstrap modules with application-owned ServiceProvider lifecycle hooks, make the default Client start through `ClientApplication` and render through the Browser host, and update built-in plugins and runtime inspection to the new static contribution protocol.

- 78cf0a2: Add declaration-level Server plugin inspection with real Route contribution order, and make the Routes example own a path-scoped authentication boundary.
- fb1a752: Transport public Client configuration through a versioned, safely escaped JSON data block in SPA HTML and read it automatically during Client runtime resolution.

  Apply the same HTML transformation to production static responses and development Vite proxy responses, and document the public `config.yml` Client section in the default template.

### Patch Changes

- 948304d: Close logging transport workers during application shutdown to prevent full application test suites and server processes from hanging during cleanup.
- Updated dependencies [948304d]
- Updated dependencies [ac3f033]
- Updated dependencies [fb1a752]
  - @nocobase/logging@0.1.0-beta.3
  - @nocobase/caching@0.1.0-beta.2
  - @nocobase/drive@0.1.0-beta.2
  - @nocobase/snowflake@0.1.0-beta.2
  - @nocobase/queue@0.1.0-beta.2
  - @nocobase/session@0.1.0-beta.2
  - @nocobase/config@0.0.2-beta.0
  - @nocobase/service-provider@0.0.2-beta.1

## 0.1.0-beta.2

### Minor Changes

- 7cdffbd: Add reusable application-scope cancellation and disposer lifecycle primitives, and use them for the default template standalone scope.
- 7cdffbd: Add reusable application-scope path, environment, and routing resolvers, while keeping default-template configuration mappings application-owned.
- 7cdffbd: Move public base-path mounting and mounted origin proxy adapters into `@nocobase/app-server` so standalone applications can reuse the host-neutral runtime boundary.
- 7cdffbd: Replace separate API and root route arrays with one ordered `routes` contribution array. Route factories now receive the Application, create and return their own Hono router, and are mounted automatically at `/api` or the application root according to their definition.

  Standardize plugin server modules around `providers/index.ts` and `routes/index.ts` collection entries, `services/` domain implementations, and a stable `tokens.ts` public contract.

  Generated plugins now declare conventional database and queue contribution directories by default. Missing optional directories are ignored until executable migrations, seeds, or jobs are added.

  Generated plugins now include an App-facing starter Agent Skill under the package's `skills/` directory. Plugin registration and skill synchronization copy these package-owned Skills into registered applications' `.agents/skills/` directories.

  Unify Client page contributions behind one `routes` loader. Plugins now use `defineAppRoutes()` and `defineSettingsRoutes()` to add child Routes to the application's two built-in Client Routes, mirroring how Server plugins use `defineRootRoutes()` and `defineApiRoutes()` with the built-in Hono routers.

- 7cdffbd: Add reusable Node HTTP, WebSocket, and standalone server definition adapters with graceful shutdown handling, Vite overrides, mounted application lifecycle ownership, standard listen configuration, and startup cleanup. Reduce the default template standalone entry to binding its root directory, Runtime Definition, and shared server factory. Derive the application package name from its root package metadata and keep standard standalone routing defaults in the Node runtime instead of repeating them in each Runtime Definition.
- 7cdffbd: Add explicit `server/plugin.ts` definitions for Providers, API routes, root routes, database sources, and queue jobs. Register routes in a dedicated Application phase after Provider boot, add reusable HTTP and runtime composition helpers to their owning packages, and remove the default template's duplicate runtime layer and legacy plugin discovery contract.
- 7cdffbd: Move server plugin manifest resolution, Provider loading, and database or queue contribution discovery into the public `@nocobase/app-server/plugins` entry. The default application template now consumes the shared implementation.
- 7cdffbd: Add declarative application Runtime Definitions, shared application Scope, path, and disposal contracts, reusable Node standalone Scope and environment loading utilities, and focused Runtime Config section resolution. Resolve plugins before config factories and pass the complete resolved Runtime into application assembly, making Runtime plugins the single source for both configuration contributions and provider or route registration. Use the shared Runtime assembly across app-host and the default application template so embedded and standalone modes no longer maintain separate structural copies. Remove the template-local Scope and config-loading infrastructure, require standalone entrypoints to pass their resolved application root explicitly, and remove the legacy `/v2/api` proxy contract in favor of each application's local `/api` router.

### Patch Changes

- Report Server plugin locale declarations during static inspection without executing their loaders.
- Add a consistent Server inspection summary with deduplicated recovery suggestions.
- b049266: Add language switching on top of `@nocobase/i18n`. Applications and plugins declare their locales the same way on both sides, the browser loads only the language it is showing, and the chosen one is kept in storage and mirrored to the server session.
- ce4eab8: Add a focused ServiceProvider plugin example with a tokenized heartbeat
  service, lifecycle management, and an HTTP status route. Pass the Application
  directly to providers and standardize service access through `app.container`.
- Updated dependencies [b049266]
- Updated dependencies [ce4eab8]
- Updated dependencies [b049266]
  - @nocobase/i18n@0.0.2-beta.0
  - @nocobase/service-provider@0.0.2-beta.0
  - @nocobase/db@0.0.1-beta.1

## 0.0.1-beta.1

### Patch Changes

- 0465323: Expose application configuration paths to server plugins and add helpers for mounting redirect responses below an application's base path. Application hosts now rewrite root-relative redirects returned by embedded applications so installation and other redirects remain inside the mounted application.

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
- Updated dependencies [da1b1b0]
  - @nocobase/db@0.0.1-beta.0
