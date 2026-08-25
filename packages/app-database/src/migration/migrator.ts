import { createMigrationContext } from './context.js';
import {
  DEFAULT_MIGRATION_TABLE,
  deleteMigrationHistoryRecord,
  ensureMigrationTable,
  readMigrationHistory,
  recordMigrationCompleted,
  updateMigrationHistoryIdentity,
} from './history.js';
import { DEFAULT_MIGRATION_LOCK_TABLE, withMigrationLock } from './lock.js';
import { loadMigrations } from './loader.js';
import type {
  CreateMigratorOptions,
  LoadedMigration,
  MigrationDefinition,
  MigrationHistoryRecord,
  MigrationRollbackResult,
  MigrationRunResult,
} from './types.js';

export interface Migrator {
  latest(): Promise<MigrationRunResult>;
  rollback(): Promise<MigrationRollbackResult>;
}

export function createMigrator(options: CreateMigratorOptions): Migrator {
  return new DefaultMigrator(options);
}

class DefaultMigrator implements Migrator {
  constructor(private readonly options: CreateMigratorOptions) {}

  async latest(): Promise<MigrationRunResult> {
    const connection = this.options.database.connection(
      this.options.connection,
    );
    const migrations = await loadMigrations(this.options);
    const migrationConnection = createMigrationContext(connection).connection;

    return withMigrationLock(
      migrationConnection,
      {
        tableName: this.options.lockTableName ?? DEFAULT_MIGRATION_LOCK_TABLE,
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
        validateAppliedMigrationHistory(
          migrations,
          history,
          participatingPackageNames(this.options),
        );
        await reconcileAcceptedMigrationHistory(
          migrationConnection,
          migrations,
          history,
          this.options.tableName,
        );

        const appliedNames = new Set(history.map((record) => record.name));
        const pending = migrations.filter(
          (migration) => !appliedNames.has(migration.name),
        );
        const skipped = migrations
          .filter((migration) => appliedNames.has(migration.name))
          .map((migration) => migration.name);
        const batch =
          pending.length > 0 ? nextBatch(history) : currentBatch(history);
        const executed: string[] = [];

        for (const migration of pending) {
          await this.runUpMigration(connection, migration, batch);
          executed.push(migration.name);
        }

        return { batch, executed, skipped };
      },
    );
  }

  async rollback(): Promise<MigrationRollbackResult> {
    const connection = this.options.database.connection(
      this.options.connection,
    );
    const migrations = await loadMigrations(this.options);
    const migrationConnection = createMigrationContext(connection).connection;

    return withMigrationLock(
      migrationConnection,
      {
        tableName: this.options.lockTableName ?? DEFAULT_MIGRATION_LOCK_TABLE,
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
        validateAppliedMigrationHistory(
          migrations,
          history,
          participatingPackageNames(this.options),
        );
        await reconcileAcceptedMigrationHistory(
          migrationConnection,
          migrations,
          history,
          this.options.tableName,
        );

        const batch = currentBatch(history);
        if (batch === 0) {
          return { batch: 0, rolledBack: [] };
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

        return { batch, rolledBack };
      },
    );
  }

  private async runUpMigration(
    connection: ReturnType<CreateMigratorOptions['database']['connection']>,
    loaded: LoadedMigration,
    batch: number,
  ): Promise<void> {
    const mode = loaded.migration.transaction ?? 'auto';
    if (mode === false) {
      const context = createMigrationContext(connection);
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
      const context = createMigrationContext(trxConnection);
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
      const context = createMigrationContext(connection);
      await loaded.migration.down?.(context);
      await deleteMigrationHistoryRecord(context.connection, {
        tableName: this.options.tableName,
        name: loaded.name,
      });
      return;
    }

    await connection.transaction(async (trxConnection) => {
      const context = createMigrationContext(trxConnection);
      await loaded.migration.down?.(context);
      await deleteMigrationHistoryRecord(context.connection, {
        tableName: this.options.tableName,
        name: loaded.name,
      });
    });
  }
}

async function reconcileAcceptedMigrationHistory(
  connection: Parameters<typeof updateMigrationHistoryIdentity>[0],
  migrations: LoadedMigration[],
  history: MigrationHistoryRecord[],
  tableName?: string,
): Promise<void> {
  const migrationsByName = new Map(
    migrations.map((migration) => [migration.name, migration]),
  );
  for (const record of history) {
    const migration = migrationsByName.get(record.name);
    if (!migration) {
      continue;
    }
    const checksumMatches = record.checksum === migration.checksum;
    const checksumAccepted =
      migration.migration.acceptedChecksums?.includes(record.checksum) === true;
    if (!checksumMatches && !checksumAccepted) continue;
    if (record.packageName === migration.packageName && checksumMatches)
      continue;
    await updateMigrationHistoryIdentity(connection, {
      tableName,
      name: record.name,
      packageName: migration.packageName,
      checksum: checksumAccepted ? migration.checksum : undefined,
    });
  }
}

function validateAppliedMigrationHistory(
  migrations: LoadedMigration[],
  history: MigrationHistoryRecord[],
  participatingPackages?: ReadonlySet<string>,
): void {
  const migrationsByName = new Map(
    migrations.map((migration) => [migration.name, migration]),
  );
  for (const record of history) {
    const migration = migrationsByName.get(record.name);
    if (!migration) {
      if (
        participatingPackages &&
        !participatingPackages.has(record.packageName)
      ) {
        continue;
      }
      throw new Error(
        `Executed migration "${record.name}" is missing from migration sources. Package: "${record.packageName}".`,
      );
    }
    if (
      record.checksum !== migration.checksum &&
      !migration.migration.acceptedChecksums?.includes(record.checksum)
    ) {
      throw new Error(
        `Executed migration "${record.name}" checksum changed. Package: "${record.packageName}".`,
      );
    }
  }
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
