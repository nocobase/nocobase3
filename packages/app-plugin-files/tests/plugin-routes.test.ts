import { readFile } from 'node:fs/promises';

import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateFileRouteOptions,
  DatabaseFileStoreOptions,
  FileStore,
  FilesService,
} from '../server/types.js';
import { FilesUnavailableError } from '../server/errors.js';

const { createFileRouteMock, createFilesServiceMock } = vi.hoisted(() => ({
  createFileRouteMock: vi.fn(),
  createFilesServiceMock: vi.fn(),
}));

vi.mock('../server/create-file-route.js', () => ({
  createFileRoute: createFileRouteMock,
}));

vi.mock('../server/files-service.js', () => ({
  createFilesService: createFilesServiceMock,
}));

import {
  createPluginFilesService,
  isFilesPluginServiceUnavailable,
  type FilesPluginConfig,
  type FilesPluginDeps,
} from '../server/plugin-runtime.js';
import bootstrapFilesPlugin from '../server/bootstrap.js';
import registerFilesRoutes from '../server/routes/index.js';

describe('files plugin route registrar', () => {
  let files: FilesService;
  let database: DatabaseManager;
  let driveManager: NocoBaseDriveManager;
  let required: ReturnType<typeof vi.fn<() => MiddlewareHandler>>;
  let config: FilesPluginConfig;
  let deps: FilesPluginDeps;

  beforeEach(() => {
    database = {} as DatabaseManager;
    driveManager = {} as NocoBaseDriveManager;
    files = createFilesServiceDouble();
    createFilesServiceMock.mockReset().mockReturnValue(files);
    createFileRouteMock.mockReset().mockImplementation(createDelegatingRoute);
    required = vi.fn(() => authenticatedOnly());
    config = {
      app: { publicBasePath: '/base' },
      drive: { default: 'local' },
      session: { secret: 'demo-token-secret' },
    };
    deps = {
      database,
      driveManager,
      auth: { required },
      authz: {} as FilesPluginDeps['authz'],
    };
  });

  it('creates a new local service from the narrow structural context', () => {
    const first = createPluginFilesService({ config, deps });
    const second = createPluginFilesService({ config, deps });

    expect(first).toBe(files);
    expect(second).toBe(files);
    expect(createFilesServiceMock).toHaveBeenNthCalledWith(1, {
      database,
      drive: driveManager,
      publicBasePath: '/base',
      defaultDisk: 'local',
      tokenSecret: 'demo-token-secret',
    });
    expect(createFilesServiceMock).toHaveBeenCalledTimes(2);
  });

  it('composes the Bootstrap service from deps without global registration', async () => {
    bootstrapFilesPlugin({
      config,
      deps,
      services: {},
      lifecycle: { registerDisposer: vi.fn() },
    });

    await vi.waitFor(() => expect(files.ensureObject).toHaveBeenCalledTimes(3));
    expect(createFilesServiceMock).toHaveBeenCalledWith({
      database,
      drive: driveManager,
      publicBasePath: '/base',
      defaultDisk: 'local',
      tokenSecret: 'demo-token-secret',
    });
  });

  it('mounts authenticated stable examples without storage internals', async () => {
    const app = registerApp(config, deps);
    const denied = await app.request('/api/attachments/examples');
    const response = await app.request('/api/attachments/examples', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    const text = await response.text();

    expect(denied.status).toBe(401);
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
    expect(required).toHaveBeenCalledOnce();
  });

  it('configures Avatar and Order routes through createFileRoute', () => {
    registerApp(config, deps);

    expect(createFileRouteMock).toHaveBeenCalledTimes(2);
    const avatar = createFileRouteMock.mock.calls[0]?.[0] as
      CreateFileRouteOptions | undefined;
    const order = createFileRouteMock.mock.calls[1]?.[0] as
      CreateFileRouteOptions | undefined;

    expect(avatar).toMatchObject({
      files,
      audience: 'files-demo-profile-avatar',
      visibility: { default: 'private', allowClientOverride: false },
      limits: {
        maxSize: 5 * 1024 * 1024,
        maxFiles: 1,
        mimeTypes: [
          'image/gif',
          'image/jpeg',
          'image/png',
          'image/svg+xml',
          'image/webp',
        ],
      },
    });
    expect(order).toMatchObject({
      files,
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
    expect(files.createDatabaseStore).toHaveBeenNthCalledWith(1, {
      table: 'filesDemoProfileAvatars',
      scope: expect.any(Function),
    });
    expect(files.createDatabaseStore).toHaveBeenNthCalledWith(2, {
      table: 'filesDemoOrderAttachments',
      scope: expect.any(Function),
    });
  });

  it('validates Profile and Order IDs inside delegated stores', async () => {
    const app = registerApp(config, deps);

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
      const service = createPluginFilesService({
        config: unavailableConfig,
        deps: unavailableDeps,
      });
      expect(isFilesPluginServiceUnavailable(service)).toBe(true);

      const app = registerApp(unavailableConfig, unavailableDeps);
      const examples = await app.request('/api/attachments/examples', {
        headers: { 'x-demo-auth': 'allowed' },
      });
      const filesResponse = await app.request(
        '/api/attachments/orders/1/files',
        { headers: { 'x-demo-auth': 'allowed' } },
      );

      expect(examples.status).toBe(503);
      await expect(examples.json()).resolves.toMatchObject({
        error: { code: 'FILES_UNAVAILABLE' },
      });
      expect(filesResponse.status).toBe(503);
      await expect(filesResponse.json()).resolves.toMatchObject({
        error: { code: 'FILES_UNAVAILABLE' },
      });
    },
  );

  it('keeps composition local and independent from default-app private types', async () => {
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
    expect(source).not.toMatch(
      /^(?:export\s+)?(?:const|let|var)\s+\w*files\w*\s*:\s*FilesService/m,
    );
  });
});

function registerApp(config: FilesPluginConfig, deps: FilesPluginDeps): Hono {
  const app = new Hono();
  registerFilesRoutes({
    app,
    config,
    deps,
    services: {},
    paths: {} as never,
  });
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

function createFilesServiceDouble(): FilesService {
  return {
    createDatabaseStore: vi.fn((options: DatabaseFileStoreOptions) =>
      createScopedStore(options),
    ),
    put: vi.fn(),
    open: vi.fn(),
    removeObject: vi.fn(),
    issueAccessUrl: vi.fn(),
    verifyAccessToken: vi.fn(),
    ensureObject: vi.fn(),
  };
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
  route.get('/', options.auth, async (context) =>
    context.json({ data: await options.store.list(context) }),
  );
  return route;
}
