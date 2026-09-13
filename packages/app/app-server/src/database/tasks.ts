import type { DatabaseDriverRegistration, DatabaseManager } from '@nocobase/db';

import type { ConfigPaths } from '../config/index.js';
import {
  createAppDatabaseManager,
  resolveAppDatabaseDriver,
} from './manager.js';
import { createAppMigrator, type AppMigrationRunResult } from './migrator.js';
import { createAppSeeder, type AppSeedRunResult } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import {
  planAppDatabaseTasks,
  type AppDatabaseTask,
  type AppDatabaseTaskKind,
  type AppDatabaseTaskPlanOptions,
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
  fresh?: boolean;
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

export interface AppDatabasePlanExecutionOptions {
  readonly paths?: ConfigPaths;
  readonly drivers?: Record<string, DatabaseDriverRegistration>;
  readonly fresh?: boolean;
}

/** Manual commands and startup share the same resolved, connection-bound plan. */
export async function executeAppDatabasePlan(
  database: DatabaseManager,
  config: AppDatabaseConfig,
  plan: readonly AppDatabaseTask[],
  { paths, drivers, fresh = false }: AppDatabasePlanExecutionOptions = {},
): Promise<AppDatabaseTasksResult> {
  if (fresh && plan.some((task) => task.kind !== 'migrations')) {
    throw new Error('--fresh is only supported for migrations.');
  }
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
          ? await (fresh
              ? createAppMigrator(options).fresh()
              : createAppMigrator(options).latest())
          : await createAppSeeder(options).run();
      result.results.push({
        ...identity,
        ...completed,
        ...(fresh ? { fresh: true } : {}),
      });
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

export interface AppDatabaseTaskRunOptions extends AppDatabaseTaskPlanOptions {
  readonly kind: AppDatabaseTaskKind;
}

export async function runAppDatabaseTasks(
  config: AppDatabaseConfig,
  options: AppDatabaseTaskRunOptions,
): Promise<AppDatabaseTasksResult> {
  const { paths, drivers } = options;
  if (options.fresh && options.kind !== 'migrations') {
    throw new Error('--fresh is only supported for migrations.');
  }
  const plan = planAppDatabaseTasks(config, [options.kind], options);
  if (!plan.length) return { ok: true, status: 'not-configured', results: [] };
  if (options.fresh) {
    for (const task of plan) {
      if (task.skipReason) continue;
      const connection = config.connections[task.connection];
      const driver =
        connection?.databaseDriver ??
        resolveAppDatabaseDriver(connection?.dialect ?? '', {
          ...config.drivers,
          ...drivers,
        });
      if (!driver?.resetManagedSchema) {
        throw new Error(
          `Database driver for connection "${task.connection}" does not support managed schema reset.`,
        );
      }
    }
    if (options.confirmFresh && !(await options.confirmFresh(plan))) {
      throw new Error('Fresh migration cancelled.');
    }
  }
  const database = createAppDatabaseManager(config, paths, {
    ...config.drivers,
    ...drivers,
  });
  if (!database) return { ok: true, status: 'not-configured', results: [] };
  try {
    return await executeAppDatabasePlan(database, config, plan, {
      paths,
      drivers,
      fresh: options.fresh,
    });
  } finally {
    await database.destroy();
  }
}

export async function runAppMigrations(
  config: AppDatabaseConfig,
  options: Omit<AppDatabaseTaskRunOptions, 'kind'>,
): Promise<AppMigrationRunResult | undefined> {
  const result = await runAppDatabaseTasks(config, {
    ...options,
    kind: 'migrations',
  });
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
  options: Omit<AppDatabaseTaskRunOptions, 'kind'>,
): Promise<AppSeedRunResult | undefined> {
  const result = await runAppDatabaseTasks(config, {
    ...options,
    kind: 'seeds',
  });
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
