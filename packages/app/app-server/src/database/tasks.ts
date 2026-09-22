import { createTaskServiceResolver } from './task-container.js';
import type { ServiceResolver } from '@nocobase/service-provider';
import { snapshotDatabaseTaskConfig } from './task-config.js';
import type { DatabaseTaskConfig } from '@nocobase/db';
import { resolveDatabaseConfig } from './resolve-config.js';
import {
  planAppRuntimeDatabaseTasks,
  type AppRuntimeDatabaseTaskPlanOptions,
  type AppDatabaseTask,
  type AppDatabaseTaskKind,
} from './plan.js';
import {
  resolveDatabaseDriver,
  type ChecksumMismatch,
  type DatabaseDriverRegistration,
  type DatabaseManager,
} from '@nocobase/db';

import type { AppPaths } from '../config/index.js';
import { createAppDatabaseManager } from './manager.js';
import { createAppMigrator, type AppMigrationRunResult } from './migrator.js';
import { createAppSeeder, type AppSeedRunResult } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import type { AppDatabaseConfig } from './types.js';

/** `repair` realigns recorded checksums; it executes no migration or seed. */
export type AppDatabaseTaskOperation = 'run' | 'repair';

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
  /** Checksum drift tolerated by the `warn` policy during a run. */
  warnings?: ChecksumMismatch[];
  /** Records a repair rewrote, or that a dry run would rewrite. */
  repaired?: ChecksumMismatch[];
  dryRun?: boolean;
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
  readonly runtimeConfig?: DatabaseTaskConfig;
  readonly container?: ServiceResolver;
  readonly paths?: AppPaths;
  readonly drivers?: Record<string, DatabaseDriverRegistration>;
  readonly fresh?: boolean;
  readonly operation?: AppDatabaseTaskOperation;
  /** Repair only: report what would be rewritten without writing anything. */
  readonly dryRun?: boolean;
}

/** Manual commands and startup share the same resolved, connection-bound plan. */
export async function executeAppDatabasePlan(
  database: DatabaseManager,
  config: AppDatabaseConfig,
  plan: readonly AppDatabaseTask[],
  {
    paths,
    drivers,
    fresh = false,
    operation = 'run',
    dryRun = false,
    runtimeConfig,
    container,
  }: AppDatabasePlanExecutionOptions = {},
): Promise<AppDatabaseTasksResult> {
  if (fresh) {
    if (operation !== 'run')
      throw new Error('A fresh run cannot be combined with repair.');
    assertFreshPlanOrder(plan);
  }
  const taskContainer = createTaskServiceResolver(container);
  const taskConfig = snapshotDatabaseTaskConfig(runtimeConfig);
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
        runtimeConfig: taskConfig,
        container: taskContainer,
        database,
        connection: task.connection,
        config: task.config,
        sources: task.config.sources,
      };
      const completed =
        operation === 'repair'
          ? task.kind === 'migrations'
            ? await createAppMigrator(options).repair({ dryRun })
            : await createAppSeeder(options).repair({ dryRun })
          : task.kind === 'migrations'
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

/**
 * A fresh run drops a connection's managed schema inside its migrations task,
 * so every other task on that connection has to come after it. The planner
 * already orders tasks this way; the check guards hand-built plans, which
 * would otherwise seed a database that is about to be emptied.
 */
function assertFreshPlanOrder(plan: readonly AppDatabaseTask[]): void {
  const rebuilt = new Set<string>();
  for (const task of plan) {
    if (task.skipReason) continue;
    if (task.kind === 'migrations') {
      rebuilt.add(task.connection);
      continue;
    }
    if (!rebuilt.has(task.connection)) {
      throw new Error(
        `A fresh run must rebuild connection "${task.connection}" before its ${task.kind} run.`,
      );
    }
  }
  if (!rebuilt.size) {
    throw new Error('A fresh run must include migrations.');
  }
}

export interface AppDatabaseTaskRunOptions extends AppRuntimeDatabaseTaskPlanOptions {
  /** Borrow a database manager; its owner remains responsible for disposal. */
  readonly database?: () => DatabaseManager;
  readonly container?: ServiceResolver;
  /**
   * One task kind, or several planned together. Several kinds share one plan
   * so their order is the plan's, which is what lets `fresh` rebuild a
   * connection's schema before that connection's seeds run.
   */
  readonly kind: AppDatabaseTaskKind | readonly AppDatabaseTaskKind[];
  readonly operation?: AppDatabaseTaskOperation;
  /** Repair only: report what would be rewritten without writing anything. */
  readonly dryRun?: boolean;
}

export async function runAppDatabaseTasks(
  config: AppDatabaseConfig,
  options: AppDatabaseTaskRunOptions,
): Promise<AppDatabaseTasksResult> {
  const { paths, drivers } = options;
  const kinds = Array.isArray(options.kind)
    ? (options.kind as readonly AppDatabaseTaskKind[])
    : [options.kind as AppDatabaseTaskKind];
  if (options.fresh && !kinds.includes('migrations')) {
    throw new Error('A fresh run must include migrations.');
  }
  config = await resolveDatabaseConfig({
    ...config,
    drivers: { ...config.drivers, ...drivers },
  });
  const plan = planAppRuntimeDatabaseTasks(config, kinds, options);
  if (!plan.length) return { ok: true, status: 'not-configured', results: [] };
  if (options.fresh) {
    for (const task of plan) {
      if (task.skipReason) continue;
      const connection = config.connections[task.connection];
      const driver = resolveDatabaseDriver(
        {
          dialect: connection.dialect,
          databaseDriver: connection.databaseDriver,
        },
        { ...config.drivers, ...drivers },
        task.connection,
      );
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
  const database = options.database
    ? options.database()
    : createAppDatabaseManager(config, paths, {
        ...config.drivers,
        ...drivers,
      });
  if (!database) return { ok: true, status: 'not-configured', results: [] };
  try {
    return await executeAppDatabasePlan(database, config, plan, {
      paths,
      drivers,
      fresh: options.fresh,
      operation: options.operation,
      dryRun: options.dryRun,
      runtimeConfig: options.runtimeConfig,
      container: options.container,
    });
  } finally {
    if (!options.database) await database.destroy();
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
