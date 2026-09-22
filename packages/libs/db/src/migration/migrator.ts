import {
  collectChecksumMismatches,
  describeChecksumMismatch,
  upgradeTaskChecksums,
  writeTaskChecksums,
  type ChecksumMismatch,
} from './checksum-history.js';
import { assertManagedSchema } from '../database/schema-management.js';
import type { Knex } from 'knex';
import {
  createMigrationConnection,
  createMigrationContext,
} from './internal/context.js';
import {
  DEFAULT_MIGRATION_TABLE,
  deleteMigrationHistoryRecord,
  ensureMigrationTable,
  readMigrationHistory,
  recordMigrationCompleted,
} from './internal/history.js';
import {
  DEFAULT_MIGRATION_LOCK_TABLE,
  withMigrationLock,
} from './internal/lock.js';
import { loadMigrations } from './loader.js';
import type {
  CreateMigratorOptions,
  LoadedMigration,
  MigrationDefinition,
  MigrationHistoryRecord,
  MigrationRepairOptions,
  MigrationRepairResult,
  MigrationRollbackResult,
  MigrationRunResult,
} from './types.js';

/** Executes and rolls back ordered migrations for one database connection. */
export interface Migrator {
  /** Applies every pending migration. */
  latest(): Promise<MigrationRunResult>;
  /** Applies pending migrations through the named migration, inclusive. */
  upTo(name: string): Promise<MigrationRunResult>;
  /** Rolls back the most recently applied migration batch. */
  rollback(): Promise<MigrationRollbackResult>;
  /**
   * Rewrites recorded checksums to match the current sources, clearing drift
   * reported by a run. Executes no migration and changes no schema.
   */
  repair(options?: MigrationRepairOptions): Promise<MigrationRepairResult>;
  /**
   * Migrations already applied on the connection, oldest first. Reads only:
   * a connection without a history table yields an empty list rather than
   * getting one created.
   */
  history(): Promise<MigrationHistoryRecord[]>;
}

/** Creates a migration runner backed by the supplied database manager. */
export function createMigrator(options: CreateMigratorOptions): Migrator {
  return new DefaultMigrator(options);
}

class DefaultMigrator implements Migrator {
  constructor(private readonly options: CreateMigratorOptions) {}

  async latest(): Promise<MigrationRunResult> {
    return this.runPendingMigrations();
  }

