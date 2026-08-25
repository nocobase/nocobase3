import path from 'node:path';

import {
  prepareAppDatabaseStorage,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';
import { createAppRuntime } from '@nocobase/app-server/runtime';
import {
  createAuthentication,
  type Auth,
  type AuthSession,
} from '@nocobase/app-plugin-authentication';
import type { DatabaseManager } from '@nocobase/database';

export interface NativeAuthRuntimeOptions {
  appName: string;
  authBasePath: string;
  authSecret: string;
  databasePath: string;
  migrationsDirectory: string;
  publicBasePath: string;
  baseURL?: string;
}

export interface NativeAuthRuntime {
  readonly database: DatabaseManager;
  close(): Promise<void>;
  getSession(headers: Headers): Promise<AuthSession>;
  handle(request: Request): Promise<Response>;
  ready(): Promise<void>;
}

export function createNativeAuthRuntime(
  options: NativeAuthRuntimeOptions,
): NativeAuthRuntime {
  const databaseConfig: AppDatabaseConfig = {
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        filename: path.resolve(options.databasePath),
      },
    },
    migrations: {
      directory: path.resolve(options.migrationsDirectory),
      autoRun: true,
    },
  };
  const appRuntime = createAppRuntime({ database: databaseConfig });
  const database = appRuntime.database;
  if (!database) {
    throw new Error('Hub native authentication requires a database.');
  }

  const auth: Auth = createAuthentication({
    connection: database.connection(),
    appName: options.appName,
    basePath: options.authBasePath,
    baseURL: options.baseURL,
    secret: options.authSecret,
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
    },
    session: {
      storeSessionInDatabase: true,
    },
    advanced: {
      cookiePrefix: createCookiePrefix(options.appName),
      defaultCookieAttributes: {
        path: options.publicBasePath || '/',
        httpOnly: true,
        sameSite: 'lax',
      },
    },
  });
  let readyPromise: Promise<void> | undefined;

  const ready = (): Promise<void> => {
    readyPromise ??= initialize();
    return readyPromise;
  };
  const initialize = async (): Promise<void> => {
    await prepareAppDatabaseStorage(databaseConfig);
    const result = await appRuntime.runMigrations();
    if (result?.status === 'skipped') {
      throw new Error(
        `Hub authentication migrations are unavailable: ${result.reason ?? 'unknown reason'}`,
      );
    }
  };

  return {
    database,
    ready,
    async handle(request: Request): Promise<Response> {
      await ready();
      return auth.handler(request);
    },
    async getSession(headers: Headers): Promise<AuthSession> {
      await ready();
      return auth.getSession(headers);
    },
    close: () => appRuntime.dispose(),
  };
}

function createCookiePrefix(appName: string): string {
  const normalized = appName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'nocobase3-hub';
}
