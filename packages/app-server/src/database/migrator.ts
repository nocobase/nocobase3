import { existsSync } from 'node:fs';

import {
  createMigrator,
  type CreateMigratorOptions,
  type DatabaseManager,
  type MigrationSource,
  type MigrationMetadataRestoreResult,
  type MigrationRollbackResult,
  type MigrationRunResult,
} from '@nocobase/database';

import type { AppDatabaseMigrationConfig } from './types.js';

export interface AppMigrator {
  latest(): Promise<AppMigrationRunResult>;
  restoreMetadata(): Promise<AppMigrationMetadataRestoreResult>;
  rollback(): Promise<AppMigrationRollbackResult>;
}

export type AppMigrationSkippedReason = 'missing-directory';

export interface AppMigrationMetadataRestoreResult {
  status: 'completed' | 'skipped';
  reason?: AppMigrationSkippedReason;
  restored?: string[];
}

export interface AppMigrationRunResult {
  status: 'completed' | 'skipped';
  reason?: AppMigrationSkippedReason;
  batch?: number;
  executed?: string[];
  skipped?: string[];
}

export interface AppMigrationRollbackResult {
  status: 'completed' | 'skipped';
  reason?: AppMigrationSkippedReason;
  batch?: number;
  rolledBack?: string[];
}

export interface CreateAppMigratorOptions {
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

    async restoreMetadata(): Promise<AppMigrationMetadataRestoreResult> {
      if (!hasMigrationDirectory(options)) {
        return skippedMetadataRestoreResult();
      }

      return completedMetadataRestoreResult(
        await createDatabaseMigrator(options).restoreMetadata(),
      );
    },

    async rollback(): Promise<AppMigrationRollbackResult> {
      if (!hasMigrationDirectory(options)) {
        return skippedMigrationResult();
      }

      return completedRollbackResult(
        await createDatabaseMigrator(options).rollback(),
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
    database: options.database,
    connection: options.connection,
    tableName: options.config.tableName,
    lockTableName: options.config.lockTableName,
    extensions: options.config.extensions,
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
  AppMigrationRollbackResult {
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
  };
}

function skippedMetadataRestoreResult(): AppMigrationMetadataRestoreResult {
  return {
    status: 'skipped',
    reason: 'missing-directory',
  };
}

function completedMetadataRestoreResult(
  result: MigrationMetadataRestoreResult,
): AppMigrationMetadataRestoreResult {
  return {
    status: 'completed',
    restored: result.restored,
  };
}

function completedRollbackResult(
  result: MigrationRollbackResult,
): AppMigrationRollbackResult {
  return {
    status: 'completed',
    batch: result.batch,
    rolledBack: result.rolledBack,
  };
}
