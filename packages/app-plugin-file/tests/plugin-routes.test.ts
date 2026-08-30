import { readFile } from 'node:fs/promises';

import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { driveManagerToken, type NocoBaseDriveManager } from '@nocobase/drive';
import {
  createLogger,
  loggingToken,
  type Logger,
  type Logging,
} from '@nocobase/logging';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileUnavailableError } from '../server/errors.js';
import type {
  CreateFileRouteOptions,
  DatabaseFileStoreOptions,
  FileStore,
} from '../server/types.js';
import {
  FILE_DEMO_AVATAR_MIME_TYPES,
  FILE_DEMO_ORDER_MIME_TYPES,
} from '../shared/file-demo.js';

const { createFileRouteMock, ensureFileObjectMock, removeFileObjectMock } =
  vi.hoisted(() => ({
    createFileRouteMock: vi.fn(),
    ensureFileObjectMock: vi.fn(),
    removeFileObjectMock: vi.fn(),
  }));

vi.mock('../server/create-file-route.js', () => ({
  createFileRoute: createFileRouteMock,
}));
vi.mock('../server/file-storage.js', () => ({
  ensureFileObject: ensureFileObjectMock,
  removeFileObject: removeFileObjectMock,
}));

import { FileProvider } from '../server/providers/file.js';
import {
  isFilePluginRuntimeUnavailable,
  resolveFilePluginRuntime,
  type FilePluginConfig,
} from '../server/plugin-runtime.js';
import { filePluginRuntimeToken } from '../server/runtime-token.js';
import { apiRoutes, createFileDemoRoutes } from '../server/routes/index.js';

describe('file plugin route factory and registrar', () => {
  let database: DatabaseManager;
  let driveManager: NocoBaseDriveManager;
  let required: ReturnType<typeof vi.fn<() => MiddlewareHandler>>;
  let logger: Logger;
  let config: FilePluginConfig;
  let deps: HostServices;

  beforeEach(() => {
    database = createBootstrapDatabase();
    driveManager = {} as NocoBaseDriveManager;
    createFileRouteMock.mockReset().mockImplementation(createDelegatingRoute);
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
    const runtime = resolveFilePluginRuntime(
      createContainer(config, deps),
      config,
    );

    expect(isFilePluginRuntimeUnavailable(runtime)).toBe(false);
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

    const container = createContainer(config, deps, false);
    const provider = new FileProvider({
      config,
      container,
      router: new Hono(),
    });
    provider.register();
    await provider.boot();

    await vi.waitFor(() =>
      expect(ensureFileObjectMock).toHaveBeenCalledTimes(3),
    );
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        {
          err: expect.objectContaining({
            name: 'FileUnavailableError',
            cause: expect.objectContaining({
              name: 'AggregateError',
              errors: expect.arrayContaining([failure]),
            }),
          }),
        },
        'File Demo fixture initialization failed',
      ),
    );
    expect(ensureFileObjectMock).toHaveBeenCalledWith(
      { drive: driveManager, defaultDisk: 'local' },
      expect.objectContaining({ key: expect.any(String) }),
    );
  });

  it('waits for fixture initialization before shutting down', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    ensureFileObjectMock.mockImplementation(() => gate);

    const container = createContainer(config, deps, false);
    const provider = new FileProvider({
      config,
      container,
      router: new Hono(),
    });
    provider.register();
    await provider.boot();
    await vi.waitFor(() =>
      expect(ensureFileObjectMock).toHaveBeenCalledTimes(3),
    );

    let shutdownSettled = false;
    const shutdown = provider.shutdown().then(() => {
      shutdownSettled = true;
    });
    await Promise.resolve();
    const settledBeforeRelease = shutdownSettled;

    release();
    await shutdown;

    expect(settledBeforeRelease).toBe(false);
    expect(shutdownSettled).toBe(true);
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

  it('waits for the shared fixture readiness before serving Demo data', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    ensureFileObjectMock.mockImplementation(() => gate);
    const app = createFactoryApp(config, deps);
    let settled = false;
    const responsePromise = app
      .request('/api/attachments/examples', {
        headers: { 'x-demo-auth': 'allowed' },
      })
      .finally(() => {
        settled = true;
      });

    await vi.waitFor(() =>
      expect(ensureFileObjectMock).toHaveBeenCalledTimes(3),
    );
    expect(settled).toBe(false);
    release();

    await expect(responsePromise).resolves.toMatchObject({ status: 200 });
  });

  it('retries fixture initialization on the next request after a failure', async () => {
    ensureFileObjectMock.mockRejectedValueOnce(
      new Error('fixture write failed'),
    );
    const app = createFactoryApp(config, deps);

    const failed = await app.request('/api/attachments/examples', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    expect(failed.status).toBe(503);
    await expect(failed.json()).resolves.toMatchObject({
      error: {
        code: 'FILE_UNAVAILABLE',
        message: 'File Demo fixture initialization failed.',
      },
    });

    const recovered = await app.request('/api/attachments/examples', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    expect(recovered.status).toBe(200);
    expect(ensureFileObjectMock).toHaveBeenCalledTimes(6);
  });

  it('configures both Demo resources through the public route factory', () => {
    createFileDemoRoutes({
      config,
      container: createContainer(config, deps),
    });

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
      database,
      table: 'fileDemoProfileAvatars',
      scope: expect.any(Function),
      audience: 'file-demo-profile-avatar',
      visibility: { default: 'private', allowClientOverride: false },
      limits: {
        maxSize: 5 * 1024 * 1024,
        maxFiles: 1,
        mimeTypes: FILE_DEMO_AVATAR_MIME_TYPES,
      },
    });
    expect(order).toMatchObject({
      database,
      table: 'fileDemoOrderAttachments',
      scope: expect.any(Function),
      audience: 'file-demo-order-attachments',
      visibility: { default: 'private', allowClientOverride: true },
      limits: {
        maxSize: 50 * 1024 * 1024,
        maxFiles: 10,
        mimeTypes: FILE_DEMO_ORDER_MIME_TYPES,
      },
    });
    expect(avatar?.auth).toBe(order?.auth);
    expect(avatar?.authorize).toBeUndefined();
    expect(order?.authorize).toBeUndefined();
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
      const runtime = resolveFilePluginRuntime(
        createContainer(unavailableConfig, unavailableDeps),
        unavailableConfig,
      );
      expect(isFilePluginRuntimeUnavailable(runtime)).toBe(true);

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
          error: { code: 'FILE_UNAVAILABLE' },
        });
      }
    },
  );

  it('keeps Demo composition internal and independent from default-app types', async () => {
    const sources = await Promise.all(
      [
        '../server/plugin-runtime.ts',
        '../server/providers/file.ts',
        '../server/routes/index.ts',
      ].map(async (path) => readFile(new URL(path, import.meta.url), 'utf8')),
    );
    const source = sources.join('\n');

    expect(source).not.toMatch(/app-template-default/);
    expect(source).not.toMatch(/AppServices\.files/);
    expect(source).not.toMatch(/new ServiceContainer/);
  });

  it('mounts the Demo Router at the plugin convention path', async () => {
    const app = new Hono();
    const container = createContainer(config, deps);
    const router = await apiRoutes.createRouter({
      appName: 'test',
      publicBasePath: config.app.publicBasePath,
      router: app,
      config,
      container,
      paths: {} as never,
    });

    const response = await router.request('/attachments/examples', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    expect(response.status).toBe(200);
  });
});

