import {
  createCacheManager,
  createNullCacheConfig,
  type NocoBaseCacheManager,
} from '@nocobase/cache';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import {
  createDefaultLoggingConfig,
  Logging,
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
  cacheManager: NocoBaseCacheManager;
  driveManager?: NocoBaseDriveManager;
  logging: Logging;
  queueManager: NocoBaseQueueManager;
  sessionManager: NocoBaseSessionManager;
}

export function createAppDeps(runtime: AppRuntime<AppConfig>): AppDeps {
  const { config } = runtime;
  const cacheManager = createCacheManager(config.cache ?? createNullCacheConfig());
  const driveManager = config.drive ? createDriveManager(config.drive) : undefined;
  const logging = new Logging(config.logging ?? createDefaultLoggingConfig());
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
    cacheManager,
    driveManager,
    logging,
    queueManager,
    sessionManager,
  };
}

export async function disposeAppDeps(deps: AppDeps): Promise<void> {
  await deps.queueManager.close();
  await Promise.all([
    deps.cacheManager.disconnectAll(),
    deps.logging.flush(),
    deps.sessionManager.dispose(),
  ]);
}
