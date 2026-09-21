import { createTaskServiceResolver } from './task-container.js';
import type { ServiceResolver } from '@nocobase/service-provider';
import { snapshotDatabaseTaskConfig } from './task-config.js';
import type { DatabaseTaskConfig } from '@nocobase/db';
import { existsSync } from 'node:fs';

import {
  createSeeder,
  type CreateSeederOptions,
  type DatabaseManager,
  type Seeder,
  type SeedRunResult,
  type SeedSource,
} from '@nocobase/db';

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
  runtimeConfig?: DatabaseTaskConfig;
  container?: ServiceResolver;
  database: DatabaseManager;
  config: AppDatabaseSeedConfig;
  connection?: string;
  sources?: readonly SeedSource[];
}

export function createAppSeeder(options: CreateAppSeederOptions): AppSeeder {
  return {
    async run(): Promise<AppSeedRunResult> {
      if (!hasSeedDirectory(options)) {
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
  return createSeeder(createDatabaseSeederOptions(options));
}

function createDatabaseSeederOptions(
  options: CreateAppSeederOptions,
): CreateSeederOptions {
  const common = {
    config: snapshotDatabaseTaskConfig(options.runtimeConfig),
    container: createTaskServiceResolver(options.container),
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

function hasSeedDirectory(options: CreateAppSeederOptions): boolean {
  if (options.sources) {
    return options.sources.some((source) => existsSync(source.directory));
  }

  return existsSync(options.config.directory);
}

function completedRunResult(result: SeedRunResult): AppSeedRunResult {
  return {
    status: 'completed',
    executed: result.executed,
    skipped: result.skipped,
  };
}
