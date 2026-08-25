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

import { createAppJobFactory } from '../jobs/dependencies.js';
import type { AppConfig } from '../config/index.js';
import { createCookiePrefix } from './utils.js';

export interface AppDeps {
  auth: Auth;
  caching: Caching;
  driveManager?: NocoBaseDriveManager;
  idGenerator: SnowflakeIdGenerator;
  logging: Logging;
  queueManager: NocoBaseQueueManager;
  resolveRequestUserId(request: Request): Promise<string | undefined>;
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
    driveManager,
    idGenerator,
    logging,
    queueManager,
    resolveRequestUserId: createRequestUserIdResolver(
      auth,
      config.app.nocoBaseApiUrl,
      config.server.viteDevUrl ? '1' : undefined,
    ),
    sessionManager,
  };
}

function createRequestUserIdResolver(
  auth: Auth,
  apiUrl: string | undefined,
  developmentFallbackUserId: string | undefined,
): (request: Request) => Promise<string | undefined> {
  const normalizedApiUrl = apiUrl?.trim();
  const endpoint = normalizedApiUrl
    ? new URL('auth:check', `${normalizedApiUrl.replace(/\/$/, '')}/`)
    : undefined;

  return async (request: Request): Promise<string | undefined> => {
    if (!endpoint) {
      const session = await auth.getSession(request.headers);
      return session ? String(session.user.id) : developmentFallbackUserId;
    }

    const headers = forwardedAuthenticationHeaders(request.headers);
    if (!headers.has('authorization') && !headers.has('cookie')) {
      return developmentFallbackUserId;
    }

    try {
      const response = await fetch(endpoint, { method: 'POST', headers });
      if (!response.ok) return developmentFallbackUserId;
      return (
        userIdFromResponse(await response.json().catch(() => undefined)) ??
        developmentFallbackUserId
      );
    } catch {
      return developmentFallbackUserId;
    }
  };
}

function forwardedAuthenticationHeaders(source: Headers): Headers {
  const headers = new Headers({ accept: 'application/json' });
  for (const name of [
    'authorization',
    'cookie',
    'x-authenticator',
    'x-portal',
    'x-role',
  ]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function userIdFromResponse(value: unknown): string | undefined {
  const user =
    value && typeof value === 'object' && 'data' in value ? value.data : value;
  if (!user || typeof user !== 'object' || !('id' in user)) return undefined;
  return typeof user.id === 'string' || typeof user.id === 'number'
    ? String(user.id)
    : undefined;
}

export async function disposeAppDeps(deps: AppDeps): Promise<void> {
  await deps.queueManager.close();
  await Promise.all([
    deps.caching.dispose(),
    deps.logging.flush(),
    deps.sessionManager.dispose(),
  ]);
}
