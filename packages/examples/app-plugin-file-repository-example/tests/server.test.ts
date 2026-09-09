// @vitest-environment node
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import { createDriveManager } from '@nocobase/drive';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import core from '@nocobase/app-plugin-file-repository/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import example from '../server/index.js';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose();
});
async function fixture() {
  const db = createDatabaseManager({
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  disposers.push(() => db.destroy());
  const directory = path.resolve(import.meta.dirname, '../database/migrations');
  const migrator = db.createMigrator({
    directory,
    packageName: example.packageName,
  });
  return { db, migrator, directory };
}

it('owns the explicit attachments migration and reverses physical schema and metadata', async () => {
  const { db, migrator } = await fixture();
  expect(example.database?.migrations).toBe('./database/migrations');
  await migrator.latest();
  expect(
    (await db.connection().collections.get('attachments'))?.fields?.map(
      (field) => field.name,
    ),
  ).toEqual(
    expect.arrayContaining([
      'id',
      'disk',
      'key',
      'filename',
      'ext',
      'mimeType',
      'size',
      'createdAt',
      'updatedAt',
    ]),
  );
  expect(
    await db.connection().collections.getPhysical('attachments'),
  ).toBeDefined();
  expect(
    (await db.connection().collectionMetadata.get('attachments'))?.document,
  ).toBeDefined();
  await migrator.rollback();
  expect(
    await db.connection().collections.getPhysical('attachments'),
  ).toBeUndefined();
  expect(
    await db.connection().collectionMetadata.get('attachments'),
  ).toBeUndefined();
});

it('recognizes the unchanged migration previously run under the core package', async () => {
  const { db, migrator, directory } = await fixture();
  await db
    .createMigrator({ directory, packageName: core.packageName })
    .latest();
  const result = await migrator.latest();
  expect(result.executed).toEqual([]);
  expect(result.skipped).toContain('202609070001_create_attachments');
  expect(
    await db.connection().collections.getPhysical('attachments'),
  ).toBeDefined();
});

it('composes public core services with example routes for upload and download', async () => {
  const { db, migrator } = await fixture();
  await migrator.latest();
  const directory = await mkdtemp(
    path.join(tmpdir(), 'file-repository-example-'),
  );
  disposers.push(() => rm(directory, { recursive: true, force: true }));
  const drive = createDriveManager({
    default: 'local',
    disks: {
      local: { driver: 'fs', location: directory, visibility: 'private' },
    },
  });
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, db);
  container.instance(driveManagerToken, drive);
  const app = { container, publicBasePath: '/main' } as AppPluginApplication;
  for (const Provider of core.serviceProviders) new Provider(app).register();
  const router = new Hono();
  for (const route of example.routes)
    router.route(
      route.scope === 'api' ? '/main/api' : '/main',
      await route.createRouter(app),
    );
  const body = new FormData();
  body.append(
    'file',
    new File(['example'], 'example.txt', { type: 'text/plain' }),
  );
  const response = await router.request('/main/api/attachments:uploadOne', {
    method: 'POST',
    body,
  });
  expect(response.status).toBe(200);
  const { data } = (await response.json()) as {
    data: { record: { contentUrl: string } };
  };
  expect(data.record.contentUrl).toMatch(/^\/main\/uploads\/attachments\//);
  const download = await router.request(data.record.contentUrl);
  expect(await download.text()).toBe('example');
  expect(
    (await router.request('/main/api/uploads/attachments/example.txt')).status,
  ).toBe(404);
});
