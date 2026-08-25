import path from 'node:path';

import {
  prepareAppDatabaseStorage,
  type AppDatabaseConfig,
} from '@nocobase/app-server-kit/database';
import { createAppRuntime } from '@nocobase/app-server-kit/runtime';
import {
  AppAccessControlError,
  createAppAccessControlService,
  createCredentialUser,
  type AppAccessControlService,
  type CredentialUserInput,
} from '@nocobase/app-plugin-access-control/server';
import {
  createAuthentication,
  type Auth,
  type AuthSession,
} from '@nocobase/app-plugin-authentication';
import type { DatabaseManager } from '@nocobase/app-database';

import { ordersAccessControlDefinition } from './access-control.js';
import { DatabaseOrdersStore } from './database-store.js';

export interface OrdersRuntimeOptions {
  appName: string;
  authBasePath: string;
  authSecret: string;
  baseURL?: string;
  databasePath: string;
  migrationsDirectory: string;
  publicBasePath: string;
  seedsDirectory: string;
}

export interface OrdersDatabaseRuntimeResource {
  id: 'database:primary';
  kind: 'database';
  name: string;
  status: 'active' | 'error';
  provider: '@nocobase/app-database';
  updatedAt: string;
  details?: {
    connectionName: string;
    dialect: string;
    driver: string;
  };
  error: { code: string; message: string } | null;
}

export interface OrdersRuntime {
  readonly access: AppAccessControlService;
  readonly database: DatabaseManager;
  readonly store: DatabaseOrdersStore;
  close(): Promise<void>;
  createCredentialUser(input: CredentialUserInput): Promise<string>;
  databaseStatus(): Promise<OrdersDatabaseRuntimeResource>;
  getSession(headers: Headers): Promise<AuthSession>;
  handleAuth(request: Request): Promise<Response>;
  ready(): Promise<void>;
}

export function createOrdersRuntime(
  options: OrdersRuntimeOptions,
): OrdersRuntime {
  const databaseConfig: AppDatabaseConfig = {
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        filename: path.resolve(options.databasePath),
        naming: { underscored: false },
      },
    },
    migrations: {
      directory: path.resolve(options.migrationsDirectory),
      autoRun: true,
    },
    seeds: {
      directory: path.resolve(options.seedsDirectory),
      autoRun: true,
    },
  };
  const appRuntime = createAppRuntime({ database: databaseConfig });
  const database = appRuntime.database;
  if (!database) throw new Error('Orders runtime requires a database.');

  const auth: Auth = createAuthentication({
    connection: database.connection(),
    appName: options.appName,
    basePath: options.authBasePath,
    baseURL: options.baseURL,
    secret: options.authSecret,
    emailAndPassword: { enabled: true, autoSignIn: false },
    session: { storeSessionInDatabase: true },
    advanced: {
      cookiePrefix: createCookiePrefix(options.appName),
      defaultCookieAttributes: {
        path: options.publicBasePath || '/',
        httpOnly: true,
        sameSite: 'lax',
      },
    },
  });
  const access = createAppAccessControlService(
    database,
    ordersAccessControlDefinition,
  );
  const store = new DatabaseOrdersStore(database);
  let readyPromise: Promise<void> | undefined;
  const ready = (): Promise<void> => {
    readyPromise ??= initialize();
    return readyPromise;
  };
  const initialize = async (): Promise<void> => {
    await prepareAppDatabaseStorage(databaseConfig);
    const migration = await appRuntime.runMigrations();
    if (migration?.status === 'skipped') {
      throw new Error(
        `Orders migrations are unavailable: ${migration.reason ?? 'unknown reason'}`,
      );
    }
    const seed = await appRuntime.runSeeds();
    if (seed?.status === 'skipped') {
      throw new Error(
        `Orders seeds are unavailable: ${seed.reason ?? 'unknown reason'}`,
      );
    }
  };

  return {
    access,
    database,
    store,
    ready,
    async createCredentialUser(input: CredentialUserInput): Promise<string> {
      await ready();
      return createCredentialUser(input, {
        authBasePath: options.authBasePath,
        baseURL: options.baseURL,
        handle: (request) => auth.handler(request),
        async verify(userId: string): Promise<boolean> {
          return Boolean(
            await database
              .query()
              .selectFrom('user')
              .select('id')
              .where('id', '=', userId)
              .executeTakeFirst(),
          );
        },
      });
    },
    async databaseStatus(): Promise<OrdersDatabaseRuntimeResource> {
      const updatedAt = new Date().toISOString();
      try {
        await ready();
        const connection = database.connection();
        await database
          .query()
          .selectFrom('app_orders_orders')
          .select('id')
          .limit(1)
          .execute();
        return {
          id: 'database:primary',
          kind: 'database',
          name: '订单 App 主数据库',
          status: 'active',
          provider: '@nocobase/app-database',
          updatedAt,
          details: {
            connectionName: connection.name,
            dialect: connection.dialect,
            driver: connection.driver,
          },
          error: null,
        };
      } catch {
        return {
          id: 'database:primary',
          kind: 'database',
          name: '订单 App 主数据库',
          status: 'error',
          provider: '@nocobase/app-database',
          updatedAt,
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: '数据库连接检查失败，请查看 Runtime 日志。',
          },
        };
      }
    },
    async handleAuth(request: Request): Promise<Response> {
      await ready();
      return auth.handler(request);
    },
    async getSession(headers: Headers): Promise<AuthSession> {
      await ready();
      const session = await auth.getSession(headers);
      if (!session) return null;
      try {
        await access.assertActiveMember(session.user.id);
        return session;
      } catch (error) {
        if (
          error instanceof AppAccessControlError &&
          error.code.endsWith('_MEMBER_DISABLED')
        ) {
          return null;
        }
        throw error;
      }
    },
    close: () => appRuntime.dispose(),
  };
}

function createCookiePrefix(appName: string): string {
  return (
    appName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'nocobase3-orders'
  );
}
