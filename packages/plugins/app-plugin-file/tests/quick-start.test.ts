import { File as NodeFile } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  createAppAuthorization,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { appConfig } from '@nocobase/app-server/config';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { sessionManagerToken } from '@nocobase/app-server/session';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { orderAttachmentRoutes } from '../skills/nocobase-app-plugin-file/reference/example/server/routes/order-attachments.js';

const migrationName = '202609070001_order_attachments';
const example = new URL(
  '../skills/nocobase-app-plugin-file/reference/example/',
  import.meta.url,
);
const directory = fileURLToPath(new URL('database/migrations', example));
const endpoint = '/base/api/purchase-orders/order-a/attachments';

beforeAll(() => vi.stubGlobal('File', NodeFile));
afterAll(() => vi.unstubAllGlobals());

it('typechecks the bundled example against public package APIs', () => {
  execFileSync(
    process.execPath,
    [
      createRequire(import.meta.url).resolve('typescript/bin/tsc'),
      '-p',
      fileURLToPath(new URL('tsconfig.json', example)),
    ],
    { stdio: 'inherit', timeout: 60_000 },
  );
}, 60_000);

describe('bundled file quick start', () => {
  let database: DatabaseManager;
  let authorization: AppAuthorization;
  let drive: NocoBaseDriveManager;
  let root: string;
  let router: Hono;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'file-quick-start-'));
    database = createDatabaseManager({
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await database
      .createMigrator({ directory, packageName: 'file-quick-start' })
      .upTo(migrationName);
    await database
      .createMigrator({
        directory: fileURLToPath(
          new URL(
            '../../app-plugin-authorization/database/migrations',
            import.meta.url,
          ),
        ),
        packageName: '@nocobase/app-plugin-authorization',
      })
      .upTo('202608210004_create_restriction_rules');
    authorization = createAppAuthorization({
      connection: database.connection(),
    });
    drive = createDriveManager({
      default: 'local',
      disks: { local: { driver: 'fs', location: root, visibility: 'private' } },
    });
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, database);
    container.instance(driveManagerToken, drive);
    container.instance(authorizationToken, authorization);
    // Only host configuration and the session boundary are faked. The example
    // route, authorization engine, migrations, Store, Drive and tokens run.
    container.instance(sessionManagerToken, {
      config: { secret: 'quick-start-test-secret' },
    } as never);
    const authentication: Pick<Auth, 'required'> = {
      required: () => async (context, next) => {
        const id = context.req.header('x-test-user');
        if (!id) return context.body(null, 401);
        context.set('auth', { user: { id } } as never);
        await next();
      },
    };
    container.instance(authenticationToken, authentication as Auth);
    const host = {
      container,
      config: {
        get: (key: unknown) =>
          key === appConfig ? { publicBasePath: '/base' } : { default: 'local' },
      },
    } as unknown as Application;
    router = new Hono();
    router.route('/base/api', await orderAttachmentRoutes.createRouter(host));
    await database
      .query()
      .insertInto('purchaseOrders')
      .values([
        { id: 'order-a', number: 'PO-A', ownerId: 'alice' },
        { id: 'order-b', number: 'PO-B', ownerId: 'bob' },
      ])
      .execute();
    await authorization.permissionSets.create({
      key: 'order-owner',
      grants: [
        authorization.database.grant('purchaseOrders', {
          read: {
            fields: { output: ['attachments'] },
            recordAccess: ['recordsIOwn'],
          },
          update: {
            fields: { input: ['attachments'] },
            recordAccess: ['recordsIOwn'],
          },
        }),
      ],
    });
    for (const id of ['alice', 'bob']) {
      await authorization.permissionSets.assign({
        permissionSet: 'order-owner',
        subject: { type: 'user', id },
      });
    }
  });

  afterEach(async () => {
    await database.destroy();
    await rm(root, { recursive: true, force: true });
  });

  async function request(
    url: string,
    user?: string,
    init?: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (user) headers.set('x-test-user', user);
    return router.request(url, { ...init, headers });
  }

  function upload(user = 'alice'): Promise<Response> {
    return request(endpoint, user, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=test-file' },
      body: '--test-file\r\nContent-Disposition: form-data; name="file"; filename="report.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-test\r\n--test-file--\r\n',
    });
  }

  it('denies unauthorized owners before writing', async () => {
    const cases = [
      [undefined, 401],
      ['unknown', 403],
      ['bob', 403],
    ] as const;
    for (const [user, status] of cases) {
      expect((await request(endpoint, user)).status).toBe(status);
    }
    expect((await upload('bob')).status).toBe(403);
    const missing = endpoint.replace('order-a', 'missing');
    expect((await request(missing, 'alice')).status).toBe(403);
    expect(
      await database.query().selectFrom('purchaseOrderAttachments').exists(),
    ).toBe(false);
    expect((await request(endpoint, 'alice')).status).toBe(200);
  });

  it('uploads, reloads, signs and deletes files', async () => {
    const response = await upload();
    expect(response.status).toBe(201);
    const { data: file } = (await response.json()) as {
      data: { id: string; contentUrl: string };
    };
    const item = `${endpoint}/${file.id}`;
    expect(file.contentUrl).toBe(`${item}/content`);
    const listed = await request(endpoint, 'alice');
    await expect(listed.json()).resolves.toMatchObject({
      data: [{ id: file.id }],
    });
    expect((await request(item, 'alice')).status).toBe(200);
    expect(
      (await request(`${item}/token`, 'bob', { method: 'POST' })).status,
    ).toBe(403);
    expect((await request(file.contentUrl, 'alice')).status).toBe(403);
    const token = await request(`${item}/token`, 'alice', { method: 'POST' });
    const { data: access } = (await token.json()) as { data: { url: string } };
    await expect((await request(access.url)).text()).resolves.toBe('%PDF-test');
    const wrongOwner = access.url.replace('order-a', 'order-b');
    expect((await request(wrongOwner)).status).toBe(404);
    const row = await database
      .query()
      .selectFrom('purchaseOrderAttachments')
      .selectAll()
      .where('id', '=', file.id)
      .executeTakeFirstOrThrow();
    expect(await drive.use('local').exists(String(row.key))).toBe(true);
    // The example preserves the metadata needed for parent/object cleanup.
    await expect(
      database
        .query()
        .deleteFrom('purchaseOrders')
        .where('id', '=', 'order-a')
        .execute(),
    ).rejects.toThrow();
    await expect(
      database
        .query()
        .insertInto('purchaseOrderAttachments')
        .values({ ...row, id: 'duplicate-key' })
        .execute(),
    ).rejects.toThrow();
    const removed = await request(item, 'alice', { method: 'DELETE' });
    expect(removed.status).toBe(204);
    expect(await drive.use('local').exists(String(row.key))).toBe(false);
    expect((await request(access.url)).status).toBe(404);
    await expect((await request(endpoint, 'alice')).json()).resolves.toEqual({
      data: [],
    });
  });

  it('enforces field and action permissions', async () => {
    const readers = [
      ['reader', 'attachments'],
      ['number-only', 'number'],
    ] as const;
    for (const [id, field] of readers) {
      await authorization.permissionSets.create({
        key: id,
        grants: [
          authorization.database.grant('purchaseOrders', {
            read: { fields: { output: [field] }, recordAccess: ['allRecords'] },
          }),
        ],
      });
      await authorization.permissionSets.assign({
        permissionSet: id,
        subject: { type: 'user', id },
      });
    }
    const { data: file } = (await (await upload()).json()) as {
      data: { id: string };
    };
    const item = `${endpoint}/${file.id}`;
    expect((await request(endpoint, 'number-only')).status).toBe(403);
    expect((await request(endpoint, 'reader')).status).toBe(200);
    expect((await request(item, 'reader')).status).toBe(200);
    expect(
      (await request(`${item}/token`, 'reader', { method: 'POST' })).status,
    ).toBe(200);
    expect((await upload('reader')).status).toBe(403);
    const removed = await request(item, 'reader', { method: 'DELETE' });
    expect(removed.status).toBe(403);
  });

  it('runs and rolls back the sample through the real migrator', async () => {
    const collection = await database
      .connection()
      .collections.get('purchaseOrderAttachments');
    expect(collection).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'orderId' }),
      ]),
    });
    await database
      .createMigrator({ directory, packageName: 'file-quick-start' })
      .rollback();
    expect(
      await database.builder().hasCollection('purchaseOrderAttachments'),
    ).toBe(false);
    expect(await database.builder().hasCollection('purchaseOrders')).toBe(false);
  });
});
