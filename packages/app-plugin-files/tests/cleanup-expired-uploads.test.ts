import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/app-database';
import type { CreateBusinessFileResponse } from '@nocobase/app-plugin-files/protocol';
import {
  createFileService,
  resolveFilesConfig,
} from '@nocobase/app-plugin-files/server';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import cleanupMigration from '../database/migrations/202608261000_files_add_temporary_cleanup.js';
import bootstrapFilesPlugin, {
  filesCleanupScheduleId,
} from '../server/bootstrap.js';
import {
  FilesCleanup,
  type FilesCleanupOptions,
  type FilesCleanupResult,
} from '../server/internal/cleanup.js';
import CleanupExpiredUploadsJob, {
  runCleanupExpiredUploads,
} from '../server/internal/jobs/cleanup-expired-uploads.js';
import { RelationBindingRepository } from '../server/internal/relation-repository.js';
import {
  createFilesRepository,
  type FilesRepository,
} from '../server/internal/repository.js';
import {
  createOpaqueFilesRuntime,
  getFilesRuntimeCleanup,
  getFilesRuntimeKernel,
} from '../server/internal/runtime.js';
import { FakeS3Disk } from './support/fake-s3-disk.js';

const START = new Date('2026-08-26T00:00:00.000Z');
const EXPIRED = new Date('2026-08-26T00:15:01.000Z');
const EMPLOYEE_ID = 'employee-1';
const ORDER_ID = 'order-1';
const TEXT_OBJECT = { contentLength: 1, contentType: 'text/plain' } as const;

type CleanupFixture = Awaited<ReturnType<typeof createFixture>>;

interface RelationRow {
  id: string;
  purchaseOrderId: string;
  fileId: string;
  slot: number;
  reservationExpiresAt: Date | string | null;
}

let fixture: CleanupFixture;

beforeEach(async () => {
  fixture = await createFixture();
});

afterEach(async () => {
  await fixture.dispose();
});

