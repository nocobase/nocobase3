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
  type MigrationSource,
  type MigrationRollbackResult,
  type MigrationRunResult,
} from '@nocobase/db';

import type { AppDatabaseMigrationConfig } from './types.js';

export interface AppMigrator {
  latest(): Promise<AppMigrationRunResult>;
  fresh(): Promise<AppMigrationRunResult>;
  rollback(): Promise<AppMigrationRollbackResult>;
  repair(options?: MigrationRepairOptions): Promise<AppMigrationRepairResult>;
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
  warnings?: ChecksumMismatch[];
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

    async rollback(): Promise<AppMigrationRollbackResult> {
      if (!hasMigrationDirectory(options)) {
        return skippedMigrationResult();
      }

      return completedRollbackResult(
        await createDatabaseMigrator(options).rollback(),
      );
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
    warnings: result.warnings,
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
