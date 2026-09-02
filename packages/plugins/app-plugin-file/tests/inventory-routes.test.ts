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
import { FILE_INVENTORY_RESOURCE } from '../shared/inventory.js';
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

  it('reads registrations at request time and lists files', async () => {
    const app = await createInventoryApp({ database });
    registerSource(database, 'registeredAfterInventoryRouter');

    const sources = await app.request('/files/inventory/sources');
    expect(sources.status).toBe(200);
    await expect(sources.json()).resolves.toEqual({
      data: [
        {
          id: 'registeredAfterInventoryRouter',
          table: 'registeredAfterInventoryRouter',
        },
        { id: TABLE, table: TABLE },
      ],
    });

    const files = await app.request(
      `/files/inventory/sources/${TABLE}/files?pageSize=10`,
    );
    expect(files.status).toBe(200);
    const body = await files.text();
    expect(JSON.parse(body)).toMatchObject({
      data: [{ id: 'file-1', filename: 'report.pdf' }],
      meta: { pageSize: 10, hasNextPage: false },
    });
    expect(body).not.toContain('files/file-1');
  });

  it('validates source ids and cursor pagination', async () => {
    const app = await createInventoryApp({ database });

    const missing = await app.request(
      '/files/inventory/sources/unknown/files?page=1&pageSize=10',
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'FILE_SOURCE_NOT_FOUND' },
    });

    for (const path of [
      `/files/inventory/sources/${TABLE}/files?page=1&pageSize=101`,
      `/files/inventory/sources/${TABLE}/files?cursor=`,
      `/files/inventory/sources/${TABLE}/files?cursor=${'x'.repeat(513)}`,
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

  it('requires authentication', async () => {
    const app = await createInventoryApp({
      database,
      denyAuthentication: true,
    });

    expect((await app.request('/files/inventory/sources')).status).toBe(401);
  });

  it('allows the system administrator wildcard page grant', async () => {
    const app = await createInventoryApp({ database, pageGrant: '*' });

    expect((await app.request('/files/inventory/sources')).status).toBe(200);
  });

  it('requires file inventory page access', async () => {
    const app = await createInventoryApp({
      database,
      pageGrant: 'home',
    });

    const response = await app.request('/files/inventory/sources');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_INVENTORY_FORBIDDEN' },
    });
  });

  it('requires Authentication and Authorization services at composition time', () => {
    expect(() =>
      inventoryApiRoutes.createRouter(
        createApplication({ database, authorization: true }),
      ),
    ).toThrow('Service "@nocobase/app/authentication" is not registered.');
    expect(() =>
      inventoryApiRoutes.createRouter(
        createApplication({ database, authentication: true }),
      ),
    ).toThrow('Service "@nocobase/app/authorization" is not registered.');
  });
});

type PageGrant = '*' | 'home';
type PageAccessRequest = {
  readonly resource: { readonly type: string; readonly id: string };
  readonly action: string;
};

function hasPageAccess(grant: PageGrant, request: PageAccessRequest): boolean {
  return (
    request.resource.type === 'page' &&
    request.resource.id === FILE_INVENTORY_RESOURCE &&
    request.action === 'access' &&
    (grant === '*' || request.resource.id === grant)
  );
}

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
    readonly pageGrant?: PageGrant;
    readonly denyAuthentication?: boolean;
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
        authentication: true,
        authorization: true,
        pageGrant: options.pageGrant,
        denyAuthentication: options.denyAuthentication,
      }),
    ),
  );
  return app;
}

function createApplication(options: {
  readonly database?: DatabaseManager;
  readonly authentication?: boolean;
  readonly authorization?: boolean;
  readonly pageGrant?: PageGrant;
  readonly denyAuthentication?: boolean;
}): AppPluginApplication {
  const container = new ServiceContainer();
  if (options.database) {
    container.instance(databaseManagerToken, options.database);
  }
  if (options.authentication) {
    container.instance(authenticationToken, {
      required: () => async (_context, next) => {
        if (options.denyAuthentication) {
          return new Response(null, { status: 401 });
        }
        return next();
      },
    } as unknown as Auth);
  }
  if (options.authorization) {
    const pageGrant = options.pageGrant ?? '*';
    container.instance(authorizationToken, {
      middleware: () => async (context, next) => {
        context.set('authz', {
          can: async (request: PageAccessRequest) =>
            hasPageAccess(pageGrant, request),
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
