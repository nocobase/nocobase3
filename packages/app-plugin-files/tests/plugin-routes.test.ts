import { readFile } from 'node:fs/promises';

import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import { createLogger, type Logger } from '@nocobase/logging';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FilesUnavailableError } from '../server/errors.js';
import type {
  CreateFileRouteOptions,
  DatabaseFileStoreOptions,
  FileStore,
} from '../server/types.js';

const {
  createFileRouteMock,
  createDatabaseFileStoreMock,
  ensureFileObjectMock,
  removeFileObjectMock,
} = vi.hoisted(() => ({
  createFileRouteMock: vi.fn(),
  createDatabaseFileStoreMock: vi.fn(),
  ensureFileObjectMock: vi.fn(),
  removeFileObjectMock: vi.fn(),
}));

vi.mock('../server/create-file-route.js', () => ({
  createFileRoute: createFileRouteMock,
}));
vi.mock('../server/database-file-store.js', () => ({
  createDatabaseFileStore: createDatabaseFileStoreMock,
}));
vi.mock('../server/file-storage.js', () => ({
  ensureFileObject: ensureFileObjectMock,
  removeFileObject: removeFileObjectMock,
}));

import bootstrapFilesPlugin from '../server/bootstrap.js';
import {
  isFilesPluginRuntimeUnavailable,
  resolveFilesPluginRuntime,
  type FilesPluginConfig,
  type FilesPluginDeps,
} from '../server/plugin-runtime.js';
import registerRoutes, {
  createFilesDemoRoutes,
} from '../server/routes/index.js';

