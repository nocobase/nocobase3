import { createCaching, type Caching } from '@nocobase/caching';
import {
  createAuthStorage,
  createAuthentication,
} from '@nocobase/app-plugin-authentication';
import {
  createFilesRuntime,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';
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
import { joinBasePath } from '@nocobase/app-server-kit/support';
import type { Auth } from '@nocobase/app-plugin-authentication';

import { createAppJobFactory } from '../jobs/dependencies.js';
import type { AppConfig } from '../config/index.js';
import { createCookiePrefix } from './utils.js';

export interface AppDeps {
  auth: Auth;
  caching: Caching;
  filesRuntime?: FilesRuntime;
  idGenerator: SnowflakeIdGenerator;
  logging: Logging;
  queueManager: NocoBaseQueueManager;
  sessionManager: NocoBaseSessionManager;
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
  const filesRuntime = config.plugins.some(
    (plugin) =>
      plugin.packageName === '@nocobase/app-plugin-files' && plugin.enabled,
  )
    ? createFilesRuntime({
        database: requireDatabase(runtime),
        config: config.files,
        audience: config.app.name,
        secret: requireAuthSecret(config),
        basePath: joinBasePath(config.app.publicBasePath, '/api/files'),
      })
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
    filesRuntime,
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
    deps.filesRuntime?.dispose(),
    deps.logging.flush(),
    deps.sessionManager.dispose(),
  ]);
}

function requireDatabase(runtime: AppRuntime<AppConfig>) {
  if (!runtime.database) {
    throw new Error('The Files plugin requires a database connection.');
  }
  return runtime.database;
}

function requireAuthSecret(config: AppConfig): string {
  const secret = config.auth.secret?.trim();
  if (!secret) {
    throw new Error('The Files plugin requires the application auth secret.');
  }
  return secret;
}
