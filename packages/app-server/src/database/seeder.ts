import { existsSync } from 'node:fs';

import {
  createSeeder,
  type DatabaseManager,
  type Seeder,
  type SeedRunResult,
} from '@nocobase/database';

import type { AppDatabaseSeedConfig } from './types.js';

export interface AppSeeder {
  run(): Promise<AppSeedRunResult>;
}

export type AppSeedSkippedReason = 'missing-directory';

export interface AppSeedRunResult {
  status: 'completed' | 'skipped';
  reason?: AppSeedSkippedReason;
  executed?: string[];
  skipped?: string[];
}

export interface CreateAppSeederOptions {
  database: DatabaseManager;
  config: AppDatabaseSeedConfig;
  connection?: string;
}

export function createAppSeeder(options: CreateAppSeederOptions): AppSeeder {
  return {
    async run(): Promise<AppSeedRunResult> {
      if (!existsSync(options.config.directory)) {
        return {
          status: 'skipped',
          reason: 'missing-directory',
        };
      }

      return completedRunResult(await createDatabaseSeeder(options).run());
    },
  };
}

function createDatabaseSeeder(options: CreateAppSeederOptions): Seeder {
  return createSeeder({
    database: options.database,
    connection: options.connection,
    directory: options.config.directory,
    packageName: options.config.packageName,
    tableName: options.config.tableName,
    lockTableName: options.config.lockTableName,
    extensions: options.config.extensions,
  });
}

function completedRunResult(result: SeedRunResult): AppSeedRunResult {
  return {
    status: 'completed',
    executed: result.executed,
    skipped: result.skipped,
  };
}