describe('files plugin route factory and registrar', () => {
  let database: DatabaseManager;
  let driveManager: NocoBaseDriveManager;
  let required: ReturnType<typeof vi.fn<() => MiddlewareHandler>>;
  let logger: Logger;
  let config: FilesPluginConfig;
  let deps: FilesPluginDeps;

  beforeEach(() => {
    database = createBootstrapDatabase();
    driveManager = {} as NocoBaseDriveManager;
    createFileRouteMock.mockReset().mockImplementation(createDelegatingRoute);
    createDatabaseFileStoreMock
      .mockReset()
      .mockImplementation((_database, options) => createScopedStore(options));
    ensureFileObjectMock.mockReset().mockResolvedValue(undefined);
    removeFileObjectMock.mockReset().mockResolvedValue(undefined);
    required = vi.fn(() => authenticatedOnly());
    logger = createLogger({ level: 'silent' });
    config = {
      app: { publicBasePath: '/base' },
      drive: { default: 'local' },
      session: { secret: 'demo-token-secret' },
    };
    deps = {
      database,
      driveManager,
      auth: { required },
      authz: createAuthorization('admin'),
      logging: { getLogger: () => logger },
    };
  });

  it('resolves the narrow runtime from existing host dependencies', () => {
    const runtime = resolveFilesPluginRuntime({ config, deps });

    expect(isFilesPluginRuntimeUnavailable(runtime)).toBe(false);
    expect(runtime).toMatchObject({
      database,
      drive: driveManager,
      defaultDisk: 'local',
      publicBasePath: '/base',
      tokenSecret: 'demo-token-secret',
    });
  });

  it('initializes deterministic fixtures and logs failures', async () => {
    const failure = new Error('fixture write failed');
    const error = vi.spyOn(logger, 'error');
    ensureFileObjectMock.mockRejectedValueOnce(failure);

    bootstrapFilesPlugin({
      config,
      deps,
      services: {},
      lifecycle: { registerDisposer: vi.fn() },
    });

    await vi.waitFor(() =>
      expect(ensureFileObjectMock).toHaveBeenCalledTimes(3),
    );
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        {
          err: expect.objectContaining({
            name: 'AggregateError',
            errors: expect.arrayContaining([failure]),
          }),
        },
        'Files Demo fixture initialization failed',
      ),
    );
    expect(ensureFileObjectMock).toHaveBeenCalledWith(
      { drive: driveManager, defaultDisk: 'local' },
      expect.objectContaining({ key: expect.any(String) }),
    );
  });

  it('allows only system administrators to query examples', async () => {
    const app = createFactoryApp(config, deps);
    const denied = await app.request('/api/attachments/examples');
    const member = await createFactoryApp(config, {
      ...deps,
      authz: createAuthorization('member'),
    }).request('/api/attachments/examples', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    const response = await app.request('/api/attachments/examples', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    const text = await response.text();

    expect(denied.status).toBe(401);
    expect(member.status).toBe(403);
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      data: {
        profile: {
          id: 1,
          name: 'Demo Profile',
          filesEndpoint: '/base/api/attachments/profiles/1/avatar',
        },
        order: {
          id: 1,
          number: 'PO-DEMO-001',
          filesEndpoint: '/base/api/attachments/orders/1/files',
        },
      },
    });
    expect(text).not.toMatch(/key|secret|token|disk|storage/i);
    expect(required).toHaveBeenCalledTimes(2);
  });

  it('configures both Demo resources through the public route factory', () => {
    createFilesDemoRoutes({ config, deps });

    expect(createFileRouteMock).toHaveBeenCalledTimes(2);
    const avatar = createFileRouteMock.mock.calls[0]?.[0] as
      CreateFileRouteOptions | undefined;
    const order = createFileRouteMock.mock.calls[1]?.[0] as
      CreateFileRouteOptions | undefined;

    for (const options of [avatar, order]) {
      expect(options).toMatchObject({
        drive: driveManager,
        defaultDisk: 'local',
        publicBasePath: '/base',
        tokenSecret: 'demo-token-secret',
      });
    }
    expect(avatar).toMatchObject({
      audience: 'files-demo-profile-avatar',
      visibility: { default: 'private', allowClientOverride: false },
      limits: {
        maxSize: 5 * 1024 * 1024,
        maxFiles: 1,
        mimeTypes: ['image/gif', 'image/jpeg', 'image/png', 'image/webp'],
      },
    });
    expect(order).toMatchObject({
      audience: 'files-demo-order-attachments',
      visibility: { default: 'private', allowClientOverride: true },
      limits: {
        maxSize: 50 * 1024 * 1024,
        maxFiles: 10,
        mimeTypes: expect.arrayContaining([
          'application/json',
          'application/pdf',
          'audio/mpeg',
          'image/png',
          'text/plain',
          'video/mp4',
        ]),
      },
    });
    expect(avatar?.auth).toBe(order?.auth);
    expect(avatar?.authorize).toBe(order?.authorize);
    expect(createDatabaseFileStoreMock).toHaveBeenNthCalledWith(1, database, {
      table: 'filesDemoProfileAvatars',
      scope: expect.any(Function),
    });
    expect(createDatabaseFileStoreMock).toHaveBeenNthCalledWith(2, database, {
      table: 'filesDemoOrderAttachments',
      scope: expect.any(Function),
    });
  });

  it('validates Profile and Order IDs inside delegated stores', async () => {
    const app = createFactoryApp(config, deps);

    expect(
      (
        await app.request('/api/attachments/profiles/1/avatar', {
          headers: { 'x-demo-auth': 'allowed' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request('/api/attachments/orders/1/files', {
          headers: { 'x-demo-auth': 'allowed' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request('/api/attachments/profiles/not-a-number/avatar', {
          headers: { 'x-demo-auth': 'allowed' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request('/api/attachments/orders/0/files', {
          headers: { 'x-demo-auth': 'allowed' },
        })
      ).status,
    ).toBe(400);
  });

  it.each([
    ['database', { database: undefined }],
    ['Drive', { driveManager: undefined }],
    ['token secret', {}, { session: undefined }],
  ] as const)(
    'keeps the app startable and returns 503 without %s',
    async (_name, depsOverride, configOverride = {}) => {
      const unavailableDeps = { ...deps, ...depsOverride };
      const unavailableConfig = { ...config, ...configOverride };
      const runtime = resolveFilesPluginRuntime({
        config: unavailableConfig,
        deps: unavailableDeps,
      });
      expect(isFilesPluginRuntimeUnavailable(runtime)).toBe(true);

      const app = createFactoryApp(unavailableConfig, unavailableDeps);
      for (const path of [
        '/api/attachments/examples',
        '/api/attachments/orders/1/files',
      ]) {
        const response = await app.request(path, {
          headers: { 'x-demo-auth': 'allowed' },
        });
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: 'FILES_UNAVAILABLE' },
        });
      }
    },
  );

  it('keeps Demo composition internal and independent from default-app types', async () => {
    const sources = await Promise.all(
      [
        '../server/plugin-runtime.ts',
        '../server/bootstrap.ts',
        '../server/routes/index.ts',
      ].map(async (path) => readFile(new URL(path, import.meta.url), 'utf8')),
    );
    const source = sources.join('\n');

    expect(source).not.toMatch(/app-template-default/);
    expect(source).not.toMatch(/AppServices\.files/);
    expect(source).not.toMatch(/ServiceRegistry|ServiceContainer/);
  });

  it('mounts the Demo Router at the plugin convention path', async () => {
    const app = new Hono();
    registerRoutes({
      app,
      config,
      deps,
      services: {},
      paths: {} as never,
    });

    const response = await app.request('/api/attachments/examples', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    expect(response.status).toBe(200);
  });
});

function createFactoryApp(
  config: FilesPluginConfig,
  deps: FilesPluginDeps,
): Hono {
  const app = new Hono();
  app.route('/api/attachments', createFilesDemoRoutes({ config, deps }));
  return app;
}

function authenticatedOnly(): MiddlewareHandler {
  return async (context, next) => {
    if (context.req.header('x-demo-auth') !== 'allowed') {
      return context.json({ code: 'UNAUTHORIZED' }, 401);
    }
    await next();
  };
}

function createAuthorization(
  role: 'admin' | 'member',
): FilesPluginDeps['authz'] {
  return {
    middleware: () => async (context, next) => {
      context.set('authz', {
        identity: { principal: { type: 'user', id: role } },
      });
      await next();
    },
    permissionSets: {
      getEffective: async () =>
        role === 'admin' ? [{ key: 'system-administrator' }] : [],
    },
  };
}

function createBootstrapDatabase(): DatabaseManager {
  const execute = async (): Promise<void> => undefined;
  const executeTakeFirst = async (): Promise<undefined> => undefined;
  return {
    query: () => ({
      selectFrom: () => ({
        select: () => ({ where: () => ({ executeTakeFirst }) }),
      }),
      insertInto: () => ({ values: () => ({ execute }) }),
      updateTable: () => ({
        set: () => ({ where: () => ({ execute }) }),
      }),
    }),
  } as unknown as DatabaseManager;
}

function createScopedStore(options: DatabaseFileStoreOptions): FileStore {
  return {
    list: vi.fn(async (context) => {
      options.scope?.(context);
      return [];
    }),
    find: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  };
}

function createDelegatingRoute(options: CreateFileRouteOptions): Hono {
  const route = new Hono();
  route.onError((error, context) => {
    if (error instanceof FilesUnavailableError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        503,
      );
    }
    throw error;
  });
  route.get('/', options.auth, async (context) => {
    const denied = await options.authorize?.(context, 'list');
    if (denied instanceof Response) return denied;
    return context.json({ data: await options.store.list(context) });
  });
  return route;
}
