# Migrations and seeds

This page is the application side: where the directories live, how `pnpm db:apply` runs them, how additional connections configure their tasks, and what to do about checksum drift and compiled manifests.

How to write the files themselves — the migration and seed shape, the immutability and self-containment rules, the Collection Builder, and which of `builder`, `query` and `repository` a task context should reach for — belongs to the package that owns them. Read `.agents/skills/nocobase-db/SKILL.md` sections 2 and 3 before writing one, and run `pnpm skills:sync` if that file is missing.

Migrations under `database/main/migrations/` are the application's schema history. Seeds under `database/main/seeds/` insert records the application requires to run. Migrations create structure. Seeds never do.

`database/tsconfig.json` extends the server configuration so editor tooling and ESLint recognize migrations and seeds as Node source. Keep it in place when adding connection directories.

## Running

```bash
pnpm db:apply
```

This applies pending migrations and then pending seeds for `database.default`, including registered plugins, ordered by name across all sources. Both halves run only what is pending, so on an already-migrated database it applies seeds alone. The template defaults to `main`. Plugin migrations, seeds and runtime default reads/writes always use this same connection; changing `database.default` changes the application system database.

Seeds are the second half of that run, so the structure a seed writes into must already exist from an earlier migration. Keep seed data fixed and reproducible — no current timestamps or random values in identifying fields — and never let a repeat run silently overwrite data a user has edited.

## Multiple connections

Use `database/<connectionName>/migrations` and `database/<connectionName>/seeds`. Each name must match a configured connection and contain only letters, digits, underscores or hyphens. Directories do not register connections. A connection without application-owned database source needs no empty directory.

Configure `connections.<name>.migrations` and `.seeds` in the database section. Each accepts `autoRun`, `directory` or `sources`, `packageName`, `tableName`, `lockTableName`, and `extensions`. Explicit paths resolve relative to the application root and must exist when executed. Without an explicit path the application resolves the per-connection directory under its runtime database directory, including `dist/database` after compilation. Custom sources replace the application's conventional source; registered plugin sources are still added only on the default connection.

The default connection runs migrations and seeds automatically unless disabled; other connections default to `autoRun: false`. Startup runs the default connection first, then other names in stable ascending order, migrations before seeds within each connection. A failure stops startup; completed database changes remain committed. No cross-connection transaction or rollback is provided.

```bash
pnpm db:apply --connection analytics
pnpm db:apply --all --json
```

Manual execution ignores `autoRun`. `--connection` and `--all` are mutually exclusive. `--all` uses the same connection order and stops at the first failure. JSON results include completed, skipped, failed and not-run entries, one per connection and kind; failures exit nonzero. Single-connection JSON from `migrate` and `seed` retains `status`, `batch` (migrations), `executed`, and `skipped`, with an added `connection` field.

`pnpm db:reset` is a destructive reset for managed connections. It removes the managed schema objects — which clears migration and seed history along with every row in a managed table — then reruns all currently visible migrations and seeds from empty. It never calls migration `down()`. In an interactive terminal it asks for confirmation. CI and non-interactive terminals require `--force`, so use `pnpm db:reset --force` only when the target is intentionally disposable. It is rejected for an explicitly selected external connection; `--all` processes managed connections and reports external connections as skipped. It is limited to connections with a registered driver reset capability.

`migrate --fresh` was the earlier form and is gone. It reset the schema without reseeding, so it left the seed history cleared but no seed executed; the default connection recovered on the next startup and a connection with `autoRun: false` did not.

