import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
} from '@nocobase/app-database';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import { Hono, type MiddlewareHandler } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import migration from '../database/migrations/202608270001_create_files_demo_tables.js';
import seed from '../database/seeds/202608270002_seed_files_demo.js';
import bootstrapFilesPlugin from '../server/bootstrap.js';
import {
  FILES_DEMO_AVATAR,
  FILES_DEMO_PRIVATE_ATTACHMENT,
  FILES_DEMO_PUBLIC_ATTACHMENT,
} from '../server/demo/constants.js';
import { FILES_DEMO_FIXTURES } from '../server/demo/fixtures.js';
import type {
  FilesPluginConfig,
  FilesPluginDeps,
} from '../server/plugin-runtime.js';
import { createFilesRoutes } from '../server/routes/index.js';

interface RawDatabaseClient {
  raw(sql: string): Promise<unknown>;
}

describe('files Demo backend', () => {
  let storageRoot: string;
  let database: DatabaseManager;
  let driveManager: NocoBaseDriveManager;
  let config: FilesPluginConfig;
  let deps: FilesPluginDeps;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'nocobase-files-demo-'));
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
        },
      },
      { fakes: { location: storageRoot } },
    );
    driveManager.fake('local');
    config = {
      app: { publicBasePath: '' },
      drive: { default: 'local' },
      session: { secret: 'files-demo-integration-secret' },
    };
    deps = {
      database,
      driveManager,
      auth: { required: () => authenticatedOnly() },
      authz: {} as FilesPluginDeps['authz'],
    };
  });

  afterEach(async () => {
    driveManager.restore('local');
    await database.destroy();
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('writes every deterministic fixture once across repeated bootstraps', async () => {
    const disk = driveManager.use('local');
    const put = vi.spyOn(disk, 'put');

    await runBootstrap(config, deps);
    for (const fixture of FILES_DEMO_FIXTURES) {
      expect(await disk.exists(fixture.key)).toBe(true);
      expect(await disk.get(fixture.key)).toBe(fixture.content);
    }
    expect(put).toHaveBeenCalledTimes(3);

    await runBootstrap(config, deps);
    expect(put).toHaveBeenCalledTimes(3);
  });

  it('serves Public seed content and requires a valid Token for Private content', async () => {
    await runBootstrap(config, deps);
    const app = registerApp(config, deps);

    const publicContent = await app.request(
      `/api/attachments/orders/1/files/${FILES_DEMO_PUBLIC_ATTACHMENT.id}/content`,
    );
    expect(publicContent.status).toBe(200);
    expect(await publicContent.text()).toBe(
      FILES_DEMO_FIXTURES.find(
        (fixture) => fixture.key === FILES_DEMO_PUBLIC_ATTACHMENT.key,
      )?.content,
    );

    const denied = await app.request(
      `/api/attachments/orders/1/files/${FILES_DEMO_PRIVATE_ATTACHMENT.id}/content`,
    );
    expect(denied.status).toBe(403);

    const tokenResponse = await app.request(
      `/api/attachments/orders/1/files/${FILES_DEMO_PRIVATE_ATTACHMENT.id}/token`,
      {
        method: 'POST',
        headers: { 'x-demo-auth': 'allowed' },
      },
    );
    expect(tokenResponse.status).toBe(200);
    const tokenPayload = (await tokenResponse.json()) as {
      data: { url: string };
    };
    const privateContent = await app.request(tokenPayload.data.url);
    expect(privateContent.status).toBe(200);
    expect(await privateContent.text()).toBe(
      FILES_DEMO_FIXTURES.find(
        (fixture) => fixture.key === FILES_DEMO_PRIVATE_ATTACHMENT.key,
      )?.content,
    );
  });

  it('keeps the seeded Avatar private and scopes both relationships', async () => {
    await runBootstrap(config, deps);
    const app = registerApp(config, deps);

    const avatarList = await app.request('/api/attachments/profiles/1/avatar', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    const orderList = await app.request('/api/attachments/orders/1/files', {
      headers: { 'x-demo-auth': 'allowed' },
    });
    const otherOrder = await app.request('/api/attachments/orders/2/files', {
      headers: { 'x-demo-auth': 'allowed' },
    });

    expect(avatarList.status).toBe(200);
    await expect(avatarList.json()).resolves.toMatchObject({
      data: [{ id: FILES_DEMO_AVATAR.id, public: false }],
    });
    expect(orderList.status).toBe(200);
    await expect(orderList.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: FILES_DEMO_PUBLIC_ATTACHMENT.id,
          public: true,
        }),
        expect.objectContaining({
          id: FILES_DEMO_PRIVATE_ATTACHMENT.id,
          public: false,
        }),
      ]),
    });
    await expect(otherOrder.json()).resolves.toEqual({ data: [] });
  });

  it('does not start fixture work when infrastructure is intentionally absent', () => {
    const put = vi.spyOn(driveManager.use('local'), 'put');
    bootstrapFilesPlugin({
      config: { app: { publicBasePath: '' } },
      deps: {
        auth: deps.auth,
        authz: deps.authz,
      },
      services: {},
      lifecycle: { registerDisposer: vi.fn() },
    });

    expect(put).not.toHaveBeenCalled();
  });
});

async function runBootstrap(
  config: FilesPluginConfig,
  deps: FilesPluginDeps,
): Promise<void> {
  bootstrapFilesPlugin({
    config,
    deps,
    services: {},
    lifecycle: { registerDisposer: vi.fn() },
  });
  await vi.waitFor(
    async () => {
      for (const fixture of FILES_DEMO_FIXTURES) {
        expect(
          await deps.driveManager?.use(fixture.disk).exists(fixture.key),
        ).toBe(true);
      }
    },
    { timeout: 5_000 },
  );
}

function registerApp(config: FilesPluginConfig, deps: FilesPluginDeps): Hono {
  const app = new Hono();
  app.route('/api/attachments', createFilesRoutes({ config, deps }));
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