  async upTo(name: string): Promise<MigrationRunResult> {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Migration target name must be a non-empty string.');
    }
    return this.runPendingMigrations(name);
  }

  private async runPendingMigrations(
    targetName?: string,
  ): Promise<MigrationRunResult> {
    const connection = this.options.database.connection(
      this.options.connection,
    );
    assertManagedSchema(
      {
        connectionName: connection.name,
        mode: connection.schemaManagement,
      },
      targetName === undefined ? 'migration.latest' : 'migration.upTo',
    );
    const migrations = await loadMigrations(this.options);
    const selectedMigrations = selectMigrations(migrations, targetName);
    const migrationConnection = createMigrationContext(
      connection,
      this.options.config,
      this.options.container,
    ).connection;

    const result = await withMigrationLock(
      migrationConnection,
      {
        tableName: this.options.lockTableName ?? DEFAULT_MIGRATION_LOCK_TABLE,
        acquireTimeoutMs: this.options.lockAcquireTimeoutMs,
      },
      async () => {
        await ensureMigrationTable(
          migrationConnection,
          this.options.tableName ?? DEFAULT_MIGRATION_TABLE,
        );

        const history = await readMigrationHistory(
          migrationConnection,
          this.options.tableName,
        );
        const warnings = this.validateAppliedHistory(migrations, history);
        await upgradeTaskChecksums(
          migrationConnection,
          this.options.tableName ?? DEFAULT_MIGRATION_TABLE,
          migrations,
          history,
        );

        const appliedNames = new Set(history.map((record) => record.name));
        const pending = selectedMigrations.filter(
          (migration) => !appliedNames.has(migration.name),
        );
        const skipped = selectedMigrations
          .filter((migration) => appliedNames.has(migration.name))
          .map((migration) => migration.name);
        let batch = currentBatch(history);
        const executed: string[] = [];

        for (const migration of pending) {
          if (migration.migration.shouldRun) {
            const shouldRun = await migration.migration.shouldRun({
              ...createMigrationContext(
                connection,
                this.options.config,
                this.options.container,
              ),
              parameters: migration.parameters,
              configuration: migration.configuration,
            });
            if (typeof shouldRun !== 'boolean') {
              throw new Error(
                `Migration "${migration.name}" shouldRun must return a boolean.`,
              );
            }
            if (!shouldRun) {
              skipped.push(migration.name);
              continue;
            }
          }
          batch = nextBatch(history);
          await this.runUpMigration(connection, migration, batch);
          executed.push(migration.name);
        }

        return { batch, executed, skipped, warnings };
      },
    );
    if (result.executed.length > 0) connection.collections.invalidate();
    return result;
  }

  async history(): Promise<MigrationHistoryRecord[]> {
    const connection = this.options.database.connection(
      this.options.connection,
    );
    const tableName = this.options.tableName ?? DEFAULT_MIGRATION_TABLE;
    const migrationConnection = createMigrationConnection(connection);
    const knex = await migrationConnection.client<Knex>();
    if (!(await knex.schema.hasTable(tableName))) return [];
    return readMigrationHistory(migrationConnection, tableName);
  }

  async rollback(): Promise<MigrationRollbackResult> {
    const connection = this.options.database.connection(
      this.options.connection,
    );
    assertManagedSchema(
      {
        connectionName: connection.name,
        mode: connection.schemaManagement,
      },
      'migration.rollback',
    );
    const migrations = await loadMigrations(this.options);
    const migrationConnection = createMigrationContext(
      connection,
      this.options.config,
      this.options.container,
    ).connection;

    const result = await withMigrationLock(
      migrationConnection,
      {
        tableName: this.options.lockTableName ?? DEFAULT_MIGRATION_LOCK_TABLE,
        acquireTimeoutMs: this.options.lockAcquireTimeoutMs,
      },
      async () => {
        await ensureMigrationTable(
          migrationConnection,
          this.options.tableName ?? DEFAULT_MIGRATION_TABLE,
        );

        const history = await readMigrationHistory(
          migrationConnection,
          this.options.tableName,
        );
        const warnings = this.validateAppliedHistory(migrations, history);
        await upgradeTaskChecksums(
          migrationConnection,
          this.options.tableName ?? DEFAULT_MIGRATION_TABLE,
          migrations,
          history,
        );

        const batch = currentBatch(history);
        if (batch === 0) {
          return { batch: 0, rolledBack: [], warnings };
        }

        const migrationsByName = new Map(
          migrations.map((migration) => [migration.name, migration]),
        );
        const records = history
          .filter((record) => record.batch === batch)
          .sort((a, b) => b.id - a.id);
        const rollbackItems = records.map((record) => {
          const migration = migrationsByName.get(record.name);
          if (!migration) {
            throw new Error(
              `Executed migration "${record.name}" is missing from migration sources. Package: "${record.packageName}".`,
            );
          }
          validateRollbackMigration(migration.migration);
          return migration;
        });
        const rolledBack: string[] = [];

        for (const migration of rollbackItems) {
          await this.runDownMigration(connection, migration);
          rolledBack.push(migration.name);
        }

        return { batch, rolledBack, warnings };
      },
    );
    if (result.rolledBack.length > 0) connection.collections.invalidate();
    return result;
  }

  async repair(
    options: MigrationRepairOptions = {},
  ): Promise<MigrationRepairResult> {
    const connection = this.options.database.connection(
      this.options.connection,
    );
    const tableName = this.options.tableName ?? DEFAULT_MIGRATION_TABLE;
    const migrations = await loadMigrations(this.options);
    const migrationConnection = createMigrationConnection(connection);

    return withMigrationLock(
      migrationConnection,
      {
        tableName: this.options.lockTableName ?? DEFAULT_MIGRATION_LOCK_TABLE,
        acquireTimeoutMs: this.options.lockAcquireTimeoutMs,
      },
      async () => {
        await ensureMigrationTable(migrationConnection, tableName);
        const history = await readMigrationHistory(
          migrationConnection,
          this.options.tableName,
        );
        const repaired = collectChecksumMismatches(migrations, history);
        if (!options.dryRun)
          await writeTaskChecksums(migrationConnection, tableName, repaired);
        return { repaired, dryRun: options.dryRun === true };
      },
    );
  }

  /**
   * Fails on history the sources cannot explain at all, and applies the
   * configured policy to executed migrations whose source has since changed.
   */
  private validateAppliedHistory(
    migrations: LoadedMigration[],
    history: MigrationHistoryRecord[],
  ): ChecksumMismatch[] {
    const participatingPackages = participatingPackageNames(this.options);
    const migrationsByName = new Map(
      migrations.map((migration) => [migration.name, migration]),
    );
    for (const record of history) {
      if (
        !migrationsByName.has(record.name) &&
        participatingPackages.has(record.packageName)
      ) {
        throw new Error(
          `Executed migration "${record.name}" is missing from migration sources. Package: "${record.packageName}".`,
        );
      }
    }
    const mismatches = collectChecksumMismatches(migrations, history);
    if (this.options.onChecksumMismatch === 'error' && mismatches.length) {
      throw new Error(describeChecksumMismatch(mismatches[0], 'migration'));
    }
    return mismatches;
  }

  private async runUpMigration(
    connection: ReturnType<CreateMigratorOptions['database']['connection']>,
    loaded: LoadedMigration,
    batch: number,
  ): Promise<void> {
    const mode = loaded.migration.transaction ?? 'auto';
    if (mode === false) {
      const context = {
        ...createMigrationContext(
          connection,
          this.options.config,
          this.options.container,
        ),
        parameters: loaded.parameters,
        configuration: loaded.configuration,
      };
      const startedAt = Date.now();
      await loaded.migration.up(context);
      await recordMigrationCompleted(context.connection, {
        tableName: this.options.tableName,
        packageName: loaded.packageName,
        name: loaded.name,
        batch,
        checksum: loaded.checksum,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    await connection.transaction(async (trxConnection) => {
      const context = {
        ...createMigrationContext(
          trxConnection,
          this.options.config,
          this.options.container,
        ),
        parameters: loaded.parameters,
        configuration: loaded.configuration,
      };
      const startedAt = Date.now();
      await loaded.migration.up(context);
      await recordMigrationCompleted(context.connection, {
        tableName: this.options.tableName,
        packageName: loaded.packageName,
        name: loaded.name,
        batch,
        checksum: loaded.checksum,
        durationMs: Date.now() - startedAt,
      });
    });
  }

  private async runDownMigration(
    connection: ReturnType<CreateMigratorOptions['database']['connection']>,
    loaded: LoadedMigration,
  ): Promise<void> {
    const mode = loaded.migration.transaction ?? 'auto';
    if (mode === false) {
      const context = {
        ...createMigrationContext(
          connection,
          this.options.config,
          this.options.container,
        ),
        parameters: loaded.parameters,
        configuration: loaded.configuration,
      };
      await loaded.migration.down?.(context);
      await deleteMigrationHistoryRecord(context.connection, {
        tableName: this.options.tableName,
        name: loaded.name,
      });
      return;
    }

    await connection.transaction(async (trxConnection) => {
      const context = {
        ...createMigrationContext(
          trxConnection,
          this.options.config,
          this.options.container,
        ),
        parameters: loaded.parameters,
        configuration: loaded.configuration,
      };
      await loaded.migration.down?.(context);
      await deleteMigrationHistoryRecord(context.connection, {
        tableName: this.options.tableName,
        name: loaded.name,
      });
    });
  }
}

function selectMigrations(
  migrations: LoadedMigration[],
  targetName?: string,
): LoadedMigration[] {
  if (targetName === undefined) return migrations;

  const targetIndex = migrations.findIndex(
    (migration) => migration.name === targetName,
  );
  if (targetIndex === -1) {
    throw new Error(`Migration target "${targetName}" was not found.`);
  }
  return migrations.slice(0, targetIndex + 1);
}

function participatingPackageNames(
  options: CreateMigratorOptions,
): ReadonlySet<string> {
  if (options.sources) {
    return new Set(options.sources.map((source) => source.packageName));
  }

  return new Set([options.packageName ?? 'app']);
}

function validateRollbackMigration(migration: MigrationDefinition): void {
  if (migration.irreversible === true) {
    throw new Error(
      `Migration "${migration.name}" is irreversible and cannot be rolled back.`,
    );
  }
  if (!migration.down) {
    throw new Error(
      `Migration "${migration.name}" does not define down(context).`,
    );
  }
}

function nextBatch(history: MigrationHistoryRecord[]): number {
  return currentBatch(history) + 1;
}

function currentBatch(history: MigrationHistoryRecord[]): number {
  return history.reduce((batch, record) => Math.max(batch, record.batch), 0);
}
