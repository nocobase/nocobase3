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
import type {
  CreateBusinessFileResponse,
  StoredFile,
} from '@nocobase/app-plugin-files/protocol';

import filesMigration from '../../app-plugin-files/database/migrations/202608221000_files_create_files.ts';
import cleanupMigration from '../../app-plugin-files/database/migrations/202608261000_files_add_temporary_cleanup.ts';
import { runCleanupExpiredUploads } from '../../app-plugin-files/server/internal/jobs/cleanup-expired-uploads.ts';
import { loadPortalE2EEnvironment, resolvePortalTestURL } from './support';

interface FilesServerFixture {
  database: DatabaseManager;
  runtime: FilesRuntime;
  server: Server;
  storageRoot: string;
  delayNextUpload(): void;
  failNextUpload(): void;
  releaseDelayedUpload(): void;
  reset(): Promise<void>;
  seedFile(name: string, content: string): Promise<StoredFile>;
}

const environment = loadPortalE2EEnvironment();
const filesServerPort = Number(process.env.NOCOBASE_E2E_FILES_PORT ?? 4174);
let fixture: FilesServerFixture;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  fixture = await createFilesServerFixture();
});

test.beforeEach(async () => {
  await fixture.reset();
});

test.afterAll(async () => {
  fixture.releaseDelayedUpload();
  await closeServer(fixture.server);
  await fixture.runtime.dispose();
  await fixture.database.destroy();
  await rm(fixture.storageRoot, { recursive: true, force: true });
});

