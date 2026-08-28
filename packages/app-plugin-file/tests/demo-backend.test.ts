// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  databaseManagerToken,
  createDatabaseManager,
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
import {
  createDriveManager,
  driveManagerToken,
  type NocoBaseDriveManager,
} from '@nocobase/drive';
import { createLogger, loggingToken, type Logging } from '@nocobase/logging';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type MiddlewareHandler } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import migration from '../database/migrations/202608270001_create_file_demo_tables.js';
import seed from '../database/seeds/202608270002_seed_file_demo.js';
import FileProvider, { ensureFileDemoFixtures } from '../server/provider.js';
import {
  FILE_DEMO_AVATAR,
  FILE_DEMO_PRIVATE_ATTACHMENT,
  FILE_DEMO_PUBLIC_ATTACHMENT,
} from '../server/demo/constants.js';
import { FILE_DEMO_FIXTURES } from '../server/demo/fixtures.js';
import {
  resolveFilePluginRuntime,
  type FilePluginConfig,
} from '../server/plugin-runtime.js';
import { filePluginRuntimeToken } from '../server/runtime-token.js';
import { createFileDemoRoutes } from '../server/routes/index.js';

interface RawDatabaseClient {
  raw(sql: string): Promise<unknown>;
}

describe('File Demo backend', () => {
  let storageRoot: string;
  let database: DatabaseManager;
  let driveManager: NocoBaseDriveManager;
  let config: FilePluginConfig;
  let deps: HostServices;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'nocobase-file-demo-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
    const connection = database.connection();
    const client = await connection.client<RawDatabaseClient>();
    await client.raw('PRAGMA foreign_keys = ON');
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    await seed.run({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    driveManager = createDriveManager(
      {
        default: 'local',
        links: {},
        disks: {
          local: {
            driver: 'fs',
            location: join(storageRoot, 'configured-local'),
            visibility: 'private',
          },
          archive: {
            driver: 'fs',
            location: join(storageRoot, 'configured-archive'),
            visibility: 'private',
          },
        },
      },
      { fakes: { location: storageRoot } },
    );
    driveManager.fake('local');
    driveManager.fake('archive');
    config = {
      app: { publicBasePath: '' },
      drive: { default: 'local' },
      session: { secret: 'file-demo-integration-secret' },
    };
    deps = {
      database,
      driveManager,
      auth: { required: () => authenticatedOnly() },
      authz: createAuthorization(),
      logging: { getLogger: () => createLogger({ level: 'silent' }) },
    };
  });

  afterEach(async () => {
    driveManager.restore('local');
    driveManager.restore('archive');
    await database.destroy();
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('writes every deterministic fixture once across repeated bootstraps', async () => {
    const disk = driveManager.use('local');
    const put = vi.spyOn(disk, 'put');

    await runBootstrap(config, deps);
    for (const fixture of FILE_DEMO_FIXTURES) {
      expect(await disk.exists(fixture.key)).toBe(true);
      expect(await disk.get(fixture.key)).toBe(fixture.content);
    }
    expect(put).toHaveBeenCalledTimes(3);

    await runBootstrap(config, deps);
    expect(put).toHaveBeenCalledTimes(3);
  });

  it('reconciles fixture metadata to a non-local default disk', async () => {
    await ensureFileDemoFixtures({
      database,
      drive: driveManager,
      defaultDisk: 'archive',
    });

    for (const fixture of FILE_DEMO_FIXTURES) {
      expect(await driveManager.use('archive').exists(fixture.key)).toBe(true);
      const record = await database
        .query()
        .selectFrom(fixture.table)
        .select(['disk', 'key'])
        .where('id', '=', fixture.id)
        .executeTakeFirst();
      expect(record).toEqual({ disk: 'archive', key: fixture.key });
    }
  });

  it('moves deterministic fixtures when the default disk changes', async () => {
    await ensureFileDemoFixtures({
      database,
      drive: driveManager,
      defaultDisk: 'local',
    });
    const fixture = FILE_DEMO_FIXTURES[0];

    await ensureFileDemoFixtures({
      database,
      drive: driveManager,
      defaultDisk: 'archive',
    });

    expect(await driveManager.use('archive').exists(fixture.key)).toBe(true);
    expect(await driveManager.use('local').exists(fixture.key)).toBe(false);
    await expect(
      database
        .query()
        .selectFrom(fixture.table)
        .select(['disk', 'key'])
        .where('id', '=', fixture.id)
        .executeTakeFirst(),
    ).resolves.toEqual({ disk: 'archive', key: fixture.key });
  });

  it('retries stale deterministic object cleanup after a disk switch', async () => {
    const runtime = {
      database,
      drive: driveManager,
      defaultDisk: 'local',
      diskNames: ['local', 'archive'],
    } as const;
    await ensureFileDemoFixtures(runtime);
    const fixture = FILE_DEMO_FIXTURES[0];
    const local = driveManager.use('local');
    const remove = vi
      .spyOn(local, 'delete')
      .mockRejectedValue(new Error('delete failed'));

    await expect(
      ensureFileDemoFixtures({ ...runtime, defaultDisk: 'archive' }),
    ).rejects.toThrow('File Demo fixture initialization failed');
    await expect(
      database
        .query()
        .selectFrom(fixture.table)
        .select(['disk', 'key'])
        .where('id', '=', fixture.id)
        .executeTakeFirst(),
    ).resolves.toEqual({ disk: 'archive', key: fixture.key });
    expect(await local.exists(fixture.key)).toBe(true);

    remove.mockRestore();
    await ensureFileDemoFixtures({ ...runtime, defaultDisk: 'archive' });
    expect(await local.exists(fixture.key)).toBe(false);
  });

  it('rejects ordinary users from every management action while preserving content access', async () => {
    await runBootstrap(config, deps);
    const app = registerApp(config, deps);
    const memberHeaders = { 'x-demo-auth': 'allowed' };
    const upload = uploadBody(99);

    expect(
      (
        await app.request('/api/attachments/examples', {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/attachments/orders/1/files', {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          `/api/attachments/orders/1/files/${FILE_DEMO_PUBLIC_ATTACHMENT.id}`,
          { headers: memberHeaders },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/attachments/orders/1/files/missing', {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/attachments/orders/1/files', {
          method: 'POST',
          body: upload.body,
          headers: { ...upload.headers, ...memberHeaders },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          `/api/attachments/orders/1/files/${FILE_DEMO_PRIVATE_ATTACHMENT.id}/token`,
          { method: 'POST', headers: memberHeaders },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          `/api/attachments/orders/1/files/${FILE_DEMO_PUBLIC_ATTACHMENT.id}`,
          { method: 'DELETE', headers: memberHeaders },
        )
      ).status,
    ).toBe(403);

    const publicContent = await app.request(
      `/api/attachments/orders/1/files/${FILE_DEMO_PUBLIC_ATTACHMENT.id}/content`,
    );
    expect(publicContent.status).toBe(200);
    const tokenResponse = await app.request(
      `/api/attachments/orders/1/files/${FILE_DEMO_PRIVATE_ATTACHMENT.id}/token`,
      { method: 'POST', headers: adminHeaders() },
    );
    const token = (await tokenResponse.json()) as { data: { url: string } };
    expect((await app.request(token.data.url)).status).toBe(200);
  });

  it('returns 401 for unauthenticated management and allows administrators to write and delete', async () => {
    await runBootstrap(config, deps);
    const app = registerApp(config, deps);
    const upload = uploadBody(100);
    const managementRequests = [
      app.request('/api/attachments/examples'),
      app.request('/api/attachments/orders/1/files'),
      app.request('/api/attachments/orders/1/files', {
        method: 'POST',
        body: upload.body,
        headers: upload.headers,
      }),
      app.request(
        `/api/attachments/orders/1/files/${FILE_DEMO_PRIVATE_ATTACHMENT.id}/token`,
        { method: 'POST' },
      ),
      app.request(
        `/api/attachments/orders/1/files/${FILE_DEMO_PUBLIC_ATTACHMENT.id}`,
        { method: 'DELETE' },
      ),
    ];
    for (const response of await Promise.all(managementRequests)) {
      expect(response.status).toBe(401);
    }

    const created = await app.request('/api/attachments/orders/1/files', {
      method: 'POST',
      body: upload.body,
      headers: { ...upload.headers, ...adminHeaders() },
    });
    expect(created.status).toBe(201);
    const payload = (await created.json()) as { data: { id: string } };
    expect(
      (
        await app.request(
          `/api/attachments/orders/1/files/${payload.data.id}`,
          { headers: adminHeaders() },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/attachments/orders/1/files/${payload.data.id}`,
          { method: 'DELETE', headers: adminHeaders() },
        )
      ).status,
    ).toBe(204);
  });

  it('serves Public seed content and requires a valid Token for Private content', async () => {
    await runBootstrap(config, deps);
    const app = registerApp(config, deps);

    const publicContent = await app.request(
      `/api/attachments/orders/1/files/${FILE_DEMO_PUBLIC_ATTACHMENT.id}/content`,
    );
    expect(publicContent.status).toBe(200);
    expect(await publicContent.text()).toBe(
      FILE_DEMO_FIXTURES.find(
        (fixture) => fixture.key === FILE_DEMO_PUBLIC_ATTACHMENT.key,
      )?.content,
    );

    const denied = await app.request(
      `/api/attachments/orders/1/files/${FILE_DEMO_PRIVATE_ATTACHMENT.id}/content`,
    );
    expect(denied.status).toBe(403);

    const tokenResponse = await app.request(
      `/api/attachments/orders/1/files/${FILE_DEMO_PRIVATE_ATTACHMENT.id}/token`,
      {
        method: 'POST',
        headers: adminHeaders(),
      },
    );
    expect(tokenResponse.status).toBe(200);
    const tokenPayload = (await tokenResponse.json()) as {
      data: { url: string };
    };
    const privateContent = await app.request(tokenPayload.data.url);
    expect(privateContent.status).toBe(200);
    expect(await privateContent.text()).toBe(
      FILE_DEMO_FIXTURES.find(
        (fixture) => fixture.key === FILE_DEMO_PRIVATE_ATTACHMENT.key,
      )?.content,
    );
  });

  it('keeps the seeded Avatar private and scopes both relationships', async () => {
    await runBootstrap(config, deps);
    const app = registerApp(config, deps);

    const avatarList = await app.request('/api/attachments/profiles/1/avatar', {
      headers: adminHeaders(),
    });
    const orderList = await app.request('/api/attachments/orders/1/files', {
      headers: adminHeaders(),
    });
    const otherOrder = await app.request('/api/attachments/orders/2/files', {
      headers: adminHeaders(),
    });

    expect(avatarList.status).toBe(200);
    await expect(avatarList.json()).resolves.toMatchObject({
      data: [{ id: FILE_DEMO_AVATAR.id, public: false }],
    });
    expect(orderList.status).toBe(200);
    await expect(orderList.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: FILE_DEMO_PUBLIC_ATTACHMENT.id,
          public: true,
        }),
        expect.objectContaining({
          id: FILE_DEMO_PRIVATE_ATTACHMENT.id,
          public: false,
        }),
      ]),
    });
    await expect(otherOrder.json()).resolves.toEqual({ data: [] });
  });

  it('does not start fixture work when infrastructure is intentionally absent', () => {
    const put = vi.spyOn(driveManager.use('local'), 'put');
    const unavailableConfig = { app: { publicBasePath: '' } };
    const container = createContainer(unavailableConfig, {
      auth: deps.auth,
      authz: deps.authz,
      logging: deps.logging,
    });
    const provider = new FileProvider({
      config: unavailableConfig,
      container,
      router: new Hono(),
    });
    provider.register();
    void provider.boot();

    expect(put).not.toHaveBeenCalled();
  });
});

async function runBootstrap(
  config: FilePluginConfig,
  deps: HostServices,
): Promise<void> {
  const container = createContainer(config, deps);
  const provider = new FileProvider({ config, container, router: new Hono() });
  provider.register();
  await provider.boot();
  await vi.waitFor(
    async () => {
      for (const fixture of FILE_DEMO_FIXTURES) {
        expect(
          await deps.driveManager
            ?.use(config.drive?.default ?? 'local')
            .exists(fixture.key),
        ).toBe(true);
      }
    },
    { timeout: 5_000 },
  );
}

function uploadBody(index: number): {
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
} {
  const boundary = `file-demo-boundary-${index}`;
  return {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="concurrent-${index}.txt"\r\nContent-Type: text/plain\r\n\r\ncontent-${index}\r\n--${boundary}--\r\n`,
  };
}

function registerApp(config: FilePluginConfig, deps: HostServices): Hono {
  const app = new Hono();
  const container = createContainer(config, deps);
  container.singleton(filePluginRuntimeToken, (resolver) =>
    resolveFilePluginRuntime(resolver, config),
  );
  app.route('/api/attachments', createFileDemoRoutes({ config, container }));
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

function createAuthorization(): HostAuthorization {
  return {
    middleware: () => async (context, next) => {
      const isAdministrator = context.req.header('x-demo-role') === 'admin';
      context.set('authz', {
        identity: {
          principal: {
            type: 'user',
            id: isAdministrator ? 'administrator' : 'member',
          },
        },
      });
      await next();
    },
    permissionSets: {
      getEffective: async ({ principal }) =>
        principal.id === 'administrator'
          ? [{ key: 'system-administrator' }]
          : [],
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
  _config: FilePluginConfig,
  services: HostServices,
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
  return container;
}

function adminHeaders(): Readonly<Record<string, string>> {
  return { 'x-demo-auth': 'allowed', 'x-demo-role': 'admin' };
}
