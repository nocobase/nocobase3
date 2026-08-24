import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/database';
import type {
  CreateBusinessFileResponse,
  FileErrorResponse,
  FileReference,
  ListFileReferencesResponse,
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

const ORDER_ONE = 'order-1';
const ORDER_TWO = 'order-2';

interface RelationFixture {
  app: Hono;
  database: DatabaseManager;
  runtime: FilesRuntime;
  storageRoot: string;
  advance(milliseconds: number): void;
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
  vi.restoreAllMocks();
  await Promise.all(
    fixtures.splice(0).map(async (fixture) => {
      await fixture.runtime.dispose();
      await fixture.database.destroy();
      await rm(fixture.storageRoot, { recursive: true, force: true });
    }),
  );
});

describe('relation binding file routes', () => {
  it('mounts the shared resource contract without relation identifiers', async () => {
    const fixture = await createFixture({ publicAccess: true });
    const service = createFileService({ runtime: fixture.runtime });
    const child = service.createFileRoute({
      binding: {
        type: 'relation',
        collection: 'purchaseOrderAttachments',
        recordParam: 'orderId',
        recordField: 'purchaseOrderId',
        maxFiles: 2,
      },
      publicAccess: true,
      authorize() {},
    });

    expect(
      child.routes.map(({ method, path: routePath }) => [method, routePath]),
    ).toEqual([
      ['GET', '/'],
      ['POST', '/'],
      ['POST', '/:fileId/commit'],
      ['DELETE', '/:fileId'],
      ['POST', '/:fileId/access'],
      ['POST', '/:fileId/public-access'],
      ['POST', '/:fileId/public-access/reset'],
      ['DELETE', '/:fileId/public-access'],
    ]);
    expect(
      child.routes.some(({ path: routePath }) =>
        routePath.includes('reference'),
      ),
    ).toBe(false);
    expect(
      child.routes.some(({ path: routePath }) => routePath.includes('uploads')),
    ).toBe(false);
  });

  it('creates reservations, commits idempotently, and lists ready files by stable slot', async () => {
    const fixture = await createFixture();
    const first = await createReadyUpload(fixture, ORDER_ONE, 'first.txt', 5);
    const second = await createReadyUpload(fixture, ORDER_ONE, 'second.txt', 6);
    expect(Object.keys(first).sort()).toEqual([
      'bindingCredential',
      'file',
      'uploadPlan',
    ]);

    const firstCommit = await commitUpload(fixture, ORDER_ONE, first);
    const secondCommit = await commitUpload(fixture, ORDER_ONE, second);
    expect(firstCommit.status).toBe(200);
    expect(secondCommit.status).toBe(200);
    const firstReference = await json<FileReference>(firstCommit);
    const secondReference = await json<FileReference>(secondCommit);
    expect(firstReference.slot).toBe(1);
    expect(secondReference.slot).toBe(2);
    expect(
      await json<FileReference>(await commitUpload(fixture, ORDER_ONE, first)),
    ).toEqual(firstReference);

    const listed = await fixture.app.request(`/orders/${ORDER_ONE}/files`);
    const body = await json<ListFileReferencesResponse>(listed);
    expect(body.references).toEqual([firstReference, secondReference]);
    const rows = await relationRows(fixture, ORDER_ONE);
    expect(rows.map((row) => row.reservationExpiresAt)).toEqual([null, null]);
    for (const row of rows) {
      expect(JSON.stringify(body)).not.toContain(row.id);
    }
  });

  it('enforces maxFiles with persisted slots and keeps records independent', async () => {
    const fixture = await createFixture({ maxFiles: 2 });
    await createUpload(fixture, ORDER_ONE, 'one.txt', 1);
    await createUpload(fixture, ORDER_ONE, 'two.txt', 1);
    const exceeded = await fixture.app.request(
      `/orders/${ORDER_ONE}/files`,
      jsonRequest('POST', {
        name: 'three.txt',
        size: 1,
        contentType: 'text/plain',
      }),
    );
    expect(exceeded.status).toBe(409);
    expect(await json<FileErrorResponse>(exceeded)).toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
    });

    const other = await createUpload(fixture, ORDER_TWO, 'other.txt', 1);
    expect(other.uploadPlan.fileId).toHaveLength(64);
    expect(
      (await relationRows(fixture, ORDER_ONE)).map((row) => row.slot),
    ).toEqual([1, 2]);
    expect(
      (await relationRows(fixture, ORDER_TWO)).map((row) => row.slot),
    ).toEqual([1]);
  });

  it('uses real transactions and the unique slot constraint under concurrent reservation', async () => {
    const fixture = await createFixture({ maxFiles: 3 });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        fixture.app.request(
          `/orders/${ORDER_ONE}/files`,
          jsonRequest('POST', {
            name: `concurrent-${index}.txt`,
            size: 1,
            contentType: 'text/plain',
          }),
        ),
      ),
    );
    expect(results.filter((response) => response.status === 201)).toHaveLength(
      3,
    );
    expect(results.filter((response) => response.status === 409)).toHaveLength(
      5,
    );
    const rows = await relationRows(fixture, ORDER_ONE);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.slot).sort()).toEqual([1, 2, 3]);
    const fileId = required(rows[0]).fileId;
    await expect(
      fixture.database
        .query()
        .insertInto('purchaseOrderAttachments')
        .values({
          id: 'f'.repeat(64),
          purchaseOrderId: ORDER_ONE,
          fileId,
          slot: 1,
          reservationExpiresAt: new Date('2026-08-24T00:05:00.000Z'),
          createdAt: new Date('2026-08-24T00:00:00.000Z'),
          updatedAt: new Date('2026-08-24T00:00:00.000Z'),
        })
        .execute(),
    ).rejects.toThrow();
  });

  it('releases expired non-ready reservations on the next record access', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    const expired = await createUpload(fixture, ORDER_ONE, 'abandoned.txt', 2);
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(1);
    fixture.advance(301_000);

    const listed = await fixture.app.request(`/orders/${ORDER_ONE}/files`);
    expect(await json<ListFileReferencesResponse>(listed)).toEqual({
      references: [],
    });
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(0);
    expect(
      (await createUpload(fixture, ORDER_ONE, 'next.txt', 2)).uploadPlan.fileId,
    ).not.toBe(expired.uploadPlan.fileId);
  });

  it('requires the binding credential for pending DELETE and releases the slot before cancel', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    const pending = await createUpload(fixture, ORDER_ONE, 'pending.txt', 2);
    const withoutCredential = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${pending.uploadPlan.fileId}`,
      { method: 'DELETE' },
    );
    expect(withoutCredential.status).toBe(409);
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(1);

    vi.spyOn(
      getFilesRuntimeKernel(fixture.runtime),
      'cancelUpload',
    ).mockRejectedValueOnce(new Error('storage cancel failed'));
    const deleted = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${pending.uploadPlan.fileId}`,
      jsonRequest('DELETE', { bindingCredential: pending.bindingCredential }),
    );
    expect(deleted.status).toBe(200);
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(0);
    expect(
      (await createUpload(fixture, ORDER_ONE, 'replacement.txt', 2)).uploadPlan
        .fileId,
    ).toHaveLength(64);
  });

  it('still requires the credential after bytes are ready but before relation commit', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    const pending = await createReadyUpload(
      fixture,
      ORDER_ONE,
      'ready-uncommitted.txt',
      2,
    );
    const withoutCredential = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${pending.uploadPlan.fileId}`,
      { method: 'DELETE' },
    );
    expect(withoutCredential.status).toBe(409);
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(1);

    const deleted = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${pending.uploadPlan.fileId}`,
      jsonRequest('DELETE', { bindingCredential: pending.bindingCredential }),
    );
    expect(deleted.status).toBe(200);
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(0);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(
        pending.uploadPlan.fileId,
      ),
    ).toMatchObject({
      status: 'ready',
    });
  });

  it('does not allow a pending credential or fileId to cross record boundaries', async () => {
    const fixture = await createFixture();
    const pending = await createUpload(fixture, ORDER_ONE, 'private.txt', 2);
    const crossDelete = await fixture.app.request(
      `/orders/${ORDER_TWO}/files/${pending.uploadPlan.fileId}`,
      jsonRequest('DELETE', { bindingCredential: pending.bindingCredential }),
    );
    expect(crossDelete.status).toBe(403);
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(1);

    await uploadBytes(fixture, pending, 'xx');
    await commitUpload(fixture, ORDER_ONE, pending);
    const crossAccess = await fixture.app.request(
      `/orders/${ORDER_TWO}/files/${pending.uploadPlan.fileId}/access`,
      { method: 'POST' },
    );
    expect(crossAccess.status).toBe(404);
  });

  it('replaces at capacity while preserving the internal row id and slot', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    const original = await createReadyUpload(fixture, ORDER_ONE, 'old.txt', 3);
    await commitUpload(fixture, ORDER_ONE, original);
    const before = required((await relationRows(fixture, ORDER_ONE))[0]);

    const replacement = await createUpload(
      fixture,
      ORDER_ONE,
      'new.txt',
      4,
      original.uploadPlan.fileId,
    );
    const beforeCommit = await fixture.app.request(
      `/orders/${ORDER_ONE}/files`,
    );
    expect(
      (await json<ListFileReferencesResponse>(beforeCommit)).references[0]?.file
        .id,
    ).toBe(original.uploadPlan.fileId);
    const extra = await fixture.app.request(
      `/orders/${ORDER_ONE}/files`,
      jsonRequest('POST', {
        name: 'extra.txt',
        size: 1,
        contentType: 'text/plain',
      }),
    );
    expect((await json<FileErrorResponse>(extra)).code).toBe(
      'FILE_LIMIT_EXCEEDED',
    );

    await uploadBytes(fixture, replacement, 'next');
    const committed = await commitUpload(fixture, ORDER_ONE, replacement);
    expect(committed.status).toBe(200);
    expect((await json<FileReference>(committed)).slot).toBe(before.slot);
    const after = required((await relationRows(fixture, ORDER_ONE))[0]);
    expect(after).toMatchObject({
      id: before.id,
      slot: before.slot,
      fileId: replacement.uploadPlan.fileId,
      reservationExpiresAt: null,
    });
  });

  it('keeps the old reference when replacement is cancelled', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    const original = await createReadyUpload(fixture, ORDER_ONE, 'old.txt', 3);
    await commitUpload(fixture, ORDER_ONE, original);
    const before = required((await relationRows(fixture, ORDER_ONE))[0]);
    const replacement = await createUpload(
      fixture,
      ORDER_ONE,
      'cancelled.txt',
      2,
      original.uploadPlan.fileId,
    );

    const deleted = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${replacement.uploadPlan.fileId}`,
      jsonRequest('DELETE', {
        bindingCredential: replacement.bindingCredential,
      }),
    );
    expect(deleted.status).toBe(200);
    expect(required((await relationRows(fixture, ORDER_ONE))[0])).toEqual(
      before,
    );
    const listed = await fixture.app.request(`/orders/${ORDER_ONE}/files`);
    expect(
      (await json<ListFileReferencesResponse>(listed)).references[0]?.file.id,
    ).toBe(original.uploadPlan.fileId);
  });

  it('detaches ready files without deleting them and leaves FK protection to the database', async () => {
    const fixture = await createFixture();
    const upload = await createReadyUpload(fixture, ORDER_ONE, 'bound.txt', 4);
    await commitUpload(fixture, ORDER_ONE, upload);
    const kernel = getFilesRuntimeKernel(fixture.runtime);
    await expect(kernel.purgeFile(upload.uploadPlan.fileId)).rejects.toThrow();
    expect(await kernel.getFile(upload.uploadPlan.fileId)).toBeDefined();

    const detached = await fixture.app.request(
      `/orders/${ORDER_ONE}/files/${upload.uploadPlan.fileId}`,
      { method: 'DELETE' },
    );
    expect(detached.status).toBe(200);
    expect(await relationRows(fixture, ORDER_ONE)).toHaveLength(0);
    expect(await kernel.getFile(upload.uploadPlan.fileId)).toMatchObject({
      status: 'ready',
    });
    expect(
      (
        await fixture.app.request(
          `/orders/${ORDER_ONE}/files/${upload.uploadPlan.fileId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    await expect(kernel.purgeFile(upload.uploadPlan.fileId)).resolves.toBe(
      true,
    );
  });

  it('fails fast for malformed relation collections and options', async () => {
    const fixture = await createFixture();
    const service = createFileService({ runtime: fixture.runtime });
    expect(() =>
      service.createFileRoute({
        binding: {
          type: 'relation',
          collection: 'purchaseOrderAttachmentsWithoutUnique',
          recordParam: 'orderId',
          recordField: 'purchaseOrderId',
          maxFiles: 2,
        },
        authorize() {},
      }),
    ).toThrow(/unique constraint/i);
    expect(() =>
      service.createFileRoute({
        binding: {
          type: 'relation',
          collection: 'purchaseOrderAttachments',
          recordParam: 'orderId',
          recordField: 'purchaseOrderId',
          maxFiles: 0,
        },
        authorize() {},
      }),
    ).toThrow(/maxFiles.*positive integer/i);
    const missingAuthorize = {
      binding: {
        type: 'relation' as const,
        collection: 'purchaseOrderAttachments',
        recordParam: 'orderId',
        recordField: 'purchaseOrderId',
        maxFiles: 2,
      },
      authorize() {},
    };
    Reflect.deleteProperty(missingAuthorize, 'authorize');
    expect(() => service.createFileRoute(missingAuthorize)).toThrow(
      /authorize.*function/i,
    );
  });
});

