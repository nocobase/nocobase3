import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/app-database';
import type { CreateBusinessFileResponse } from '@nocobase/app-plugin-files/protocol';
import {
  createFileService,
  resolveFilesConfig,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import cleanupMigration from '../database/migrations/202608261000_files_add_temporary_cleanup.js';
import bootstrapFilesPlugin, {
  filesCleanupScheduleId,
} from '../server/bootstrap.js';
import { FilesCleanup } from '../server/internal/cleanup.js';
import CleanupExpiredUploadsJob from '../server/internal/jobs/cleanup-expired-uploads.js';
import type { FileRecord } from '../server/internal/model.js';
import {
  type CreateRelationBindingRepositoryOptions,
  RelationBindingRepository,
} from '../server/internal/relation-repository.js';
import {
  createFilesRepository,
  FilesRepository,
  type TemporaryCleanupCandidate,
} from '../server/internal/repository.js';
import {
  createOpaqueFilesRuntime,
  getFilesRuntimeCleanup,
  getFilesRuntimeKernel,
} from '../server/internal/runtime.js';
import { runCleanupExpiredUploads } from '../server/internal/jobs/cleanup-expired-uploads.js';
import { FakeS3Disk } from './support/fake-s3-disk.js';

const START = new Date('2026-08-26T00:00:00.000Z');
const EXPIRED = new Date('2026-08-26T00:15:01.000Z');
const EMPLOYEE_ID = 'employee-1';
const ORDER_ID = 'order-1';

interface CleanupFixture {
  app: Hono;
  database: DatabaseManager;
  provider: FakeS3Disk;
  runtime: FilesRuntime;
  storageRoot: string;
  setElapsedSequence(values: readonly number[]): void;
  setNow(value: Date): void;
}

interface RelationRow {
  id: string;
  purchaseOrderId: string;
  fileId: string;
  slot: number;
  reservationExpiresAt: Date | string | null;
}

const fixtures: CleanupFixture[] = [];

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(async (fixture) => {
      await fixture.runtime.dispose();
      await fixture.database.destroy();
      await rm(fixture.storageRoot, { recursive: true, force: true });
    }),
  );
});

