import { createCaching, type Caching } from '@nocobase/caching';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import {
  createLogging,
  type Logging,
} from '@nocobase/logging';
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

export interface AppDeps {
  caching: Caching;
  driveManager?: NocoBaseDriveManager;
  logging: Logging;
  queueManager: NocoBaseQueueManager;
  sessionManager: NocoBaseSessionManager;
}

export function createAppDeps(runtime: AppRuntime<AppConfig>): AppDeps {
  const { config } = runtime;
  const caching = createCaching(config.caching);
  const driveManager = config.drive ? createDriveManager(config.drive) : undefined;
  const logging = createLogging(config.logging);
  const sessionManager = createSessionManager(config.session ?? createNullSessionConfig());
  const queueLogger = logging.getLogger().child({ module: 'queue' });
  const queueManager = createQueueManager(config.queue ?? createSyncQueueConfig(), {
    database: runtime.database,
    logger: queueLogger,
    jobFactory: createAppJobFactory({
      database: runtime.database,
      logger: queueLogger,
    }),
  });

  return {
    caching,
    driveManager,
    logging,
    queueManager,
    sessionManager,
  };
}

export async function disposeAppDeps(deps: AppDeps): Promise<void> {
  await deps.queueManager.close();
  await Promise.all([
    deps.caching.dispose(),
    deps.logging.flush(),
    deps.sessionManager.dispose(),
  ]);
}
