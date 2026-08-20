import {
  createCacheManager,
  createNullCacheConfig,
  type NocoBaseCacheManager,
} from '@nocobase/cache';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import {
  createLoggerManager,
  createSilentLoggerConfig,
  type NocoBaseLoggerManager,
} from '@nocobase/logger';
import {
  createQueueManager,
  createSyncQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import {
  createNullSessionConfig,
  createSessionManager,
  type NocoBaseSessionManager,
} from '@nocobase/session';
import type { AppRuntime } from '@nocobase/app-server/runtime';
import { createAppJobFactory } from '../jobs/dependencies.js';
import type { AppConfig } from '../config/index.js';
import {
  bindRuntimeWorkflow,
  createAppWorkflowRuntime,
  type AppWorkflowRuntime,
} from '../workflows/runtime.js';

export interface AppDeps {
  cacheManager: NocoBaseCacheManager;
  driveManager?: NocoBaseDriveManager;
  loggerManager: NocoBaseLoggerManager;
  queueManager: NocoBaseQueueManager;
  sessionManager: NocoBaseSessionManager;
  workflowRuntime?: AppWorkflowRuntime;
}

export function createAppDeps(runtime: AppRuntime<AppConfig>): AppDeps {
  const { config } = runtime;
  const cacheManager = createCacheManager(config.cache ?? createNullCacheConfig());
  const driveManager = config.drive ? createDriveManager(config.drive) : undefined;
  const loggerManager = createLoggerManager(config.logger ?? createSilentLoggerConfig());
  const sessionManager = createSessionManager(config.session ?? createNullSessionConfig());
  const queueLogger = loggerManager.use().child({ module: 'queue' });
  const queueManager = createQueueManager(config.queue ?? createSyncQueueConfig(), {
    database: runtime.database,
    logger: queueLogger,
    jobFactory: createAppJobFactory({
      database: runtime.database,
      logger: queueLogger,
    }),
  });

  const workflowRuntime = runtime.database
    ? createAppWorkflowRuntime({
      database: runtime.database,
      queue: queueManager,
      app: runtime,
      sourceRoot: config.workflow.sourceRoot,
    })
    : undefined;
  bindRuntimeWorkflow(runtime, workflowRuntime);

  return {
    cacheManager,
    driveManager,
    loggerManager,
    queueManager,
    sessionManager,
    workflowRuntime,
  };
}

export async function disposeAppDeps(deps: AppDeps): Promise<void> {
  await deps.workflowRuntime?.stop();
  await deps.queueManager.close();
  await Promise.all([
    deps.cacheManager.disconnectAll(),
    deps.loggerManager.flushAll(),
    deps.sessionManager.dispose(),
  ]);
}