describe('expired upload cleanup', () => {
  it('cleans an expired field upload without changing the field binding', async () => {
    const fixture = await createFixture();
    const upload = await createFieldUpload(fixture, 'expired-field.txt');
    const candidateKey = fixture.provider.putUpload(upload.plan, {
      contentLength: 1,
      contentType: 'text/plain',
    });
    fixture.setNow(EXPIRED);

    await expect(
      getFilesRuntimeCleanup(fixture.runtime).run(),
    ).resolves.toEqual({
      selected: 1,
      attempted: 1,
      cleaned: 1,
      releasedReservations: 0,
      skipped: 0,
      deleteFailures: 0,
      timedOut: false,
    });

    expect(await fileRecord(fixture, upload.file.id)).toMatchObject({
      status: 'failed',
      temporaryCleanupCompletedAt: expect.any(Date),
    });
    expect(fixture.provider.has(candidateKey)).toBe(false);
    await expect(employeeAvatarId(fixture)).resolves.toBeNull();
  });

  it('releases an expired relation reservation and makes its slot reusable', async () => {
    const fixture = await createFixture();
    const upload = await createRelationUpload(fixture, 'expired-relation.txt');
    const candidateKey = fixture.provider.putUpload(upload.plan, {
      contentLength: 1,
      contentType: 'text/plain',
    });
    expect((await relationRows(fixture))[0]).toMatchObject({ slot: 1 });
    fixture.setNow(EXPIRED);

    const result = await getFilesRuntimeCleanup(fixture.runtime).run();

    expect(result).toMatchObject({
      cleaned: 1,
      releasedReservations: 1,
      deleteFailures: 0,
    });
    expect(await relationRows(fixture)).toEqual([]);
    expect(fixture.provider.has(candidateKey)).toBe(false);
    expect(await fileRecord(fixture, upload.file.id)).toMatchObject({
      status: 'failed',
    });

    const replacement = await createRelationUpload(fixture, 'replacement.txt');
    expect((await relationRows(fixture))[0]).toMatchObject({
      fileId: replacement.file.id,
      slot: 1,
    });
  });

  it('leaves active reservations and ready files untouched', async () => {
    const fixture = await createFixture();
    const ready = await createFieldUpload(fixture, 'ready.txt');
    fixture.provider.putUpload(
      ready.plan,
      { contentLength: 1, contentType: 'text/plain' },
      'r',
    );
    expect(
      (await fixture.app.request(ready.plan.complete.url, { method: 'POST' }))
        .status,
    ).toBe(200);
    const readyRecord = await fileRecord(fixture, ready.file.id);
    if (!readyRecord) {
      throw new Error('Expected a ready file record.');
    }
    const readyKey = requireStorageKey(readyRecord.storageKey);

    const expired = await createPendingObject(fixture, 'expired.txt');
    fixture.setNow(EXPIRED);
    const active = await createRelationUpload(fixture, 'active.txt');
    const activeKey = fixture.provider.putUpload(active.plan, {
      contentLength: 1,
      contentType: 'text/plain',
    });

    const result = await getFilesRuntimeCleanup(fixture.runtime).run();

    expect(result.cleaned).toBe(1);
    expect(await fileRecord(fixture, expired.fileId)).toMatchObject({
      status: 'failed',
    });
    expect(await fileRecord(fixture, ready.file.id)).toMatchObject({
      status: 'ready',
      storageKey: readyKey,
    });
    expect(fixture.provider.has(readyKey)).toBe(true);
    expect(await fileRecord(fixture, active.file.id)).toMatchObject({
      status: 'pending',
    });
    expect(fixture.provider.has(activeKey)).toBe(true);
    expect((await relationRows(fixture))[0]).toMatchObject({
      fileId: active.file.id,
      reservationExpiresAt: expect.anything(),
    });
  });

  it('uses CAS to preserve a reservation renewed after selection', async () => {
    const fixture = await createFixture();
    const pending = await createPendingObject(fixture, 'renewed.txt');
    await insertReservation(fixture, pending.fileId, START);
    fixture.setNow(EXPIRED);
    const renewedUntil = new Date('2026-08-26T01:00:00.000Z');
    const relationRepository = new RenewingRelationRepository(
      relationRepositoryOptions(fixture.database),
      fixture.database,
      renewedUntil,
    );
    const cleanup = new FilesCleanup({
      repository: createFilesRepository(fixture.database),
      kernel: getFilesRuntimeKernel(fixture.runtime),
      relationTargets: new Set([{ repository: relationRepository }]),
      clock: () => EXPIRED,
      elapsed: () => 0,
    });

    await expect(cleanup.run()).resolves.toMatchObject({
      attempted: 1,
      cleaned: 0,
      releasedReservations: 0,
      skipped: 1,
    });

    expect(await fileRecord(fixture, pending.fileId)).toMatchObject({
      status: 'pending',
    });
    const renewed = (await relationRows(fixture))[0];
    expect(renewed).toMatchObject({ fileId: pending.fileId });
    expect(readDateValue(renewed?.reservationExpiresAt).getTime()).toBe(
      renewedUntil.getTime(),
    );
    expect(fixture.provider.has(pending.candidateKey)).toBe(true);
  });

  it('uses CAS to preserve a file that became ready after selection', async () => {
    const fixture = await createFixture();
    const pending = await createPendingObject(fixture, 'ready-race.txt');
    fixture.setNow(EXPIRED);
    const readyKey = `ready/${pending.fileId}/cleanup-race`;
    const repository = new ReadyAfterSelectionRepository(
      fixture.database,
      fixture.provider,
      readyKey,
    );
    const cleanup = new FilesCleanup({
      repository,
      kernel: getFilesRuntimeKernel(fixture.runtime),
      relationTargets: new Set(),
      clock: () => EXPIRED,
      elapsed: () => 0,
    });

    await expect(cleanup.run()).resolves.toMatchObject({
      attempted: 1,
      cleaned: 0,
      skipped: 1,
    });

    expect(await fileRecord(fixture, pending.fileId)).toMatchObject({
      status: 'ready',
      storageKey: readyKey,
      temporaryCleanupCompletedAt: null,
    });
    expect(fixture.provider.has(readyKey)).toBe(true);
  });

  it('is idempotent and retries object deletion after a provider failure', async () => {
    const fixture = await createFixture();
    const pending = await createPendingObject(fixture, 'retry-delete.txt');
    fixture.setNow(EXPIRED);
    fixture.provider.failNextDelete();

    await expect(
      getFilesRuntimeCleanup(fixture.runtime).run(),
    ).resolves.toMatchObject({
      selected: 1,
      cleaned: 0,
      deleteFailures: 1,
    });
    expect(await fileRecord(fixture, pending.fileId)).toMatchObject({
      status: 'failed',
      temporaryCleanupCompletedAt: null,
    });
    expect(fixture.provider.has(pending.candidateKey)).toBe(true);

    await expect(
      getFilesRuntimeCleanup(fixture.runtime).run(),
    ).resolves.toMatchObject({
      selected: 1,
      cleaned: 1,
      deleteFailures: 0,
    });
    expect(fixture.provider.has(pending.candidateKey)).toBe(false);
    expect(await fileRecord(fixture, pending.fileId)).toMatchObject({
      temporaryCleanupCompletedAt: expect.any(Date),
    });
    await expect(
      getFilesRuntimeCleanup(fixture.runtime).run(),
    ).resolves.toMatchObject({
      selected: 0,
      attempted: 0,
      cleaned: 0,
    });
  });

  it('stops at the batch limit and deterministic time boundary', async () => {
    const fixture = await createFixture();
    await Promise.all([
      createPendingObject(fixture, 'one.txt'),
      createPendingObject(fixture, 'two.txt'),
      createPendingObject(fixture, 'three.txt'),
      createPendingObject(fixture, 'four.txt'),
    ]);
    fixture.setNow(EXPIRED);

    const batchResult = await getFilesRuntimeCleanup(fixture.runtime).run({
      batchSize: 2,
      timeBudgetMs: 100,
    });
    expect(batchResult).toMatchObject({
      selected: 2,
      attempted: 2,
      cleaned: 2,
      timedOut: false,
    });
    await expect(countFilesByStatus(fixture, 'pending')).resolves.toBe(2);

    fixture.setElapsedSequence([0, 0, 10]);
    const timedResult = await getFilesRuntimeCleanup(fixture.runtime).run({
      batchSize: 10,
      timeBudgetMs: 5,
    });
    expect(timedResult).toMatchObject({
      selected: 2,
      attempted: 1,
      cleaned: 1,
      timedOut: true,
    });
    await expect(countFilesByStatus(fixture, 'pending')).resolves.toBe(1);
  });

  it('runs the Job cleanup against the supplied runtime and storage instance', async () => {
    const fixture = await createFixture();
    const pending = await createPendingObject(fixture, 'job-runtime.txt');
    fixture.setNow(EXPIRED);

    const result = await runCleanupExpiredUploads(
      {
        filesRuntime: fixture.runtime,
        logger: { info() {}, warn() {} },
      },
      { batchSize: 10, timeBudgetMs: 100 },
    );

    expect(result.cleaned).toBe(1);
    expect(fixture.provider.has(pending.candidateKey)).toBe(false);
    expect(await fileRecord(fixture, pending.fileId)).toMatchObject({
      status: 'failed',
      temporaryCleanupCompletedAt: expect.any(Date),
    });
  });

  it('registers one Queue schedule and stops its worker through the plugin lifecycle', async () => {
    const fixture = await createFixture();
    let stopWorker: (() => void) | undefined;
    const workerStopped = new Promise<void>((resolve) => {
      stopWorker = resolve;
    });
    const worker = {
      id: 'cleanup-worker',
      start: vi.fn(async (): Promise<void> => workerStopped),
      stop: vi.fn(async (): Promise<void> => stopWorker?.()),
    };
    const queueManager = {
      init: vi.fn(async (): Promise<void> => undefined),
      registerJob: vi.fn(),
      createWorker: vi.fn(() => worker),
    } as unknown as NocoBaseQueueManager;
    const scheduleBuilder = {
      id: vi.fn(),
      every: vi.fn(),
      run: vi.fn(async () => ({ scheduleId: 'cleanup-schedule' })),
    };
    scheduleBuilder.id.mockReturnValue(scheduleBuilder);
    scheduleBuilder.every.mockReturnValue(scheduleBuilder);
    const schedule = vi
      .spyOn(CleanupExpiredUploadsJob, 'schedule')
      .mockReturnValue(scheduleBuilder as never);
    const errors: Array<Record<string, unknown>> = [];
    let dispose: (() => void | Promise<void>) | undefined;

    bootstrapFilesPlugin({
      config: undefined,
      deps: {
        filesRuntime: fixture.runtime,
        queueManager,
        logging: {
          getLogger() {
            return {
              error(data: Record<string, unknown>): void {
                errors.push(data);
              },
            };
          },
        },
      },
      services: undefined,
      lifecycle: {
        registerDisposer(name, registered): void {
          expect(name).toBe('cleanup-worker');
          dispose = registered;
        },
      },
    });

    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
    expect(queueManager.registerJob).toHaveBeenCalledWith(
      CleanupExpiredUploadsJob,
    );
    expect(schedule).toHaveBeenCalledWith({
      batchSize: 100,
      timeBudgetMs: 5_000,
    });
    expect(scheduleBuilder.id).toHaveBeenCalledWith(
      filesCleanupScheduleId('cleanup-test'),
    );
    expect(scheduleBuilder.every).toHaveBeenCalledWith('5m');
    expect(scheduleBuilder.run).toHaveBeenCalledOnce();
    expect(errors).toEqual([]);

    await dispose?.();
    expect(worker.stop).toHaveBeenCalledOnce();
    expect(errors).toEqual([]);
  });
});