function createFactoryApp(config: FilePluginConfig, deps: HostServices): Hono {
  const app = new Hono();
  app.route(
    '/api/attachments',
    createFileDemoRoutes({ config, container: createContainer(config, deps) }),
  );
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

function createAuthorization(role: 'admin' | 'member'): HostAuthorization {
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

type HostAuthorization = Pick<
  AppAuthorization,
  'middleware' | 'permissionSets'
>;

interface HostServices {
  readonly database?: DatabaseManager;
  readonly driveManager?: NocoBaseDriveManager;
  readonly auth: Pick<Auth, 'required'>;
  readonly authz: HostAuthorization;
  readonly logging: Pick<Logging, 'getLogger'>;
}

function createContainer(
  config: FilePluginConfig,
  services: HostServices,
  includeRuntime: boolean = true,
): ServiceContainer {
  const container = new ServiceContainer();
  if (services.database) {
    container.instance(databaseManagerToken, services.database);
  }
  if (services.driveManager) {
    container.instance(driveManagerToken, services.driveManager);
  }
  container.instance(authenticationToken, services.auth as Auth);
  container.instance(authorizationToken, services.authz as AppAuthorization);
  container.instance(loggingToken, services.logging as Logging);
  if (includeRuntime) {
    container.singleton(filePluginRuntimeToken, (resolver) =>
      resolveFilePluginRuntime(resolver, config),
    );
  }
  return container;
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
  const store =
    options.store ??
    createScopedStore({
      table: options.table,
      scope: options.scope,
      order: options.order,
    });
  const route = new Hono();
  route.onError((error, context) => {
    if (error instanceof FileUnavailableError) {
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
    return context.json({ data: await store.list(context) });
  });
  return route;
}
