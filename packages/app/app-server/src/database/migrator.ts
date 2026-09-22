import { createTaskServiceResolver } from './task-container.js';
import type { ServiceResolver } from '@nocobase/service-provider';
import { snapshotDatabaseTaskConfig } from './task-config.js';
import type { DatabaseTaskConfig } from '@nocobase/db';
import { existsSync } from 'node:fs';

import {
  createMigrator,
  type ChecksumMismatch,
  type CreateMigratorOptions,
  type DatabaseManager,
  type MigrationRepairOptions,
  type MigrationRepairResult,
  type MigrationHistoryRecord,
  type MigrationSource,
  type MigrationRollbackOptions,
  type MigrationRollbackResult,
  type StaleTaskLockTakeover,
  type TaskLockReleaseOptions,
  type TaskLockReleaseResult,
  type MigrationRunResult,
} from '@nocobase/db';

import type { AppDatabaseMigrationConfig } from './types.js';

export interface AppMigrator {
  latest(): Promise<AppMigrationRunResult>;
  fresh(): Promise<AppMigrationRunResult>;
  rollback(
    options?: MigrationRollbackOptions,
  ): Promise<AppMigrationRollbackResult>;
  repair(options?: MigrationRepairOptions): Promise<AppMigrationRepairResult>;
  unlock(options?: TaskLockReleaseOptions): Promise<AppTaskLockReleaseResult>;
}

/** A lock release, or the reason it was left alone. */
export interface AppTaskLockReleaseResult extends TaskLockReleaseResult {
  status: 'completed';
}

export type AppMigrationSkippedReason = 'missing-directory';

export interface AppMigrationRunResult {
  status: 'completed' | 'skipped';
  reason?: AppMigrationSkippedReason;
  batch?: number;
  executed?: string[];
  skipped?: string[];
  warnings?: ChecksumMismatch[];
}

export interface AppMigrationRollbackResult {
  status: 'completed' | 'skipped';
  reason?: AppMigrationSkippedReason;
  batch?: number;
  rolledBack?: string[];
  /** The batch's history records, in the order they roll back. */
  records?: MigrationHistoryRecord[];
  warnings?: ChecksumMismatch[];
  dryRun?: boolean;
}

export interface AppMigrationRepairResult {
  status: 'completed' | 'skipped';
  reason?: AppMigrationSkippedReason;
  repaired?: ChecksumMismatch[];
  dryRun?: boolean;
}

export interface CreateAppMigratorOptions {
  runtimeConfig?: DatabaseTaskConfig;
  container?: ServiceResolver;
  database: DatabaseManager;
  config: AppDatabaseMigrationConfig;
  connection?: string;
  sources?: readonly MigrationSource[];
  /** Reported when a lock whose holder stopped beating is taken over. */
  onStaleLock?: (takeover: StaleTaskLockTakeover) => void;
}

export function createAppMigrator(
  options: CreateAppMigratorOptions,
): AppMigrator {
  return {
    async latest(): Promise<AppMigrationRunResult> {
      if (!hasMigrationDirectory(options)) {
        return skippedMigrationResult();
      }

      return completedRunResult(await createDatabaseMigrator(options).latest());
    },

    async fresh(): Promise<AppMigrationRunResult> {
      const connection = options.database.connection(options.connection);
      await connection.resetManagedSchema();
      if (!hasMigrationDirectory(options)) {
        return {
          status: 'completed',
          batch: 0,
          executed: [],
          skipped: [],
        };
      }
      return completedRunResult(await createDatabaseMigrator(options).latest());
    },

    async rollback(
      rollbackOptions?: MigrationRollbackOptions,
    ): Promise<AppMigrationRollbackResult> {
      if (!hasMigrationDirectory(options)) {
        return skippedMigrationResult();
      }

      return completedRollbackResult(
        await createDatabaseMigrator(options).rollback(rollbackOptions),
      );
    },

    // Unlocking needs no migration directory: the lock exists whether or not
    // this application owns migrations, because plugins and startup share it.
    async unlock(
      releaseOptions?: TaskLockReleaseOptions,
    ): Promise<AppTaskLockReleaseResult> {
      return {
        status: 'completed',
        ...(await createDatabaseMigrator(options).unlock(releaseOptions)),
      };
    },

    async repair(
      repairOptions?: MigrationRepairOptions,
    ): Promise<AppMigrationRepairResult> {
      if (!hasMigrationDirectory(options)) {
        return skippedMigrationResult();
      }

      return completedRepairResult(
        await createDatabaseMigrator(options).repair(repairOptions),
      );
    },
  };
}

function createDatabaseMigrator(options: CreateAppMigratorOptions) {
  return createMigrator(createDatabaseMigratorOptions(options));
}

function createDatabaseMigratorOptions(
  options: CreateAppMigratorOptions,
): CreateMigratorOptions {
  const common = {
    config: snapshotDatabaseTaskConfig(options.runtimeConfig),
    container: createTaskServiceResolver(options.container),
    database: options.database,
    connection: options.connection,
    tableName: options.config.tableName,
    lockTableName: options.config.lockTableName,
    extensions: options.config.extensions,
    onChecksumMismatch: options.config.onChecksumMismatch,
    onStaleLock: options.onStaleLock,
  };

  if (options.sources) {
    return {
      ...common,
      sources: options.sources,
    };
  }

  return {
    ...common,
    directory: options.config.directory,
    packageName: options.config.packageName,
  };
}

function hasMigrationDirectory(options: CreateAppMigratorOptions): boolean {
  if (options.sources) {
    return options.sources.some((source) => existsSync(source.directory));
  }

  return existsSync(options.config.directory);
}

function skippedMigrationResult(): AppMigrationRunResult &
  AppMigrationRollbackResult &
  AppMigrationRepairResult {
  return {
    status: 'skipped',
    reason: 'missing-directory',
  };
}

function completedRunResult(result: MigrationRunResult): AppMigrationRunResult {
  return {
    status: 'completed',
    batch: result.batch,
    executed: result.executed,
    skipped: result.skipped,
    warnings: result.warnings,
  };
}

function completedRollbackResult(
  result: MigrationRollbackResult,
): AppMigrationRollbackResult {
  return {
    status: 'completed',
    batch: result.batch,
    rolledBack: result.rolledBack,
    records: result.records,
    warnings: result.warnings,
    dryRun: result.dryRun,
  };
}

function completedRepairResult(
  result: MigrationRepairResult,
): AppMigrationRepairResult {
  return {
    status: 'completed',
    repaired: result.repaired,
    dryRun: result.dryRun,
  };
}