async function createFixture(): Promise<CleanupFixture> {
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
  const context = createMigrationContext(database.connection());
  await filesMigration.up(context);
  await cleanupMigration.up(context);
  await createBusinessSchema(database);
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'files-cleanup-'));
  const provider = new FakeS3Disk();
  let now = new Date(START.getTime());
  let elapsedSequence: number[] = [];
  const runtime = createOpaqueFilesRuntime(
    {
      database,
      config: resolveFilesConfig({
        appStorageRoot: storageRoot,
        config: { storage: { driver: 's3', bucket: 'managed-files' } },
      }),
      audience: 'cleanup-test',
      secret: 'cleanup-test-secret-at-least-32-characters',
    },
    {
      disk: provider,
      clock: () => new Date(now.getTime()),
      elapsed: () => elapsedSequence.shift() ?? 0,
    },
  );
  const service = createFileService({ runtime });
  const app = new Hono();
  app.route(
    '/employees/:employeeId/avatar',
    service.createFileRoute({
      binding: {
        type: 'field',
        collection: 'employees',
        recordParam: 'employeeId',
        fileField: 'avatarId',
      },
      authorize() {},
    }),
  );
  app.route(
    '/orders/:orderId/files',
    service.createFileRoute({
      binding: {
        type: 'relation',
        collection: 'purchaseOrderAttachments',
        recordParam: 'orderId',
        recordField: 'purchaseOrderId',
        maxFiles: 2,
      },
      authorize() {},
    }),
  );
  const fixture: CleanupFixture = {
    app,
    database,
    provider,
    runtime,
    storageRoot,
    setElapsedSequence(values): void {
      elapsedSequence = [...values];
    },
    setNow(value): void {
      now = new Date(value.getTime());
    },
  };
  fixtures.push(fixture);
  return fixture;
}

