import { existsSync } from 'node:fs';

import {
  createMigrator,
  type DatabaseManager,
  type MigrationRollbackResult,
  type MigrationRunResult,
} from '@nocobase/database';

import type { AppDatabaseMigrationConfig } from './types.js';

export interface AppMigrator {
  latest(): Promise<AppMigrationRunResult>;
  rollback(): Promise<AppMigrationRollbackResult>;
}

export type AppMigrationSkippedReason = 'missing-directory';

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
}

export function createAppMigrator(
  options: CreateAppMigratorOptions,
): AppMigrator {
  return {
    async latest(): Promise<AppMigrationRunResult> {
      if (!existsSync(options.config.directory)) {
        return skippedMigrationResult();
      }

      return completedRunResult(await createDatabaseMigrator(options).latest());
    },

    async rollback(): Promise<AppMigrationRollbackResult> {
      if (!existsSync(options.config.directory)) {
        return skippedMigrationResult();
      }

      return completedRollbackResult(
        await createDatabaseMigrator(options).rollback(),
      );
    },
  };
}

function createDatabaseMigrator(options: CreateAppMigratorOptions) {
  return createMigrator({
    database: options.database,
    connection: options.connection,
    directory: options.config.directory,
    tableName: options.config.tableName,
    lockTableName: options.config.lockTableName,
    extensions: options.config.extensions,
  });
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

function completedRollbackResult(
  result: MigrationRollbackResult,
): AppMigrationRollbackResult {
  return {
    status: 'completed',
    batch: result.batch,
    rolledBack: result.rolledBack,
  };
}
