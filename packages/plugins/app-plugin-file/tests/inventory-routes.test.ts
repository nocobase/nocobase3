import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFileRoute } from '../server/create-file-route.js';
import serverLocales from '../server/locales/index.js';
import { inventoryApiRoutes } from '../server/routes/inventory.js';
import { createFileI18nRuntime } from './i18n.js';

const TABLE = 'routeInventoryFiles';

describe('file inventory routes', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    await database.builder().createCollection(TABLE, (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').unsigned().notNull();
      collection.boolean('public').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_route_inventory_files' });
    });
    const now = new Date();
    await database
      .query()
      .insertInto(TABLE)
      .values({
        id: 'file-1',
        disk: 'local',
        key: 'files/file-1',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 42,
        public: false,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    registerSource(database, TABLE);
  });

  afterEach(async () => {
    await database.destroy();
    vi.restoreAllMocks();
  });

  it('reads registrations at request time and protects both endpoints', async () => {
    const can = vi.fn(async () => true);
    const app = await createInventoryApp({ database, can });
    registerSource(database, 'registeredAfterInventoryRouter');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const sources = await app.request('/files/inventory/sources');
    expect(sources.status).toBe(200);
    await expect(sources.json()).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: 'registeredAfterInventoryRouter',
          count: null,
          status: 'unavailable',
        }),
        expect.objectContaining({ id: TABLE, count: 1, status: 'available' }),
      ],
    });

    const files = await app.request(
      `/files/inventory/sources/${TABLE}/files?page=1&pageSize=10`,
    );
    expect(files.status).toBe(200);
    const body = await files.text();
    expect(JSON.parse(body)).toMatchObject({
      data: [{ id: 'file-1', filename: 'report.pdf' }],
      meta: { total: 1 },
    });
    expect(body).not.toContain('files/file-1');
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'page', id: 'file.inventory' },
      action: 'access',
    });
  });

  it('returns the standard error envelope for denied access', async () => {
    const app = await createInventoryApp({
      database,
      can: async () => false,
    });
    const response = await app.request('/files/inventory/sources');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'File inventory access is required.',
      },
    });
  });

  it('validates source ids, pagination, and safe offsets', async () => {
    const app = await createInventoryApp({ database });

    const missing = await app.request(
      '/files/inventory/sources/unknown/files?page=1&pageSize=10',
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'FILE_SOURCE_NOT_FOUND' },
    });

    for (const path of [
      `/files/inventory/sources/${TABLE}/files?page=0&pageSize=10`,
      `/files/inventory/sources/${TABLE}/files?page=1&pageSize=101`,
      `/files/inventory/sources/${TABLE}/files?page=9007199254740991&pageSize=100`,
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'INVALID_FILE_INVENTORY_PAGINATION' },
      });
    }
  });

  it('translates errors from the request locale', async () => {
    const app = await createInventoryApp({ database });
    const response = await app.request(
      '/files/inventory/sources/unknown/files',
      { headers: { 'accept-language': 'zh-CN' } },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FILE_SOURCE_NOT_FOUND',
        message: '未找到已注册的文件来源。',
      },
    });
  });

  it('hides database failures behind a localized 503 envelope', async () => {
    const app = await createInventoryApp({ database });
    await database.builder().dropCollection(TABLE);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await app.request(
      `/files/inventory/sources/${TABLE}/files`,
      { headers: { 'accept-language': 'zh-CN' } },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FILE_SOURCE_UNAVAILABLE',
        message: '已注册的文件数据表不可用。',
      },
    });
  });

  it('returns no sources when the application has no database', async () => {
    const app = await createInventoryApp();
    const response = await app.request('/files/inventory/sources');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
  });

  it('fails route creation when authentication is unavailable', () => {
    expect(() =>
      inventoryApiRoutes.createRouter(
        createApplication({ database, authorization: true }),
      ),
    ).toThrow(/authentication.*not registered/iu);
  });

  it('fails route creation when authorization is unavailable', () => {
    expect(() =>
      inventoryApiRoutes.createRouter(
        createApplication({ database, authentication: true }),
      ),
    ).toThrow(/authorization.*not registered/iu);
  });
});

function registerSource(database: DatabaseManager, table: string): void {
  createFileRoute({
    database,
    table,
    defaultDisk: 'local',
    publicBasePath: '',
    audience: `${table}-files`,
    auth: async (_context, next) => next(),
  });
}

async function createInventoryApp(
  options: {
    readonly database?: DatabaseManager;
    readonly can?: (input: unknown) => Promise<boolean>;
  } = {},
): Promise<Hono> {
  const runtime = await createFileI18nRuntime(serverLocales);
  const app = new Hono();
  app.use('*', createI18nMiddleware(runtime));
  app.route(
    '/',
    await inventoryApiRoutes.createRouter(
      createApplication({
        database: options.database,
        can: options.can,
        authentication: true,
        authorization: true,
      }),
    ),
  );
  return app;
}

function createApplication(options: {
  readonly database?: DatabaseManager;
  readonly can?: (input: unknown) => Promise<boolean>;
  readonly authentication?: boolean;
  readonly authorization?: boolean;
}): AppPluginApplication {
  const container = new ServiceContainer();
  if (options.database) {
    container.instance(databaseManagerToken, options.database);
  }
  if (options.authentication) {
    container.instance(authenticationToken, {
      required: () => async (_context, next) => next(),
    } as unknown as Auth);
  }
  if (options.authorization) {
    container.instance(authorizationToken, {
      middleware: () => async (context, next) => {
        context.set('authz', {
          can: options.can ?? (async () => true),
        });
        await next();
      },
    } as unknown as AppAuthorization);
  }
  return {
    appName: 'main',
    publicBasePath: '',
    config: { app: { name: 'main', publicBasePath: '' } },
    paths: {} as never,
    router: new Hono(),
    container,
  };
}