async function createBusinessSchema(database: DatabaseManager): Promise<void> {
  await database.builder().createCollection('employees', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('avatarId', { length: 64 }).nullable();
    collection.foreignKey('avatarId', {
      references: { collection: 'files', fields: ['id'] },
      onDelete: 'restrict',
    });
  });
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
    .insertInto('employees')
    .values({ id: EMPLOYEE_ID, avatarId: null })
    .execute();
  await database
    .query()
    .insertInto('purchaseOrders')
    .values({ id: ORDER_ID })
    .execute();
}

function createFieldUpload(
  fixture: CleanupFixture,
  name: string,
): Promise<CreateBusinessFileResponse> {
  return createUpload(fixture, `/employees/${EMPLOYEE_ID}/avatar`, name);
}

function createRelationUpload(
  fixture: CleanupFixture,
  name: string,
): Promise<CreateBusinessFileResponse> {
  return createUpload(fixture, `/orders/${ORDER_ID}/files`, name);
}

async function createUpload(
  fixture: CleanupFixture,
  url: string,
  name: string,
): Promise<CreateBusinessFileResponse> {
  const response = await fixture.app.request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, size: 1, contentType: 'text/plain' }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as CreateBusinessFileResponse;
}

async function createPendingObject(
  fixture: CleanupFixture,
  name: string,
): Promise<{ fileId: string; candidateKey: string }> {
  const pending = await getFilesRuntimeKernel(fixture.runtime).createPending({
    name,
  });
  fixture.provider.seed(pending.candidateKey, {
    contentLength: 1,
    contentType: 'text/plain',
  });
  return { fileId: pending.fileId, candidateKey: pending.candidateKey };
}

