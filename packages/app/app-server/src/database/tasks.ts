import type { DatabaseDriverRegistration, DatabaseManager } from '@nocobase/db';

import type { ConfigPaths } from '../config/index.js';
import { createAppDatabaseManager } from './manager.js';
import { createAppMigrator, type AppMigrationRunResult } from './migrator.js';
import { createAppSeeder, type AppSeedRunResult } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import {
  planAppDatabaseTasks,
  type AppDatabaseTask,
  type AppDatabaseTaskKind,
  type AppDatabaseTaskSelection,
} from './plan.js';
import type { AppDatabaseConfig } from './types.js';

export interface AppDatabaseTaskResult {
  connection: string;
  kind: AppDatabaseTaskKind;
  status: 'completed' | 'skipped' | 'failed' | 'not-run';
  reason?: string;
  error?: string;
  batch?: number;
  executed?: string[];
  skipped?: string[];
}

export interface AppDatabaseTasksResult {
  ok: boolean;
  status: 'completed' | 'failed' | 'not-configured';
  results: AppDatabaseTaskResult[];
}

export class AppDatabaseTaskError extends Error {
  constructor(
    public readonly result: AppDatabaseTasksResult,
    cause: unknown,
  ) {
    const failed = result.results.find((entry) => entry.status === 'failed');
    super(
      `Database ${failed?.kind} failed for connection "${failed?.connection}": ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = 'AppDatabaseTaskError';
  }
}

/** Manual commands and startup share the same resolved, connection-bound plan. */
export async function executeAppDatabasePlan(
  database: DatabaseManager,
  config: AppDatabaseConfig,
  paths: ConfigPaths | undefined,
  plan: readonly AppDatabaseTask[],
  drivers?: Record<string, DatabaseDriverRegistration>,
): Promise<AppDatabaseTasksResult> {
  const result: AppDatabaseTasksResult = {
    ok: true,
    status: 'completed',
    results: [],
  };
  for (const [index, task] of plan.entries()) {
    const identity = { connection: task.connection, kind: task.kind };
    if (task.skipReason) {
      result.results.push({
        ...identity,
        status: 'skipped',
        reason: task.skipReason,
      });
      continue;
    }
    try {
      await prepareAppDatabaseStorage(
        config,
        paths,
        [task.connection],
        drivers,
      );
      const options = {
        database,
        connection: task.connection,
        config: task.config,
        sources: task.config.sources,
      };
      const completed =
        task.kind === 'migrations'
          ? await createAppMigrator(options).latest()
          : await createAppSeeder(options).run();
      result.results.push({ ...identity, ...completed });
    } catch (error) {
      result.ok = false;
      result.status = 'failed';
      result.results.push({
        ...identity,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      result.results.push(
        ...plan.slice(index + 1).map((pending): AppDatabaseTaskResult => ({
          connection: pending.connection,
          kind: pending.kind,
          status: 'not-run',
          reason: 'previous-task-failed',
        })),
      );
      throw new AppDatabaseTaskError(result, error);
    }
  }
  return result;
}

export async function runAppDatabaseTasks(
  config: AppDatabaseConfig,
  paths: ConfigPaths | undefined,
  selection: AppDatabaseTaskSelection & { kind: AppDatabaseTaskKind },
  drivers?: Record<string, DatabaseDriverRegistration>,
): Promise<AppDatabaseTasksResult> {
  const plan = planAppDatabaseTasks(
    config,
    paths,
    [selection.kind],
    selection,
    drivers,
  );
  if (!plan.length) return { ok: true, status: 'not-configured', results: [] };
  const database = createAppDatabaseManager(config, paths, {
    ...config.drivers,
    ...drivers,
  });
  if (!database) return { ok: true, status: 'not-configured', results: [] };
  try {
    return await executeAppDatabasePlan(database, config, paths, plan, drivers);
  } finally {
    await database.destroy();
  }
}

export async function runAppMigrations(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
  drivers?: Record<string, DatabaseDriverRegistration>,
): Promise<AppMigrationRunResult | undefined> {
  const result = await runAppDatabaseTasks(
    config,
    paths,
    { kind: 'migrations' },
    drivers,
  );
  const first = result.results[0];
  return (
    first && {
      status: first.status as AppMigrationRunResult['status'],
      reason: first.reason as AppMigrationRunResult['reason'],
      batch: first.batch,
      executed: first.executed,
      skipped: first.skipped,
    }
  );
}

export async function runAppSeeds(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
  drivers?: Record<string, DatabaseDriverRegistration>,
): Promise<AppSeedRunResult | undefined> {
  const result = await runAppDatabaseTasks(
    config,
    paths,
    { kind: 'seeds' },
    drivers,
  );
  const first = result.results[0];
  return (
    first && {
      status: first.status as AppSeedRunResult['status'],
      reason: first.reason as AppSeedRunResult['reason'],
      executed: first.executed,
      skipped: first.skipped,
    }
  );
}
