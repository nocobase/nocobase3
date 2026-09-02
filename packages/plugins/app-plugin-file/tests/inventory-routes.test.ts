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
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFileRoute } from '../server/create-file-route.js';
import { inventoryApiRoutes } from '../server/routes/inventory.js';

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
    createFileRoute({
      database,
      table: TABLE,
      defaultDisk: 'local',
      publicBasePath: '',
      audience: 'route-inventory-files',
      auth: async (_context, next) => next(),
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('reads registrations at request time and protects both endpoints', async () => {
    const can = vi.fn(async () => true);
    const router = await inventoryApiRoutes.createRouter(
      createApplication(database, can),
    );
    createFileRoute({
      database,
      table: 'registeredAfterInventoryRouter',
      defaultDisk: 'local',
      publicBasePath: '',
      audience: 'late-file-route',
      auth: async (_context, next) => next(),
    });

    const sources = await router.request('/files/inventory/sources');
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

    const files = await router.request(
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

  it('rejects users without inventory access', async () => {
    const router = await inventoryApiRoutes.createRouter(
      createApplication(database, async () => false),
    );
    const response = await router.request('/files/inventory/sources');
    expect(response.status).toBe(403);
  });

  it('validates source ids and pagination', async () => {
    const router = await inventoryApiRoutes.createRouter(
      createApplication(database, async () => true),
    );
    expect(
      (
        await router.request(
          '/files/inventory/sources/unknown/files?page=1&pageSize=10',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await router.request(
          `/files/inventory/sources/${TABLE}/files?page=0&pageSize=10`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await router.request(
          `/files/inventory/sources/${TABLE}/files?page=1&pageSize=101`,
        )
      ).status,
    ).toBe(400);
  });
});

function createApplication(
  database: DatabaseManager,
  can: (input: unknown) => Promise<boolean>,
): AppPluginApplication {
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(authenticationToken, {
    required: () => async (_context, next) => next(),
  } as unknown as Auth);
  container.instance(authorizationToken, {
    middleware: () => async (context, next) => {
      context.set('authz', { can });
      await next();
    },
  } as unknown as AppAuthorization);
  return {
    appName: 'main',
    publicBasePath: '',
    config: { app: { name: 'main', publicBasePath: '' } },
    paths: {} as never,
    router: new Hono(),
    container,
  };
}