describe('expired upload cleanup', () => {
  it('cleans an expired field upload without changing the field binding', async () => {
    const upload = await fixture.fieldUpload('expired-field.txt');
    const candidateKey = fixture.putUpload(upload);
    fixture.setNow(EXPIRED);

    await expect(fixture.cleanup.run()).resolves.toEqual({
      selected: 1,
      attempted: 1,
      cleaned: 1,
      releasedReservations: 0,
      skipped: 0,
      deleteFailures: 0,
      timedOut: false,
    });
    expect(await fixture.record(upload.file.id)).toMatchObject({
      status: 'failed',
      temporaryCleanupCompletedAt: expect.any(Date),
    });
    expect(fixture.provider.has(candidateKey)).toBe(false);
    await expect(fixture.avatarId()).resolves.toBeNull();
  });

  it('releases an expired relation reservation and makes its slot reusable', async () => {
    const upload = await fixture.relationUpload('expired-relation.txt');
    const candidateKey = fixture.putUpload(upload);
    expect((await fixture.relations())[0]).toMatchObject({ slot: 1 });
    fixture.setNow(EXPIRED);

    await expectCleanup({
      cleaned: 1,
      releasedReservations: 1,
      deleteFailures: 0,
    });
    expect(await fixture.relations()).toEqual([]);
    expect(fixture.provider.has(candidateKey)).toBe(false);
    expect(await fixture.record(upload.file.id)).toMatchObject({
      status: 'failed',
    });

    const replacement = await fixture.relationUpload('replacement.txt');
    expect((await fixture.relations())[0]).toMatchObject({
      fileId: replacement.file.id,
      slot: 1,
    });
  });

  it('leaves active reservations and ready files untouched', async () => {
    const ready = await fixture.fieldUpload('ready.txt');
    fixture.putUpload(ready, 'r');
    expect(
      (await fixture.app.request(ready.plan.complete.url, { method: 'POST' }))
        .status,
    ).toBe(200);
    const readyKey = requireStorageKey(
      (await fixture.record(ready.file.id))?.storageKey,
    );

    const expired = await fixture.pending('expired.txt');
    fixture.setNow(EXPIRED);
    const active = await fixture.relationUpload('active.txt');
    const activeKey = fixture.putUpload(active);

    await expectCleanup({ cleaned: 1 });
    expect(await fixture.record(expired.fileId)).toMatchObject({
      status: 'failed',
    });
    expect(await fixture.record(ready.file.id)).toMatchObject({
      status: 'ready',
      storageKey: readyKey,
    });
    expect(fixture.provider.has(readyKey)).toBe(true);
    expect(await fixture.record(active.file.id)).toMatchObject({
      status: 'pending',
    });
    expect(fixture.provider.has(activeKey)).toBe(true);
    expect((await fixture.relations())[0]).toMatchObject({
      fileId: active.file.id,
      reservationExpiresAt: expect.anything(),
    });
  });

  it('uses CAS to preserve a reservation renewed after selection', async () => {
    const pending = await fixture.pending('renewed.txt');
    await fixture.reserve(pending.fileId, START);
    fixture.setNow(EXPIRED);
    const renewedUntil = new Date('2026-08-26T01:00:00.000Z');
    const relationRepository = new RelationBindingRepository({
      database: fixture.database,
      collection: 'purchaseOrderAttachments',
      recordField: 'purchaseOrderId',
    });
    renewFirstReservationAfterSelection(
      relationRepository,
      fixture.database,
      renewedUntil,
    );

    await expect(
      createCleanup(fixture, { relationRepository }).run(),
    ).resolves.toMatchObject({
      attempted: 1,
      cleaned: 0,
      releasedReservations: 0,
      skipped: 1,
    });
    expect(await fixture.record(pending.fileId)).toMatchObject({
      status: 'pending',
    });
    const renewed = (await fixture.relations())[0];
    expect(renewed).toMatchObject({ fileId: pending.fileId });
    expect(
      new Date(renewed?.reservationExpiresAt ?? Number.NaN).getTime(),
    ).toBe(renewedUntil.getTime());
    expect(fixture.provider.has(pending.candidateKey)).toBe(true);
  });

  it('uses CAS to preserve a file that became ready after selection', async () => {
    const pending = await fixture.pending('ready-race.txt');
    fixture.setNow(EXPIRED);
    const readyKey = `ready/${pending.fileId}/cleanup-race`;
    const repository = createFilesRepository(fixture.database);
    markFirstCandidateReadyAfterSelection(repository, fixture, readyKey);

    await expect(
      createCleanup(fixture, { repository }).run(),
    ).resolves.toMatchObject({ attempted: 1, cleaned: 0, skipped: 1 });
    expect(await fixture.record(pending.fileId)).toMatchObject({
      status: 'ready',
      storageKey: readyKey,
      temporaryCleanupCompletedAt: null,
    });
    expect(fixture.provider.has(readyKey)).toBe(true);
  });

  it('is idempotent and retries object deletion after a provider failure', async () => {
    const pending = await fixture.pending('retry-delete.txt');
    fixture.setNow(EXPIRED);
    fixture.provider.failNextDelete();

    await expectCleanup({
      selected: 1,
      cleaned: 0,
      deleteFailures: 1,
    });
    expect(await fixture.record(pending.fileId)).toMatchObject({
      status: 'failed',
      temporaryCleanupCompletedAt: null,
    });
    expect(fixture.provider.has(pending.candidateKey)).toBe(true);

    await expectCleanup({
      selected: 1,
      cleaned: 1,
      deleteFailures: 0,
    });
    expect(fixture.provider.has(pending.candidateKey)).toBe(false);
    expect(await fixture.record(pending.fileId)).toMatchObject({
      temporaryCleanupCompletedAt: expect.any(Date),
    });
    await expectCleanup({
      selected: 0,
      attempted: 0,
      cleaned: 0,
    });
  });

  it('stops at the batch limit and deterministic time boundary', async () => {
    await Promise.all(
      ['one.txt', 'two.txt', 'three.txt', 'four.txt'].map((name) =>
        fixture.pending(name),
      ),
    );
    fixture.setNow(EXPIRED);

    await expectCleanup(
      {
        selected: 2,
        attempted: 2,
        cleaned: 2,
        timedOut: false,
      },
      { batchSize: 2, timeBudgetMs: 100 },
    );
    await expect(fixture.countByStatus('pending')).resolves.toBe(2);

    fixture.setElapsedSequence([0, 0, 10]);
    await expectCleanup(
      {
        selected: 2,
        attempted: 1,
        cleaned: 1,
        timedOut: true,
      },
      { batchSize: 10, timeBudgetMs: 5 },
    );
    await expect(fixture.countByStatus('pending')).resolves.toBe(1);
  });

  it('runs the Job cleanup against the supplied runtime and storage instance', async () => {
    const pending = await fixture.pending('job-runtime.txt');
    fixture.setNow(EXPIRED);

    await expect(
      runCleanupExpiredUploads(
        {
          filesRuntime: fixture.runtime,
          logger: { info() {}, warn() {} },
        },
        { batchSize: 10, timeBudgetMs: 100 },
      ),
    ).resolves.toMatchObject({ cleaned: 1 });
    expect(fixture.provider.has(pending.candidateKey)).toBe(false);
    expect(await fixture.record(pending.fileId)).toMatchObject({
      status: 'failed',
      temporaryCleanupCompletedAt: expect.any(Date),
    });
  });

  it('registers one Queue schedule and stops its worker through the plugin lifecycle', async () => {
    let stopWorker!: () => void;
    const workerStopped = new Promise<void>((resolve) => {
      stopWorker = resolve;
    });
    const worker = {
      id: 'cleanup-worker',
      start: vi.fn(async (): Promise<void> => workerStopped),
      stop: vi.fn(async (): Promise<void> => stopWorker()),
    };
    const queueManager = {
      init: vi.fn(async (): Promise<void> => undefined),
      registerJob: vi.fn(),
      createWorker: vi.fn(() => worker),
    } as unknown as NocoBaseQueueManager;
    const scheduleBuilder = {
      id: vi.fn().mockReturnThis(),
      every: vi.fn().mockReturnThis(),
      run: vi.fn(async () => ({ scheduleId: 'cleanup-schedule' })),
    };
    const schedule = vi
      .spyOn(CleanupExpiredUploadsJob, 'schedule')
      .mockReturnValue(scheduleBuilder as never);
    const logError = vi.fn();
    let dispose: (() => void | Promise<void>) | undefined;

    bootstrapFilesPlugin({
      config: undefined,
      deps: {
        filesRuntime: fixture.runtime,
        queueManager,
        logging: {
          getLogger: () => ({ error: logError }),
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
    expect(logError).not.toHaveBeenCalled();

    await dispose?.();
    expect(worker.stop).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalled();
  });
});

async function createFixture() {
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
  const migrations = createMigrationContext(database.connection());
  await filesMigration.up(migrations);
  await cleanupMigration.up(migrations);
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
  const kernel = getFilesRuntimeKernel(runtime);
  const app = new Hono();
  const service = createFileService({ runtime });
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

  async function upload(
    url: string,
    name: string,
  ): Promise<CreateBusinessFileResponse> {
    const response = await app.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, size: 1, contentType: 'text/plain' }),
    });
    expect(response.status).toBe(201);
    return (await response.json()) as CreateBusinessFileResponse;
  }

  return {
    app,
    database,
    provider,
    runtime,
    kernel,
    cleanup: getFilesRuntimeCleanup(runtime),
    setNow(value: Date): void {
      now = new Date(value.getTime());
    },
    setElapsedSequence(values: readonly number[]): void {
      elapsedSequence = [...values];
    },
    fieldUpload(name: string): Promise<CreateBusinessFileResponse> {
      return upload(`/employees/${EMPLOYEE_ID}/avatar`, name);
    },
    relationUpload(name: string): Promise<CreateBusinessFileResponse> {
      return upload(`/orders/${ORDER_ID}/files`, name);
    },
    putUpload(
      uploadResponse: CreateBusinessFileResponse,
      contents = '',
    ): string {
      return provider.putUpload(uploadResponse.plan, TEXT_OBJECT, contents);
    },
    async pending(name: string) {
      const pending = await kernel.createPending({ name });
      provider.seed(pending.candidateKey, TEXT_OBJECT);
      return { fileId: pending.fileId, candidateKey: pending.candidateKey };
    },
    record(fileId: string) {
      return kernel.getRecord(fileId);
    },
    async avatarId(): Promise<string | null> {
      const row = await database
        .query()
        .selectFrom('employees')
        .select('avatarId')
        .where('id', '=', EMPLOYEE_ID)
        .executeTakeFirst<Record<string, unknown>>();
      return typeof row?.avatarId === 'string' ? row.avatarId : null;
    },
    relations(): Promise<RelationRow[]> {
      return database
        .query()
        .selectFrom('purchaseOrderAttachments')
        .selectAll()
        .where('purchaseOrderId', '=', ORDER_ID)
        .orderBy('slot', 'asc')
        .execute<RelationRow>();
    },
    countByStatus(status: 'pending' | 'ready' | 'failed'): Promise<number> {
      return database
        .query()
        .selectFrom('files')
        .select('id')
        .where('status', '=', status)
        .execute<Record<string, unknown>>()
        .then((rows) => rows.length);
    },
    async reserve(fileId: string, at: Date): Promise<void> {
      await database
        .query()
        .insertInto('purchaseOrderAttachments')
        .values({
          id: `reservation-${fileId.slice(0, 32)}`,
          purchaseOrderId: ORDER_ID,
          fileId,
          slot: 1,
          reservationExpiresAt: new Date(at.getTime() + 15 * 60 * 1_000),
          createdAt: at,
          updatedAt: at,
        })
        .execute();
    },
    async dispose(): Promise<void> {
      await runtime.dispose();
      await database.destroy();
      await rm(storageRoot, { recursive: true, force: true });
    },
  };
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

function createCleanup(
  current: CleanupFixture,
  options: {
    repository?: FilesRepository;
    relationRepository?: RelationBindingRepository;
  },
): FilesCleanup {
  return new FilesCleanup({
    repository: options.repository ?? createFilesRepository(current.database),
    kernel: current.kernel,
    relationTargets: options.relationRepository
      ? new Set([{ repository: options.relationRepository }])
      : new Set(),
    clock: () => EXPIRED,
    elapsed: () => 0,
  });
}

function expectCleanup(
  expected: Partial<FilesCleanupResult>,
  options?: FilesCleanupOptions,
): Promise<void> {
  return expect(fixture.cleanup.run(options)).resolves.toMatchObject(expected);
}

function renewFirstReservationAfterSelection(
  repository: RelationBindingRepository,
  database: DatabaseManager,
  renewedUntil: Date,
): void {
  const listExpired = repository.listExpiredReservations.bind(repository);
  vi.spyOn(repository, 'listExpiredReservations').mockImplementation(
    async (cutoff, limit) => {
      const reservations = await listExpired(cutoff, limit);
      const first = reservations[0];
      if (first) {
        await database
          .query()
          .updateTable('purchaseOrderAttachments')
          .set({ reservationExpiresAt: renewedUntil })
          .where('id', '=', first.id)
          .execute();
      }
      return reservations;
    },
  );
}

function markFirstCandidateReadyAfterSelection(
  repository: FilesRepository,
  current: CleanupFixture,
  readyKey: string,
): void {
  const listCandidates =
    repository.listTemporaryCleanupCandidates.bind(repository);
  vi.spyOn(repository, 'listTemporaryCleanupCandidates').mockImplementation(
    async (cutoff, limit) => {
      const candidates = await listCandidates(cutoff, limit);
      const first = candidates[0];
      if (first) {
        current.provider.seed(readyKey, TEXT_OBJECT);
        await current.database
          .query()
          .updateTable('files')
          .set({
            status: 'ready',
            storageKey: readyKey,
            size: 1,
            contentType: 'text/plain',
            updatedAt: cutoff,
          })
          .where('id', '=', first.id)
          .where('status', '=', 'pending')
          .execute();
      }
      return candidates;
    },
  );
}

function requireStorageKey(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    throw new Error('Expected a storage key.');
  }
  return value;
}