`schemaManagement: external` describes ownership, not read-only credentials. Startup and `--all` skip external connections; explicitly targeting one for migrations or seeds is an error. The application resolves a metadata store for runtime access, using `database/<connectionName>/collections/` when neither a connection-level nor shared store is configured; see [database connections](database-connections.md#add-managed-or-external-connections). Seeds also use history and lock tables, so they are not a workaround for external schema ownership.

Use one managed connection per physical database/schema. Identical configured targets are rejected before execution, even when only one is selected. Hostname aliases, symlinks and driver-specific routing can hide a shared target; do not configure these as independent managed databases. Distinct history or lock table names alone do not isolate collection metadata and schema ownership.

## Existing applications

Old top-level `database.migrations` and `database.seeds` remain accepted and apply only to the current default connection, never automatically to `main`. Legacy fields override matching per-connection fields, including existing `DB_MIGRATIONS_*` / `DB_SEEDS_*` environment settings. Connection environment variables such as `DB_DATABASE` retain their existing `main` mapping. Prefer the new connection settings for new configuration; remove old overrides when adopting them.

Different explicit old/new directories, two explicit source arrays, or a combined directory and source array are configuration errors. Without an explicit source, the default connection falls back to `database/migrations` or `database/seeds` when present. If both old and new conventional directories exist, execution fails until you select one explicitly. Non-default connections never use the legacy directory.

No command moves source files or rewrites history. When moving a directory, preserve the target database, package identity, filenames, exported names, file contents and history/lock table configuration. Do not copy already-applied migrations to another database as an upgrade. Verify a repeat run executes nothing. An explicitly configured source missing from a release is an error; an absent conventional source is permitted for applications with no owned tasks. Verify release packaging separately to catch accidental omission of conventional sources.

Checksums are based on file contents. Moving unchanged files preserves them; compiling TypeScript into different JavaScript is not guaranteed to preserve an existing development database's checksums. Verify upgrades against the same execution artifact format.

Review `server/plugins.ts` and each registered plugin’s migration declarations to identify migration contributions.

## Checksum drift

A checksum recorded when a migration or seed ran no longer matching its current source means the file changed after it was executed. By default the run reports the drift and continues: `pnpm db:apply` prints a warning, startup logs one through the application logger, and `--json` carries it in `warnings`. Set `onChecksumMismatch: 'error'` on a connection's `migrations` or `seeds` configuration — or at the top level — to refuse to run instead. A record whose migration is missing from the sources entirely always fails, whatever the policy says.

`pnpm db:repair` (`nocobase app db repair`) rewrites the recorded checksums to match the current sources, which is how the warning is cleared once the change is confirmed intentional. One command covers both migrations and seeds. It executes nothing and changes no schema or data. Preview with `--dry-run` first; `--dry-run --json` is the form to run in CI when drift should gate a deploy. It never deletes a history record, so a repair cannot make an executed migration run again.

Repair records a decision; it does not make one. It is the right tool for drift you can explain — a reformat, a comment, a rebuild that produced different output. It is not a way to edit a merged migration: the applied database still has the old schema, and rewriting the checksum only hides that. Correct a merged migration with a new migration.

## Verify

- `pnpm db:apply` applies cleanly on an empty database and on an already-migrated one.
- The physical schema matches what the migration declared, checked against a real test database rather than the builder's return value.
- Running the same seed twice changes nothing.
- For the per-file checks — filename against exported `name`, immutability, `down` ordering — follow the `nocobase-db` Skill's own verification list.

## Compiled migration and seed manifests

The application build generates `.manifest.json` in each compiled migrations and seeds directory after server compilation, path rewriting, and `afterServerBuild` hooks. Keep the manifest generator in the build when customizing it. Plugins generate their own manifests when built; an application must not regenerate manifests for installed dependencies.

TypeScript and compiled JavaScript use the same source checksum for migration history, while the loader separately verifies emitted JavaScript. Marked JavaScript requires its manifest. For a database with old raw JavaScript checksums, first run the compiled representation with matching original output; verified legacy hashes are converted under the task lock. Never edit historical migrations, and never edit the history table by hand, to resolve an upgrade failure.

## Reading runtime configuration

Migration callbacks (`shouldRun`, `up`, `down`) and seed `run` receive a read-only `config` reader: `config.get<string>('users.initialAdmin.username')`. Missing keys return `undefined`; the type parameter is a TypeScript assertion, not runtime validation. Validate required settings when they are needed. Application startup and CLI database commands snapshot configuration through the application accessor’s `raw()` method for each execution plan, including application defaults. Custom get-only readers retain their own lookup semantics and remain live; they do not need to support an empty root key. Direct `createAppMigrator` and `createAppSeeder` callers can pass `runtimeConfig`; standalone database runners accept `config` and default to an empty reader.

Plain configuration objects and arrays are copied using the application's configuration semantics; modifying a returned map does not change subsequent reads. Opaque objects and functions retain their existing configuration-library semantics. Only `get` is exposed. Configuration is not added to checksums or task history; do not log secrets yourself. A later rollback gets the configuration available at rollback time, so keep schema operations and their inverses fixed rather than deriving table or field definitions from mutable settings. Existing migration `parameters` still identify fixed targets, and `configuration` still carries source applicability settings.

Seeds run once: changing configuration afterward does not rerun them or reset an existing user's password.

## Resolving services

Migration callbacks and seed `run` also receive `container`, a `ServiceResolver` exposing `has(token)`, `resolve(token)`, and `resolveIfCreated(token)`. Application task runners wrap the application container with a token-identity allowlist; only `idGeneratorToken` from `@nocobase/app-server/id-generator` is currently allowed. Use `container.resolve(idGeneratorToken).generateString()` for string IDs or `.generate()` for numeric IDs. Disallowed tokens return false from `has` and throw from both resolution methods. The wrapper reuses application singleton instances and exposes no registration methods. Startup and CLI share the application factory in `server/app.ts`, which registers `IdGeneratorProvider`; CLI database commands call the application factory discovered from `rootDir/server/app.ts` (or `.js` in compiled applications), register its providers without booting or starting them, and use its database manager and migration contributions. They dispose the application and runtime scope after execution, including failure and cancellation. Keep the factory free of startup side effects; CLI does not call `app.start()` or trigger autoRun. Services must therefore be usable after provider registration; do not depend on later boot/start hooks. Direct application and database runners accept a `container` option. Without a source container, an allowed token returns false from `has`, undefined from `resolveIfCreated`, and a missing-service error from `resolve`. Standalone `@nocobase/db` runners accept an owner-supplied resolver; the application allowlist is enforced by `app-server`, including direct `createAppMigrator` and `createAppSeeder` calls.

Use the callback's `query` and `builder` for transactional database work. Services resolved from the container are application-scoped and are not automatically rebound to the migration or seed transaction. Keep historical schema definitions self-contained rather than delegating them to evolving application services.

`cli/standard-commands.ts` uses `createAppCommands({ rootDir, publishing })`: Default enables publishing; Examples and Hub disable it. Runtime and application modules load lazily from `server/runtime` and `server/app`, preferring `.ts` over `.js` when both exist. Module execution errors propagate without falling back to another file. Nonstandard layouts can supply optional `loadRuntime` and `createApp` callbacks in the same options object.
