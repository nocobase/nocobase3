# Queue database storage

The queue library owns its physical schema and resolves migration targets through `resolveQueueMigrationSources(queueConfig, { defaultDatabaseConnection })`. It validates physical names, groups identical targets, and rejects overlapping active targets before any schema changes. The application server assembles these sources centrally for both startup and CLI migrations; application commands do not register queue sources themselves.

The migration itself checks the original configuration through `shouldRun({ configuration })`. A target executes when any of its queue connections uses `driver: 'database'`. Sync and Redis configurations are skipped without execution history; absent Queue configuration creates no targets. Switching drivers does not change the migration identity, which depends only on the fixed physical table parameters.

The immutable initial migration snapshots `@boringnode/queue 0.7.1`. Tables remain internal physical storage without Collection metadata. The upstream `KnexAdapter` uses these tables directly and does not own the application's connection. Apply migrations before starting workers; Scheduler owns only its business Collections.

Standalone consumers may pass `queueMigrationSource` to their migrator with explicit `parameters: { jobsTable, schedulesTable }` and `configuration: [queueConnectionConfig]`. The library build emits checksum manifests under `dist/database/migrations`. Keep physical names stable after installation; changing names does not move existing data.
