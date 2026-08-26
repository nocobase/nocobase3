import { createCaching, type Caching } from '@nocobase/caching';
import {
  createAuthStorage,
  createAuthentication,
} from '@nocobase/app-plugin-authentication';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
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
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import type { Auth } from '@nocobase/app-plugin-authentication';
import {
  createAppAuthorization,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';

import { createAppJobFactory } from '../jobs/dependencies.js';
import type { AppConfig } from '../config/index.js';
import { createCookiePrefix } from './utils.js';
import { resolvePublicPath, toPublicRequest } from './public-request.js';

export interface AppDeps {
  auth: Auth;
  authz: AppAuthorization;
  caching: Caching;
  driveManager?: NocoBaseDriveManager;
  idGenerator: SnowflakeIdGenerator;
  logging: Logging;
  queueManager: NocoBaseQueueManager;
  sessionManager: NocoBaseSessionManager;
}

export function createAppDeps(runtime: AppRuntime<AppConfig>): AppDeps {
  const { config } = runtime;
  const caching = createCaching(config.caching);
  const idGenerator = new SnowflakeIdGenerator({ workerId: 0 });
  const authBasePath = resolvePublicPath(
    '/api/auth',
    config.app.publicBasePath,
  );
  const auth = createAuthentication({
    connection: runtime.database?.connection(),
    secondaryStorage: createAuthStorage(caching),
    appName: config.app.name,
    ...config.auth,
    baseURL: config.app.publicOrigin,
    basePath: authBasePath,
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
  const originalAuthHandler = auth.handler.bind(auth);
  auth.handler = (request: Request): Promise<Response> =>
    originalAuthHandler(toPublicRequest(request, config.app.publicBasePath));
  const authz = createAppAuthorization({
    connection: runtime.database?.connection(),
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

  return {
    caching,
    auth,
    authz,
    driveManager,
    idGenerator,
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