interface CreateFixtureOptions {
  maxFiles?: number;
  publicAccess?: boolean;
}

async function createFixture(
  options: CreateFixtureOptions = {},
): Promise<RelationFixture> {
  const storageRoot = await mkdtemp(
    path.join(tmpdir(), 'files-relation-route-'),
  );
  const databaseFile = path.join(storageRoot, 'test.sqlite');
  const database = createDatabaseManager({
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: databaseFile,
        pool: { min: 1, max: 1 },
      },
    },
  });
  await filesMigration.up(createMigrationContext(database.connection()));
  await database.builder().createCollection('purchaseOrders', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('title', { length: 255 }).notNull();
  });
  await createRelationCollection(database, 'purchaseOrderAttachments', true);
  await createRelationCollection(
    database,
    'purchaseOrderAttachmentsWithoutUnique',
    false,
  );
  await database
    .query()
    .insertInto('purchaseOrders')
    .values([
      { id: ORDER_ONE, title: 'Order One' },
      { id: ORDER_TWO, title: 'Order Two' },
    ])
    .execute();

  let currentTime = new Date('2026-08-24T00:00:00.000Z');
  const runtime = createOpaqueFilesRuntime(
    {
      database,
      config: resolveFilesConfig({
        appStorageRoot: storageRoot,
        config: {
          upload: { expiresInSeconds: 300 },
          publicAccess: { enabled: options.publicAccess ?? false },
        },
      }),
      audience: 'relation-route-test',
      secret: 'relation-route-test-secret-at-least-32-characters',
    },
    { clock: () => currentTime },
  );
  const service = createFileService({ runtime });
  const route = service.createFileRoute({
    binding: {
      type: 'relation',
      collection: 'purchaseOrderAttachments',
      recordParam: 'orderId',
      recordField: 'purchaseOrderId',
      maxFiles: options.maxFiles ?? 2,
    },
    publicAccess: options.publicAccess,
    constraints: {
      maxBytes: 1024,
      allowedExtensions: ['.txt'],
      allowedContentTypes: ['text/plain'],
    },
    authorize() {},
  });
  const app = new Hono();
  app.route('/api/files', getFilesRuntimeDataPlane(runtime).createRoute());
  app.route('/orders/:orderId/files', route);
  const fixture: RelationFixture = {
    app,
    database,
    runtime,
    storageRoot,
    advance(milliseconds) {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
  fixtures.push(fixture);
  return fixture;
}

async function createRelationCollection(
  database: DatabaseManager,
  name: string,
  uniqueSlots: boolean,
): Promise<void> {
  await database.builder().createCollection(name, (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('purchaseOrderId', { length: 64 }).notNull();
    collection.string('fileId', { length: 64 }).notNull();
    collection.integer('slot').notNull();
    collection.datetime('reservationExpiresAt').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    if (uniqueSlots) {
      collection.unique(['purchaseOrderId', 'slot'], {
        name: `uq_${name}_record_slot`,
      });
    }
    collection.foreignKey('fileId', {
      references: { collection: 'files', fields: ['id'] },
      onDelete: 'restrict',
    });
    collection.foreignKey('purchaseOrderId', {
      references: { collection: 'purchaseOrders', fields: ['id'] },
      onDelete: 'cascade',
    });
  });
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

async function createReadyUpload(
  fixture: RelationFixture,
  orderId: string,
  name: string,
  size: number,
): Promise<CreateBusinessFileResponse> {
  const upload = await createUpload(fixture, orderId, name, size);
  await uploadBytes(fixture, upload, 'x'.repeat(size));
  return upload;
}

async function uploadBytes(
  fixture: RelationFixture,
  upload: CreateBusinessFileResponse,
  body: string,
): Promise<void> {
  const response = await fixture.app.request(upload.uploadPlan.upload.url, {
    method: 'PUT',
    headers: {
      ...upload.uploadPlan.upload.headers,
      'content-length': String(Buffer.byteLength(body)),
    },
    body,
  });
  expect(response.status).toBe(200);
}

function commitUpload(
  fixture: RelationFixture,
  orderId: string,
  upload: CreateBusinessFileResponse,
): Promise<Response> {
  return Promise.resolve(
    fixture.app.request(
      `/orders/${orderId}/files/${upload.uploadPlan.fileId}/commit`,
      jsonRequest('POST', { bindingCredential: upload.bindingCredential }),
    ),
  );
}

async function relationRows(
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

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Expected a value.');
  }
  return value;
}
