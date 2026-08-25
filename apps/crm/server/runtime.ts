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

import {
  createCrmAccessService,
  type CrmAccessService,
} from './services/access.js';
import { createCrmService, type CrmService } from './services/crm.js';
import {
  reconcileCrmSeed,
  reconcileLegacyPreviewAdmin,
} from './services/seed.js';

export interface CrmRuntimeOptions {
  appName: string;
  authBasePath: string;
  authSecret: string;
  databasePath: string;
  migrationsDirectory: string;
  publicBasePath: string;
  seedPath: string;
  allowAdditionalSignUp?: boolean;
  baseURL?: string;
}

export interface CrmDatabaseRuntimeResource {
  id: 'database:primary';
  kind: 'database';
  name: string;
  status: 'active' | 'error';
  provider: '@nocobase/database';
  updatedAt: string;
  details?: {
    connectionName: string;
    dialect: string;
    driver: string;
  };
  error: { code: string; message: string } | null;
}

export interface CrmRuntime {
  readonly access: CrmAccessService;
  readonly database: DatabaseManager;
  readonly service: CrmService;
  close(): Promise<void>;
  createCredentialUser(input: CrmCredentialUserInput): Promise<string>;
  databaseStatus(): Promise<CrmDatabaseRuntimeResource>;
  getSession(headers: Headers): Promise<AuthSession>;
  handleAuth(request: Request): Promise<Response>;
  ready(): Promise<void>;
}

export interface CrmCredentialUserInput {
  name: string;
  username: string;
  email: string;
  password: string;
}

export function createCrmRuntime(options: CrmRuntimeOptions): CrmRuntime {
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
  };
  const appRuntime = createAppRuntime({ database: databaseConfig });
  const database = appRuntime.database;
  if (!database) throw new Error('CRM runtime requires a database.');

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
  const access = createCrmAccessService(database);
  const service = createCrmService(database);
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
        `CRM migrations are unavailable: ${migration.reason ?? 'unknown reason'}`,
      );
    }
    await reconcileLegacyPreviewAdmin(database);
    await reconcileCrmSeed(database, path.resolve(options.seedPath));
  };

  return {
    access,
    database,
    service,
    ready,
    async databaseStatus(): Promise<CrmDatabaseRuntimeResource> {
      const updatedAt = new Date().toISOString();
      try {
        await ready();
        const connection = database.connection();
        await database
          .query()
          .selectFrom('user')
          .select('id')
          .limit(1)
          .execute();
        return {
          id: 'database:primary',
          kind: 'database',
          name: `${options.appName.toUpperCase()} 主数据库`,
          status: 'active',
          provider: '@nocobase/database',
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
          name: `${options.appName.toUpperCase()} 主数据库`,
          status: 'error',
          provider: '@nocobase/database',
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
      if (
        !options.allowAdditionalSignUp &&
        isSignUpRequest(request) &&
        (await hasRegisteredUser(database))
      ) {
        return Response.json(
          {
            code: 'CRM_SIGN_UP_CLOSED',
            message: 'CRM 已完成初始化，请使用已有账号登录。',
          },
          { status: 403 },
        );
      }
      return auth.handler(request);
    },
    async createCredentialUser(input: CrmCredentialUserInput): Promise<string> {
      await ready();
      const response = await auth.handler(
        new Request(
          new URL(
            `${options.authBasePath.replace(/\/$/, '')}/sign-up/email`,
            options.baseURL ?? 'http://localhost',
          ),
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          },
        ),
      );
      const payload = await readAuthPayload(response);
      if (!response.ok) {
        throw new Error(readAuthError(payload));
      }
      const userId = readCreatedUserId(payload);
      if (!userId) throw new Error('认证服务没有返回新用户 ID。');
      const created = await database
        .query()
        .selectFrom('user')
        .select('id')
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!created) throw new Error('邮箱或用户名已存在。');
      return userId;
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
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'CRM_MEMBER_DISABLED'
        ) {
          return null;
        }
        throw error;
      }
    },
    close: () => appRuntime.dispose(),
  };
}

async function readAuthPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readCreatedUserId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const user = (payload as { user?: unknown }).user;
  if (!user || typeof user !== 'object' || Array.isArray(user))
    return undefined;
  const id = (user as { id?: unknown }).id;
  return typeof id === 'string' && id ? id : undefined;
}

function readAuthError(payload: unknown): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return '无法创建登录账号。';
}

function createCookiePrefix(appName: string): string {
  const normalized = appName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'nocobase3-crm';
}

function isSignUpRequest(request: Request): boolean {
  return (
    request.method.toUpperCase() === 'POST' &&
    /\/sign-up\/(email|username)\/?$/.test(new URL(request.url).pathname)
  );
}

async function hasRegisteredUser(database: DatabaseManager): Promise<boolean> {
  return database.query().selectFrom('user').select('id').limit(1).exists();
}
