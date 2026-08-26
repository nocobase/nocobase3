import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/app-database';
import type {
  CreateBusinessFileResponse,
  FileErrorResponse,
  PublicFileAccessResponse,
  StoredFile,
} from '@nocobase/app-plugin-files/protocol';
import {
  createFileService,
  resolveFilesConfig,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import {
  createOpaqueFilesRuntime,
  getFilesRuntimeDataPlane,
  getFilesRuntimeKernel,
} from '../server/internal/runtime.js';
import { FakeS3Disk } from './support/fake-s3-disk.js';

const ORDER_ONE = 'order-1';
const ORDER_TWO = 'order-2';

interface RelationFixture {
  app: Hono;
  database: DatabaseManager;
  runtime: FilesRuntime;
  storageRoot: string;
  provider?: FakeS3Disk;
}

interface RelationRow {
  id: string;
  purchaseOrderId: string;
  fileId: string;
  slot: number;
  reservationExpiresAt: Date | string | null;
}

const fixtures: RelationFixture[] = [];

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(async (fixture) => {
      await fixture.runtime.dispose();
      await fixture.database.destroy();
      await rm(fixture.storageRoot, { recursive: true, force: true });
    }),
  );
});

describe('relation binding scoped file routes', () => {
  it('reserves, completes, and lists Local files without exposing slots or row IDs', async () => {
    const fixture = await createFixture();
    const upload = await createUpload(fixture, ORDER_ONE, 'first.txt', 5);
    const before = await relationRows(fixture, ORDER_ONE);
    expect(before).toHaveLength(1);
    expect(before[0]?.reservationExpiresAt).not.toBeNull();

    const put = await putLocal(fixture, upload, 'first');
    expect(put.status).toBe(200);
    await expect(put.json()).resolves.toMatchObject({
      file: { id: upload.file.id, status: 'pending' },
    });
    const complete = await completeUpload(fixture, upload);
    expect(complete.status).toBe(200);
    await expect(complete.json()).resolves.toMatchObject({
      file: { id: upload.file.id, status: 'ready', size: 5 },
    });

    const rows = await relationRows(fixture, ORDER_ONE);
    expect(rows[0]?.reservationExpiresAt).toBeNull();
    const listedResponse = await fixture.app.request(
      `/orders/${ORDER_ONE}/files`,
    );
    const listed = await json<StoredFile[]>(listedResponse);
    expect(listed).toEqual([
      expect.objectContaining({ id: upload.file.id, status: 'ready' }),
    ]);
    expect(JSON.stringify(listed)).not.toContain(rows[0]?.id);
    expect(listed[0]).not.toHaveProperty('slot');
  });

  it('releases a reservation during scoped cancel and permits slot reuse', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    const pending = await createUpload(fixture, ORDER_ONE, 'pending.txt', 4);
    await putLocal(fixture, pending, 'data');

    const cancelled = await fixture.app.request(pending.plan.cancel.url, {
      method: 'DELETE',
    });
    expect(cancelled.status).toBe(200);
    expect(await relationRows(fixture, ORDER_ONE)).toEqual([]);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(pending.file.id),
    ).toMatchObject({ status: 'failed' });
    expect(
      (await createUpload(fixture, ORDER_ONE, 'next.txt', 4)).file.id,
    ).not.toBe(pending.file.id);
  });

  it('releases expired reservation slots lazily without touching ready rows', async () => {
    let now = new Date('2026-08-24T00:00:00.000Z');
    const fixture = await createFixture({ maxFiles: 3, clock: () => now });
    const ready = await uploadAndComplete(
      fixture,
      ORDER_ONE,
      'ready.txt',
      'ready',
    );
    await fixture.database
      .query()
      .updateTable('purchaseOrderAttachments')
      .set({ reservationExpiresAt: now })
      .where('fileId', '=', ready.file.id)
      .execute();
    const expired = await createUpload(fixture, ORDER_ONE, 'expired.txt', 7);
    await putLocal(fixture, expired, 'expired');
    now = new Date('2026-08-24T00:10:00.000Z');
    const active = await createUpload(fixture, ORDER_ONE, 'active.txt', 6);
    now = new Date('2026-08-24T00:16:00.000Z');

    const listed = await fixture.app.request(`/orders/${ORDER_ONE}/files`);
    expect(listed.status).toBe(200);
    const rows = await relationRows(fixture, ORDER_ONE);
    expect(rows.map((row) => row.fileId).sort()).toEqual(
      [active.file.id, ready.file.id].sort(),
    );
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(expired.file.id),
    ).toMatchObject({ status: 'failed' });
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(ready.file.id),
    ).toMatchObject({ status: 'ready' });
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(active.file.id),
    ).toMatchObject({ status: 'pending' });

    const reused = await createUpload(fixture, ORDER_ONE, 'reused.txt', 6);
    expect(
      (await relationRows(fixture, ORDER_ONE)).map((row) => row.fileId).sort(),
    ).toEqual([active.file.id, ready.file.id, reused.file.id].sort());
  });

  it('replaces a file at full capacity', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    const original = await uploadAndComplete(
      fixture,
      ORDER_ONE,
      'old.txt',
      'old',
    );
    const originalRow = (await relationRows(fixture, ORDER_ONE))[0];
    const blocked = await fixture.app.request(
      `/orders/${ORDER_ONE}/files`,
      jsonRequest('POST', {
        name: 'extra.txt',
        size: 1,
        contentType: 'text/plain',
      }),
    );
    expect(await json<FileErrorResponse>(blocked)).toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
    });

    const replacement = await createUpload(
      fixture,
      ORDER_ONE,
      'new.txt',
      4,
      original.file.id,
    );
    await putLocal(fixture, replacement, 'next');
    expect((await completeUpload(fixture, replacement)).status).toBe(200);
    const replacementRow = (await relationRows(fixture, ORDER_ONE))[0];
    expect(replacementRow).toMatchObject({
      id: originalRow?.id,
      slot: originalRow?.slot,
      fileId: replacement.file.id,
      reservationExpiresAt: null,
    });
    await expect(
      json<StoredFile[]>(
        await fixture.app.request(`/orders/${ORDER_ONE}/files`),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: replacement.file.id, status: 'ready' }),
    ]);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(original.file.id),
    ).toMatchObject({ status: 'ready' });
  });

  it('retries relation completion after a persistence result is uncertain', async () => {
    const fixture = await createFixture();
    const upload = await createUpload(fixture, ORDER_ONE, 'retry.txt', 5);
    await putLocal(fixture, upload, 'retry');
    const transaction = fixture.database.transaction.bind(fixture.database);
    let failNextTransaction = true;
    fixture.database.transaction = async (operation, connection) => {
      if (failNextTransaction) {
        failNextTransaction = false;
        throw new Error('private database cause');
      }
      return transaction(operation, connection);
    };

    const failed = await completeUpload(fixture, upload);
    const failedBody = await failed.text();
    expect(failed.status).toBe(503);
    expect(JSON.parse(failedBody)).toEqual({
      error: 'The uploaded file could not be committed.',
      code: 'UPLOAD_FAILED',
    });
    expect(failedBody).not.toContain('private database cause');
    await expect(
      getFilesRuntimeKernel(fixture.runtime).getFile(upload.file.id),
    ).resolves.toMatchObject({ status: 'pending' });

    const retry = await completeUpload(fixture, upload);
    expect(retry.status).toBe(200);
    expect(await relationRows(fixture, ORDER_ONE)).toEqual([
      expect.objectContaining({
        fileId: upload.file.id,
        reservationExpiresAt: null,
      }),
    ]);
    expect((await completeUpload(fixture, upload)).status).toBe(200);
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(1);
  });

  it('leaves reservation database failures to the App error handler', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    fixture.app.onError((_error, context) =>
      context.json({ error: 'Internal Server Error' }, 500),
    );
    fixture.database.transaction = async () => {
      throw Object.assign(new Error('database is busy'), {
        code: 'SQLITE_BUSY',
      });
    };

    const response = await fixture.app.request(
      `/orders/${ORDER_ONE}/files`,
      jsonRequest('POST', {
        name: 'busy.txt',
        size: 1,
        contentType: 'text/plain',
      }),
    );

    expect(response.status).toBe(500);
    const responseBody = await response.text();
    expect(JSON.parse(responseBody)).toEqual({
      error: 'Internal Server Error',
    });
    expect(responseBody).not.toContain('database is busy');
    expect(responseBody).not.toContain('STORAGE_UNAVAILABLE');
  });

  it('runs Provider PUT simulation then scoped S3 complete and binds', async () => {
    const provider = new FakeS3Disk();
    const fixture = await createFixture({ provider });
    const upload = await createUpload(fixture, ORDER_ONE, 's3.txt', 4);

    expect(upload.plan.upload.url).toMatch(/^https:\/\/upload\.invalid\//);
    expect(upload.plan.complete.url).toMatch(
      /^\/orders\/order-1\/files\/.+\/complete\?access=/,
    );
    expect(upload.plan.cancel.url).toMatch(
      /^\/orders\/order-1\/files\/.+\/upload\?access=/,
    );
    provider.putUpload(upload.plan, {
      contentLength: 4,
      contentType: 'text/plain',
    });

    const complete = await completeUpload(fixture, upload);
    expect(complete.status).toBe(200);
    expect((await relationRows(fixture, ORDER_ONE))[0]?.fileId).toBe(
      upload.file.id,
    );
    const content = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${upload.file.id}/content`,
    );
    expect(content.status).toBe(302);
    expect(content.headers.get('location')).toMatch(
      /^https:\/\/read\.invalid\//,
    );
    const head = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${upload.file.id}/content`,
      { method: 'HEAD' },
    );
    expect(head.status).toBe(200);
    expect(head.headers.get('location')).toBeNull();
    expect(head.headers.get('content-length')).toBe('4');
  });

  it('resolves scoped complete/cancel races to failed plus released reservation', async () => {
    const provider = new FakeS3Disk();
    const fixture = await createFixture({ provider, maxFiles: 1 });
    const upload = await createUpload(fixture, ORDER_ONE, 'race.txt', 4);
    provider.putUpload(upload.plan, {
      contentLength: 4,
      contentType: 'text/plain',
    });
    const pause = provider.pauseNextCopy();
    const completion = completeUpload(fixture, upload);
    await pause.started;

    const cancellation = await fixture.app.request(upload.plan.cancel.url, {
      method: 'DELETE',
    });
    expect(cancellation.status).toBe(200);
    pause.release();
    const completed = await completion;
    expect(completed.status).toBe(409);
    expect(await json<FileErrorResponse>(completed)).toMatchObject({
      code: 'UPLOAD_FAILED',
    });
    expect(await relationRows(fixture, ORDER_ONE)).toEqual([]);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(upload.file.id),
    ).toMatchObject({ status: 'failed' });
    expect(provider.keys()).toEqual([]);
  });

  it('rejects cross-record capabilities and removed business actions', async () => {
    const fixture = await createFixture();
    const upload = await createUpload(fixture, ORDER_ONE, 'private.txt', 2);
    const tampered = upload.plan.cancel.url.replace(
      `/orders/${ORDER_ONE}/`,
      `/orders/${ORDER_TWO}/`,
    );
    expect(
      (await fixture.app.request(tampered, { method: 'DELETE' })).status,
    ).toBe(403);

    for (const route of [
      `/orders/${ORDER_ONE}/files/${upload.file.id}/commit`,
      `/orders/${ORDER_ONE}/files/${upload.file.id}/access`,
      `/orders/${ORDER_ONE}/files/uploads`,
    ]) {
      expect(
        (await fixture.app.request(route, { method: 'POST' })).status,
      ).toBe(404);
    }
  });

  it('accepts an existing relation plan after rebuilding runtime and route', async () => {
    const fixture = await createFixture();
    const upload = await createUpload(fixture, ORDER_ONE, 'restart.txt', 7);
    await fixture.runtime.dispose();
    const rebuiltRuntime = createOpaqueFilesRuntime({
      database: fixture.database,
      config: resolveFilesConfig({
        appStorageRoot: fixture.storageRoot,
        config: { storage: { driver: 'local', root: fixture.storageRoot } },
      }),
      audience: 'relation-route-test',
      secret: 'relation-route-test-secret-at-least-32-characters',
    });
    try {
      const rebuiltRoute = createFileService({
        runtime: rebuiltRuntime,
      }).createFileRoute({
        binding: {
          type: 'relation',
          collection: 'purchaseOrderAttachments',
          recordParam: 'orderId',
          recordField: 'purchaseOrderId',
          maxFiles: 2,
        },
        constraints: {
          maxBytes: 1024,
          allowedExtensions: ['.txt'],
          allowedContentTypes: ['text/plain'],
        },
        authorize() {},
      });
      const rebuiltApp = new Hono();
      rebuiltApp.route('/orders/:orderId/files', rebuiltRoute);
      expect(
        (
          await rebuiltApp.request(upload.plan.upload.url, {
            method: 'PUT',
            headers: { 'content-length': '7', 'content-type': 'text/plain' },
            body: 'restart',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await rebuiltApp.request(upload.plan.complete.url, {
            method: 'POST',
          })
        ).status,
      ).toBe(200);
      expect((await relationRows(fixture, ORDER_ONE))[0]?.fileId).toBe(
        upload.file.id,
      );
    } finally {
      await rebuiltRuntime.dispose();
    }
  });

  it('isolates relation plans from a different maxFiles binding', async () => {
    const fixture = await createFixture();
    const upload = await createUpload(fixture, ORDER_ONE, 'isolated.txt', 1);
    const isolatedRoute = createFileService({
      runtime: fixture.runtime,
    }).createFileRoute({
      binding: {
        type: 'relation',
        collection: 'purchaseOrderAttachments',
        recordParam: 'orderId',
        recordField: 'purchaseOrderId',
        maxFiles: 3,
      },
      authorize() {},
    });
    const isolatedApp = new Hono();
    isolatedApp.route('/orders/:orderId/files', isolatedRoute);
    expect(
      (
        await isolatedApp.request(upload.plan.upload.url, {
          method: 'PUT',
          body: 'x',
        })
      ).status,
    ).toBe(403);
  });

  it('returns Public Access URLs without exposing the raw token', async () => {
    const fixture = await createFixture({ publicAccess: true });
    const upload = await uploadAndComplete(
      fixture,
      ORDER_ONE,
      'public.txt',
      'public',
    );
    const base = `/orders/${ORDER_ONE}/files/${upload.file.id}/public-access`;
    const enabled = await json<PublicFileAccessResponse>(
      await fixture.app.request(
        base,
        jsonRequest('POST', { disposition: 'attachment' }),
      ),
    );
    expect(enabled.access).not.toHaveProperty('token');
    expect((await fixture.app.request(enabled.access.url)).status).toBe(200);

    const reset = await json<PublicFileAccessResponse>(
      await fixture.app.request(`${base}/reset`, { method: 'POST' }),
    );
    expect(reset.access).not.toHaveProperty('token');
    expect(reset.access.url).not.toBe(enabled.access.url);
    expect((await fixture.app.request(enabled.access.url)).status).toBe(403);
    expect((await fixture.app.request(reset.access.url)).status).toBe(200);
  });

  it('detaches a ready relation without purging the file', async () => {
    const fixture = await createFixture();
    const upload = await uploadAndComplete(
      fixture,
      ORDER_ONE,
      'detach.txt',
      'data',
    );
    expect(
      (
        await fixture.app.request(
          `/orders/${ORDER_ONE}/files/${upload.file.id}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    expect(await relationRows(fixture, ORDER_ONE)).toEqual([]);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(upload.file.id),
    ).toMatchObject({ status: 'ready' });
  });

  it('does not reveal global file state when the scope has no matching relation', async () => {
    const fixture = await createFixture();
    const ready = await uploadAndComplete(
      fixture,
      ORDER_TWO,
      'other-record.txt',
      'data',
    );
    const pending = await createUpload(
      fixture,
      ORDER_TWO,
      'pending-other-record.txt',
      4,
    );

    for (const fileId of ['missing-file', ready.file.id, pending.file.id]) {
      const response = await fixture.app.request(
        `/orders/${ORDER_ONE}/files/${fileId}`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    }
    expect(await relationRows(fixture, ORDER_TWO)).toHaveLength(2);
  });

  it('rejects a pending relation only in its current scope', async () => {
    const fixture = await createFixture();
    const pending = await createUpload(fixture, ORDER_ONE, 'pending.txt', 4);

    const response = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${pending.file.id}`,
      { method: 'DELETE' },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });
  });
});

interface CreateFixtureOptions {
  maxFiles?: number;
  publicAccess?: boolean;
  provider?: FakeS3Disk;
  clock?: () => Date;
}

async function createFixture(
  options: CreateFixtureOptions = {},
): Promise<RelationFixture> {
  const storageRoot = await mkdtemp(
    path.join(tmpdir(), 'files-relation-route-'),
  );
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
  await database.builder().createCollection('purchaseOrders', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
  });
  await database
    .builder()
    .createCollection('purchaseOrderAttachments', (collection) => {
      collection.string('id', { length: 64 }).notNull().primary();
      collection.string('purchaseOrderId', { length: 64 }).notNull();
      collection.string('fileId', { length: 64 }).notNull();
      collection.integer('slot').notNull();
      collection.datetime('reservationExpiresAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['purchaseOrderId', 'slot']);
      collection.unique(['purchaseOrderId', 'fileId']);
      collection.foreignKey('fileId', {
        references: { collection: 'files', fields: ['id'] },
        onDelete: 'restrict',
      });
      collection.foreignKey('purchaseOrderId', {
        references: { collection: 'purchaseOrders', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  await database
    .query()
    .insertInto('purchaseOrders')
    .values([{ id: ORDER_ONE }, { id: ORDER_TWO }])
    .execute();

  const runtime = createOpaqueFilesRuntime(
    {
      database,
      config: resolveFilesConfig({
        appStorageRoot: storageRoot,
        config: {
          storage: options.provider
            ? { driver: 's3', bucket: 'managed-files' }
            : { driver: 'local', root: storageRoot },
          publicAccess: { enabled: options.publicAccess ?? false },
        },
      }),
      audience: 'relation-route-test',
      secret: 'relation-route-test-secret-at-least-32-characters',
    },
    {
      ...(options.provider === undefined ? {} : { disk: options.provider }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    },
  );
  const route = createFileService({ runtime }).createFileRoute({
    binding: {
      type: 'relation',
      collection: 'purchaseOrderAttachments',
      recordParam: 'orderId',
      recordField: 'purchaseOrderId',
      maxFiles: options.maxFiles ?? 2,
    },
    constraints: {
      maxBytes: 1024,
      allowedExtensions: ['.txt'],
      allowedContentTypes: ['text/plain'],
    },
    publicAccess: options.publicAccess,
    authorize() {},
  });
  const app = new Hono();
  app.route('/api/files', getFilesRuntimeDataPlane(runtime).createRoute());
  app.route('/orders/:orderId/files', route);
  const fixture = {
    app,
    database,
    runtime,
    storageRoot,
    ...(options.provider === undefined ? {} : { provider: options.provider }),
  };
  fixtures.push(fixture);
  return fixture;
}

async function createUpload(
  fixture: RelationFixture,
  orderId: string,
  name: string,
  size: number,
  replaceFileId?: string,
): Promise<CreateBusinessFileResponse> {
  const response = await fixture.app.request(
    `/orders/${orderId}/files`,
    jsonRequest('POST', {
      name,
      size,
      contentType: 'text/plain',
      ...(replaceFileId === undefined ? {} : { replaceFileId }),
    }),
  );
  expect(response.status).toBe(201);
  return json<CreateBusinessFileResponse>(response);
}

async function uploadAndComplete(
  fixture: RelationFixture,
  orderId: string,
  name: string,
  contents: string,
): Promise<CreateBusinessFileResponse> {
  const upload = await createUpload(
    fixture,
    orderId,
    name,
    Buffer.byteLength(contents),
  );
  expect((await putLocal(fixture, upload, contents)).status).toBe(200);
  expect((await completeUpload(fixture, upload)).status).toBe(200);
  return upload;
}

function putLocal(
  fixture: RelationFixture,
  upload: CreateBusinessFileResponse,
  body: string,
): Promise<Response> {
  return Promise.resolve(
    fixture.app.request(upload.plan.upload.url, {
      method: 'PUT',
      headers: {
        ...upload.plan.upload.headers,
        'content-length': String(Buffer.byteLength(body)),
      },
      body,
    }),
  );
}

function completeUpload(
  fixture: RelationFixture,
  upload: CreateBusinessFileResponse,
): Promise<Response> {
  return Promise.resolve(
    fixture.app.request(upload.plan.complete.url, { method: 'POST' }),
  );
}

function relationRows(
  fixture: RelationFixture,
  orderId: string,
): Promise<RelationRow[]> {
  return fixture.database
    .query()
    .selectFrom('purchaseOrderAttachments')
    .selectAll()
    .where('purchaseOrderId', '=', orderId)
    .orderBy('slot', 'asc')
    .execute<RelationRow>();
}

function jsonRequest(method: string, body: object): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
