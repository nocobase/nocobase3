import { createCaching, type Caching } from '@nocobase/caching';
import {
  createAuthStorage,
  createAuthentication,
} from '@nocobase/app-plugin-authentication';
import {
  createDriveManager,
  type FsDriveDiskConfig,
  type NocoBaseDriveManager,
} from '@nocobase/drive';
import { SnowflakeIdGenerator } from '@nocobase/id-generator';
import { createLogging, type Logging } from '@nocobase/logging';
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
import type { Auth } from '@nocobase/app-plugin-authentication';

import { createAppJobFactory } from '../jobs/dependencies.js';
import type { AppConfig } from '../config/index.js';
import { createCookiePrefix } from './utils.js';
import {
  bindRuntimeWorkflow,
  createAppWorkflowRuntime,
  type AppWorkflowRuntime,
} from '../workflows/runtime.js';

export interface AppDeps {
  auth: Auth;
  caching: Caching;
  driveManager?: NocoBaseDriveManager;
  idGenerator: SnowflakeIdGenerator;
  logging: Logging;
  queueManager: NocoBaseQueueManager;
  sessionManager: NocoBaseSessionManager;
  workflowRuntime?: AppWorkflowRuntime;
}

export function createAppDeps(runtime: AppRuntime<AppConfig>): AppDeps {
  const { config } = runtime;
  const caching = createCaching(config.caching);
  const idGenerator = new SnowflakeIdGenerator({ workerId: 0 });
  const auth = createAuthentication({
    connection: runtime.database?.connection(),
    secondaryStorage: createAuthStorage(caching),
    appName: config.app.name,
    ...config.auth,
    advanced: {
      cookiePrefix: createCookiePrefix(config.app.name),
      ...config.auth.advanced,
      database: {
        ...config.auth.advanced?.database,
        generateId:
          config.auth.advanced?.database?.generateId ??
          (() => idGenerator.generateString()),
      },
      defaultCookieAttributes: {
        path: config.app.publicBasePath || '/',
        ...config.auth.advanced?.defaultCookieAttributes,
      },
    },
  });
  const driveManager = config.drive
    ? createDriveManager(config.drive)
    : undefined;
  const logging = createLogging(config.logging);
  const sessionManager = createSessionManager(
    config.session ?? createNullSessionConfig(),
  );
  const queueLogger = logging.getLogger().child({ module: 'queue' });
  const queueManager = createQueueManager(
    config.queue ?? createSyncQueueConfig(),
    {
      database: runtime.database,
      logger: queueLogger,
      jobFactory: createAppJobFactory({
        database: runtime.database,
        logger: queueLogger,
      }),
    },
  );
  const workflowRuntime =
    runtime.database && config.workflow
      ? createAppWorkflowRuntime({
          database: runtime.database,
          queue: queueManager,
          app: runtime,
          sourceRoot: config.workflow.sourceRoot,
          distRoot: config.workflow.distRoot ?? config.workflow.sourceRoot,
          artifactDisk: resolveWorkflowArtifactDisk(config),
          production: config.workflow.production ?? false,
          sourceResolverDiagnostic:
            config.workflow.sourceResolverDiagnostic ?? false,
          warn: (message: string): void => logging.getLogger().warn(message),
        })
      : undefined;
  bindRuntimeWorkflow(runtime, workflowRuntime);

  return {
    caching,
    auth,
    driveManager,
    idGenerator,
    logging,
    queueManager,
    sessionManager,
    workflowRuntime,
  };
}

export function resolveWorkflowArtifactDisk(
  config: AppConfig,
): FsDriveDiskConfig {
  const name = config.workflow.artifactDisk ?? config.drive.default;
  const disk = config.drive.disks[name];
  if (!disk)
    throw new Error(`Workflow Artifact disk "${name}" is not configured`);
  if (disk.driver !== 'fs')
    throw new Error(
      `Workflow Artifact disk "${name}" must use the fs/local driver`,
    );
  if (disk.visibility !== 'private')
    throw new Error(
      `Workflow Artifact disk "${name}" must have private visibility`,
    );
  return disk;
}

export async function disposeAppDeps(deps: AppDeps): Promise<void> {
  await deps.workflowRuntime?.stop();
  await deps.queueManager.close();
  await Promise.all([
    deps.caching.dispose(),
    deps.logging.flush(),
    deps.sessionManager.dispose(),
  ]);
}