function fileRecord(
  fixture: CleanupFixture,
  fileId: string,
): Promise<FileRecord | undefined> {
  return getFilesRuntimeKernel(fixture.runtime).getRecord(fileId);
}

async function employeeAvatarId(
  fixture: CleanupFixture,
): Promise<string | null> {
  const row = await fixture.database
    .query()
    .selectFrom('employees')
    .select('avatarId')
    .where('id', '=', EMPLOYEE_ID)
    .executeTakeFirst<Record<string, unknown>>();
  return typeof row?.avatarId === 'string' ? row.avatarId : null;
}

function relationRows(fixture: CleanupFixture): Promise<RelationRow[]> {
  return fixture.database
    .query()
    .selectFrom('purchaseOrderAttachments')
    .selectAll()
    .where('purchaseOrderId', '=', ORDER_ID)
    .orderBy('slot', 'asc')
    .execute<RelationRow>();
}

function countFilesByStatus(
  fixture: CleanupFixture,
  status: 'pending' | 'ready' | 'failed',
): Promise<number> {
  return fixture.database
    .query()
    .selectFrom('files')
    .select('id')
    .where('status', '=', status)
    .execute<Record<string, unknown>>()
    .then((rows) => rows.length);
}

async function insertReservation(
  fixture: CleanupFixture,
  fileId: string,
  now: Date,
): Promise<void> {
  await fixture.database
    .query()
    .insertInto('purchaseOrderAttachments')
    .values({
      id: `reservation-${fileId.slice(0, 32)}`,
      purchaseOrderId: ORDER_ID,
      fileId,
      slot: 1,
      reservationExpiresAt: new Date(now.getTime() + 15 * 60 * 1_000),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

function relationRepositoryOptions(
  database: DatabaseManager,
): CreateRelationBindingRepositoryOptions {
  return {
    database,
    collection: 'purchaseOrderAttachments',
    recordField: 'purchaseOrderId',
  };
}

function requireStorageKey(value: string | null): string {
  if (value === null) {
    throw new Error('Expected a storage key.');
  }
  return value;
}

function readDateValue(value: Date | string | number | null | undefined): Date {
  const date = value instanceof Date ? value : new Date(value ?? Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Expected a date value.');
  }
  return date;
}

class RenewingRelationRepository extends RelationBindingRepository {
  readonly #database: DatabaseManager;
  readonly #renewedUntil: Date;

  constructor(
    options: CreateRelationBindingRepositoryOptions,
    database: DatabaseManager,
    renewedUntil: Date,
  ) {
    super(options);
    this.#database = database;
    this.#renewedUntil = renewedUntil;
  }

  override async listExpiredReservations(
    cutoff: Date,
    limit: number,
  ): ReturnType<RelationBindingRepository['listExpiredReservations']> {
    const reservations = await super.listExpiredReservations(cutoff, limit);
    const first = reservations[0];
    if (first) {
      await this.#database
        .query()
        .updateTable('purchaseOrderAttachments')
        .set({ reservationExpiresAt: this.#renewedUntil })
        .where('id', '=', first.id)
        .execute();
    }
    return reservations;
  }
}

class ReadyAfterSelectionRepository extends FilesRepository {
  readonly #database: DatabaseManager;
  readonly #provider: FakeS3Disk;
  readonly #readyKey: string;

  constructor(
    database: DatabaseManager,
    provider: FakeS3Disk,
    readyKey: string,
  ) {
    super(database);
    this.#database = database;
    this.#provider = provider;
    this.#readyKey = readyKey;
  }

  override async listTemporaryCleanupCandidates(
    cutoff: Date,
    limit: number,
  ): Promise<TemporaryCleanupCandidate[]> {
    const candidates = await super.listTemporaryCleanupCandidates(
      cutoff,
      limit,
    );
    const first = candidates[0];
    if (first) {
      this.#provider.seed(this.#readyKey, {
        contentLength: 1,
        contentType: 'text/plain',
      });
      await this.#database
        .query()
        .updateTable('files')
        .set({
          status: 'ready',
          storageKey: this.#readyKey,
          size: 1,
          contentType: 'text/plain',
          updatedAt: cutoff,
        })
        .where('id', '=', first.id)
        .where('status', '=', 'pending')
        .execute();
    }
    return candidates;
  }
}