test('renders the plugin default /files page and the Registry page override', async ({
  page,
}) => {
  await page.goto(
    resolvePortalTestURL(environment, 'e2e/files-routes.html?source=plugin'),
  );
  await expect(page).toHaveURL(/\/files$/u);
  await expect(
    page.getByRole('heading', { name: 'Files', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Application capability')).toBeVisible();
  await expect(page.getByText('Runtime enabled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View details' })).toHaveCount(
    0,
  );

  await page.goto(
    resolvePortalTestURL(environment, 'e2e/files-routes.html?source=registry'),
  );
  await expect(page).toHaveURL(/\/files$/u);
  await expect(page.getByText('Application-owned page')).toBeVisible();
  await page.getByRole('button', { name: 'View details' }).click();
  await expect(page.getByText(/\/api\/$/u)).toBeVisible();
});

test('validates submission, uploads, replaces, previews, downloads, and detaches', async ({
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
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'At least one file is required.',
  );
  await expect(page.getByTestId('submit-result')).toHaveText('Not saved');

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
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('submit-result')).toHaveText('Saved 1 file');
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
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'replacement.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('replacement content'),
  });
  await expect(
    page.getByText('replacement.txt', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('contract.txt', { exact: true })).toHaveCount(0);

  await page
    .getByRole('button', {
      name: 'Preview: replacement.txt',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('replacement content', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('[data-slot="file-upload-field"] .group').first().hover();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('replacement.txt', { exact: true })).toHaveCount(
    0,
  );

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

test('cancels an active upload and retries a failed upload', async ({
  page,
}) => {
  await page.goto(resolvePortalTestURL(environment, 'e2e/files-upload.html'));

  fixture.delayNextUpload();
  await page.getByLabel('Choose file').setInputFiles({
    name: 'cancel.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('cancel'),
  });
  await expect(page.locator('[data-slot="file-upload-field"]')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page.getByText('cancel.txt', { exact: true }).hover();
  await page
    .getByRole('button', { name: 'Cancel', exact: true })
    .click({ force: true });
  await expect(page.getByLabel('Cancelled')).toBeVisible();
  fixture.releaseDelayedUpload();
  await page.getByText('cancel.txt', { exact: true }).hover();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  fixture.failNextUpload();
  await page.getByLabel('Choose file').setInputFiles({
    name: 'retry.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('retry'),
  });
  await expect(page.getByLabel('Failed')).toBeVisible();
  await page.locator('[data-slot="file-upload-field"] .group').first().hover();
  await page
    .getByRole('button', { name: 'Retry', exact: true })
    .click({ force: true });
  await expect(page.getByText('retry.txt', { exact: true })).toBeVisible();
  await expect(page.getByTestId('file-ids')).not.toHaveText('');
});

test('keeps read-only files previewable without mutation controls', async ({
  page,
}) => {
  const file = await fixture.seedFile('read-only.txt', 'read-only content');
  const query = new URLSearchParams({
    readOnly: '1',
    seedId: file.id,
    seedName: file.name,
    seedSize: String(file.size ?? 0),
    seedContentType: file.contentType ?? '',
  });
  await page.goto(
    resolvePortalTestURL(
      environment,
      `e2e/files-upload.html?${query.toString()}`,
    ),
  );

  await expect(page.getByLabel('Choose file')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replace' })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Preview: read-only.txt', exact: true })
    .click();
  await expect(
    page.getByText('read-only content', { exact: true }),
  ).toBeVisible();
});

test('cleans an expired browser-created upload through the shared runtime', async ({
  page,
}) => {
  await page.goto(resolvePortalTestURL(environment, 'e2e/files-upload.html'));
  const created = await page.evaluate(async () => {
    const portalBase =
      typeof window.NOCOBASE_PORTAL_BASE === 'string' &&
      window.NOCOBASE_PORTAL_BASE !== '/'
        ? `/${window.NOCOBASE_PORTAL_BASE.replace(/^\/+|\/+$/g, '')}`
        : '';
    const response = await fetch(
      `${portalBase}/api/e2e/documents/document-1/file`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'expired.txt',
          size: 7,
          contentType: 'text/plain',
        }),
      },
    );
    if (!response.ok) throw new Error('The cleanup fixture create failed.');
    return (await response.json()) as CreateBusinessFileResponse;
  });
  await page.evaluate(async (plan) => {
    const response = await fetch(plan.upload.url, {
      method: 'PUT',
      body: 'expired',
    });
    if (!response.ok) throw new Error('The cleanup fixture upload failed.');
  }, created.plan);

  await fixture.database
    .query()
    .updateTable('files')
    .set({ uploadExpiresAt: new Date('2000-01-01T00:00:00.000Z') })
    .where('id', '=', created.file.id)
    .execute();
  const result = await runCleanupExpiredUploads(
    {
      filesRuntime: fixture.runtime,
      logger: { info() {}, warn() {} },
    },
    { batchSize: 10, timeBudgetMs: 1_000 },
  );

  expect(result).toMatchObject({ cleaned: 1, deleteFailures: 0 });
  await expect(
    fixture.database
      .query()
      .selectFrom('files')
      .select(['status', 'temporaryCleanupCompletedAt'])
      .where('id', '=', created.file.id)
      .executeTakeFirst<Record<string, unknown>>(),
  ).resolves.toMatchObject({
    status: 'failed',
    temporaryCleanupCompletedAt: expect.anything(),
  });
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
  await cleanupMigration.up(createMigrationContext(database.connection()));
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
  const fileService = createFileService({ runtime });
  const route = fileService.createFileRoute({
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
  let failNextUpload = false;
  let delayedUpload: Promise<void> | undefined;
  let releaseDelayedUpload = (): void => undefined;
  app.use('/api/e2e/*', async (context, next) => {
    if (context.req.method !== 'PUT' || !context.req.path.endsWith('/upload')) {
      return next();
    }
    if (failNextUpload) {
      failNextUpload = false;
      return context.json(
        { error: 'The simulated upload failed.', code: 'UPLOAD_FAILED' },
        503,
      );
    }
    const pendingDelay = delayedUpload;
    if (pendingDelay) {
      delayedUpload = undefined;
      await pendingDelay;
      return context.json(
        { error: 'The delayed upload was released.', code: 'UPLOAD_DELAYED' },
        503,
      );
    }
    return next();
  });
  app.route('/api/e2e/documents/:documentId/file', route);
  const server = await startServer(app, filesServerPort);
  return {
    database,
    runtime,
    server,
    storageRoot,
    delayNextUpload(): void {
      delayedUpload = new Promise<void>((resolve) => {
        releaseDelayedUpload = resolve;
      });
    },
    failNextUpload(): void {
      failNextUpload = true;
    },
    releaseDelayedUpload(): void {
      releaseDelayedUpload();
      releaseDelayedUpload = (): void => undefined;
      delayedUpload = undefined;
    },
    async reset(): Promise<void> {
      releaseDelayedUpload();
      releaseDelayedUpload = (): void => undefined;
      delayedUpload = undefined;
      failNextUpload = false;
      await database
        .query()
        .updateTable('documents')
        .set({ fileId: null })
        .where('id', '=', 'document-1')
        .execute();
      await database.query().deleteFrom('files').allowAllRows().execute();
    },
    async seedFile(name: string, content: string): Promise<StoredFile> {
      const encoded = new TextEncoder().encode(content);
      const file = await fileService.createFile({
        name,
        contentType: 'text/plain',
        size: encoded.byteLength,
        content: createContentStream(encoded),
      });
      await database
        .query()
        .updateTable('documents')
        .set({ fileId: file.id })
        .where('id', '=', 'document-1')
        .execute();
      return file;
    },
  };
}

function createContentStream(content: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.enqueue(content);
      controller.close();
    },
  });
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
