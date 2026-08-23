import {
  createCacheManager,
  createNullCacheConfig,
  type NocoBaseCacheManager,
} from '@nocobase/cache';
import { createDriveManager, type FsDriveDiskConfig, type NocoBaseDriveManager } from '@nocobase/drive';
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
      distRoot: config.workflow.distRoot ?? config.workflow.sourceRoot,
      artifactDisk: resolveWorkflowArtifactDisk(config),
      production: config.workflow.production ?? false,
      sourceResolverDiagnostic: config.workflow.sourceResolverDiagnostic ?? false,
      warn: (message: string): void => loggerManager.use().warn(message),
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

export function resolveWorkflowArtifactDisk(config: AppConfig): FsDriveDiskConfig {
  const name = config.workflow.artifactDisk ?? config.drive.default;
  const disk = config.drive.disks[name];
  if (!disk) throw new Error(`Workflow Artifact disk "${name}" is not configured`);
  if (disk.driver !== 'fs') throw new Error(`Workflow Artifact disk "${name}" must use the fs/local driver`);
  if (disk.visibility !== 'private') throw new Error(`Workflow Artifact disk "${name}" must have private visibility`);
  return disk;
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
