import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/database';
import type {
  CreateBusinessFileResponse,
  FileErrorResponse,
  FileUploadPlan,
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
  getFilesRuntimeKernel,
} from '../server/internal/runtime.js';
import type {
  S3Provider,
  SignedReadOptions,
  SignedUploadOptions,
  StorageObjectMetadata,
} from '../server/internal/storage/types.js';

const ORDER_ONE = 'order-1';
const ORDER_TWO = 'order-2';

interface RelationFixture {
  app: Hono;
  database: DatabaseManager;
  runtime: FilesRuntime;
  storageRoot: string;
  provider?: FakeS3Provider;
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
  it('registers the unified fileId-only route table', async () => {
    const fixture = await createFixture({ publicAccess: true });
    const child = createFileService({
      runtime: fixture.runtime,
    }).createFileRoute({
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
      ['PUT', '/:fileId/upload'],
      ['DELETE', '/:fileId/upload'],
      ['POST', '/:fileId/complete'],
      ['GET', '/:fileId/content'],
      ['HEAD', '/:fileId/content'],
      ['DELETE', '/:fileId'],
      ['POST', '/:fileId/public-access'],
      ['POST', '/:fileId/public-access/reset'],
      ['DELETE', '/:fileId/public-access'],
    ]);
    expect(
      child.routes.some(({ path: routePath }) =>
        routePath.includes('reference'),
      ),
    ).toBe(false);
  });

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

  it('replaces at full capacity while preserving the internal row and slot', async () => {
    const fixture = await createFixture({ maxFiles: 1 });
    const original = await uploadAndComplete(
      fixture,
      ORDER_ONE,
      'old.txt',
      'old',
    );
    const before = required((await relationRows(fixture, ORDER_ONE))[0]);

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
    const after = required((await relationRows(fixture, ORDER_ONE))[0]);
    expect(after).toMatchObject({
      id: before.id,
      slot: before.slot,
      fileId: replacement.file.id,
      reservationExpiresAt: null,
    });
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(original.file.id),
    ).toMatchObject({ status: 'ready' });
  });

  it('runs Provider PUT simulation then scoped S3 complete and binds', async () => {
    const provider = new FakeS3Provider();
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
  });

  it('resolves scoped complete/cancel races to failed plus released reservation', async () => {
    const provider = new FakeS3Provider();
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
});

interface CreateFixtureOptions {
  maxFiles?: number;
  publicAccess?: boolean;
  provider?: FakeS3Provider;
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
    options.provider ? { s3Provider: options.provider } : {},
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

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Expected a value.');
  }
  return value;
}

class FakeS3Provider implements S3Provider {
  readonly #objects = new Map<string, StorageObjectMetadata>();
  #copyPause: DeferredCopy | undefined;

  async createUploadUrl(
    key: string,
    _options: SignedUploadOptions,
  ): Promise<string> {
    return `https://upload.invalid/${encodeURIComponent(key)}`;
  }

  async headObject(key: string): Promise<StorageObjectMetadata> {
    const metadata = this.#objects.get(key);
    if (!metadata) {
      const error = new Error('missing object') as NodeJS.ErrnoException;
      error.code = 'NoSuchKey';
      throw error;
    }
    return { ...metadata };
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    if (this.#copyPause) {
      const pause = this.#copyPause;
      this.#copyPause = undefined;
      pause.markStarted();
      await pause.waitForRelease();
    }
    this.#objects.set(destinationKey, await this.headObject(sourceKey));
  }

  async createReadUrl(
    key: string,
    _options: SignedReadOptions,
  ): Promise<string> {
    await this.headObject(key);
    return `https://read.invalid/${encodeURIComponent(key)}?signature=secret`;
  }

  async deleteObject(key: string): Promise<void> {
    this.#objects.delete(key);
  }

  dispose(): void {}

  putUpload(plan: FileUploadPlan, metadata: StorageObjectMetadata): void {
    const key = decodeURIComponent(new URL(plan.upload.url).pathname.slice(1));
    this.#objects.set(key, { ...metadata });
  }

  keys(): string[] {
    return [...this.#objects.keys()].sort();
  }

  pauseNextCopy(): { started: Promise<void>; release(): void } {
    const pause = new DeferredCopy();
    this.#copyPause = pause;
    return {
      started: pause.started,
      release: () => pause.release(),
    };
  }
}

class DeferredCopy {
  readonly started: Promise<void>;
  readonly #released: Promise<void>;
  #markStarted!: () => void;
  #release!: () => void;

  constructor() {
    this.started = new Promise<void>((resolve) => {
      this.#markStarted = resolve;
    });
    this.#released = new Promise<void>((resolve) => {
      this.#release = resolve;
    });
  }

  markStarted(): void {
    this.#markStarted();
  }

  release(): void {
    this.#release();
  }

  async waitForRelease(): Promise<void> {
    await this.#released;
  }
}
