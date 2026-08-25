import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { serve } from '@hono/node-server';
import { expect, test } from '@playwright/test';
import { Hono } from 'hono';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/app-database';
import {
  createFileService,
  createFilesRuntime,
  resolveFilesConfig,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';

import filesMigration from '../../app-plugin-files/database/migrations/202608221000_files_create_files.ts';
import { loadPortalE2EEnvironment, resolvePortalTestURL } from './support';

interface FilesServerFixture {
  database: DatabaseManager;
  runtime: FilesRuntime;
  server: Server;
  storageRoot: string;
}

const environment = loadPortalE2EEnvironment();
const filesServerPort = Number(process.env.NOCOBASE_E2E_FILES_PORT ?? 4174);
let fixture: FilesServerFixture;

test.beforeAll(async () => {
  fixture = await createFilesServerFixture();
});

test.afterAll(async () => {
  await closeServer(fixture.server);
  await fixture.runtime.dispose();
  await fixture.database.destroy();
  await rm(fixture.storageRoot, { recursive: true, force: true });
});

test('uploads, previews, downloads, and detaches through the real Files route', async ({
  page,
}) => {
  const requests: Array<{ method: string; path: string }> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/e2e/')) {
      requests.push({ method: request.method(), path: url.pathname });
    }
  });

  await page.goto(resolvePortalTestURL(environment, 'e2e/files-upload.html'));
  await page.getByLabel('Choose file').setInputFiles({
    name: 'contract.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('server-backed files'),
  });

  const previewButton = page.getByRole('button', {
    name: 'Preview: contract.txt',
    exact: true,
  });
  await expect(previewButton).toBeVisible();
  await expect(page.getByText('contract.txt', { exact: true })).toBeVisible();
  expect(requests.map(({ method }) => method).slice(0, 3)).toEqual([
    'POST',
    'PUT',
    'POST',
  ]);

  await previewButton.click();
  await expect(
    page.getByText('server-backed files', { exact: true }),
  ).toBeVisible();

  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toBe('contract.txt');

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('[data-slot="file-upload-field"] .group').first().hover();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('contract.txt', { exact: true })).toHaveCount(0);

  expect(requests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ method: 'GET' }),
      expect.objectContaining({ method: 'HEAD' }),
      expect.objectContaining({ method: 'DELETE' }),
    ]),
  );
  await expect(
    fixture.database
      .query()
      .selectFrom('documents')
      .select('fileId')
      .where('id', '=', 'document-1')
      .executeTakeFirst<Record<string, unknown>>(),
  ).resolves.toMatchObject({ fileId: null });
});

async function createFilesServerFixture(): Promise<FilesServerFixture> {
  const database = createDatabaseManager({
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
        pool: { min: 1, max: 1 },
      },
    },
  });
  await filesMigration.up(createMigrationContext(database.connection()));
  await database.builder().createCollection('documents', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('fileId', { length: 64 }).nullable();
    collection.foreignKey('fileId', {
      references: { collection: 'files', fields: ['id'] },
      onDelete: 'restrict',
    });
  });
  await database
    .query()
    .insertInto('documents')
    .values({ id: 'document-1', fileId: null })
    .execute();
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'files-e2e-'));
  const runtime = createFilesRuntime({
    database,
    config: resolveFilesConfig({
      appStorageRoot: storageRoot,
      config: { storage: { driver: 'local', root: storageRoot } },
    }),
    audience: 'files-e2e',
    secret: 'files-e2e-secret-at-least-32-characters',
  });
  const route = createFileService({ runtime }).createFileRoute({
    binding: {
      type: 'field',
      collection: 'documents',
      recordParam: 'documentId',
      fileField: 'fileId',
    },
    constraints: {
      allowedExtensions: ['.txt'],
      allowedContentTypes: ['text/plain'],
    },
    authorize() {},
  });
  const app = new Hono();
  app.route('/api/e2e/documents/:documentId/file', route);
  const server = await startServer(app, filesServerPort);
  return { database, runtime, server, storageRoot };
}

function startServer(app: Hono, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = serve(
      { fetch: app.fetch, hostname: '127.0.0.1', port },
      () => resolve(server as Server),
    ) as Server;
    server.once('error', reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
