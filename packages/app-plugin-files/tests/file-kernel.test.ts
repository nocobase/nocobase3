import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/app-database';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import cleanupMigration from '../database/migrations/202608261000_files_add_temporary_cleanup.js';
import {
  createFileKernel,
  type FileKernel,
} from '../server/internal/kernel.js';
import {
  createFilesRepository,
  FilesRepository,
} from '../server/internal/repository.js';
import type { StorageObjectMetadata } from '../server/internal/storage/types.js';

describe('file metadata kernel', () => {
  let database: DatabaseManager;
  let knex: Knex;
  let repository: FilesRepository;
  let storage: FakeFilesStorage;
  let kernel: FileKernel;
  let now: Date;

  beforeEach(async () => {
    database = createDatabaseManager({
      default: 'sqlite',
      connections: {
        sqlite: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: ':memory:',
        },
      },
    });
    const connection = database.connection();
    knex = await connection.client<Knex>();
    await filesMigration.up(createMigrationContext(connection));
    await cleanupMigration.up(createMigrationContext(connection));
    repository = createFilesRepository(database);
    storage = new FakeFilesStorage();
    now = new Date('2026-08-24T00:00:00.000Z');
    kernel = createFileKernel({
      repository,
      storage,
      uploadExpiresInSeconds: 900,
      clock: () => now,
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates random pending identities and returns only safe StoredFile fields', async () => {
    const first = await kernel.createPending({ name: ' report.pdf ' });
    const second = await kernel.createPending({ name: 'report.pdf' });

    expect(first.file.id).toMatch(/^[a-f0-9]{64}$/);
    expect(second.file.id).toMatch(/^[a-f0-9]{64}$/);
    expect(first.file.id).not.toBe(second.file.id);
    expect(first.candidateKey).not.toBe(second.candidateKey);
    expect(first.candidateKey).toMatch(
      new RegExp(`^pending/${first.file.id}/candidate$`),
    );
    expect(first).toMatchObject({
      file: {
        status: 'pending',
        name: 'report.pdf',
        size: null,
        contentType: null,
      },
      expiresAt: '2026-08-24T00:15:00.000Z',
    });
    expect(Object.keys(first.file).sort()).toEqual([
      'contentType',
      'createdAt',
      'id',
      'name',
      'size',
      'status',
      'updatedAt',
    ]);
    expect(first.file).not.toHaveProperty('storageKey');
    expect(first.file).not.toHaveProperty('publicTokenHash');
    expect(first.file).not.toHaveProperty('publicDisposition');

    await expect(
      kernel.getFiles([second.file.id, 'missing', first.file.id]),
    ).resolves.toEqual([second.file, null, first.file]);
  });

  it('completes pending files once and keeps ready metadata immutable', async () => {
    const upload = await kernel.createPending({ name: 'report.txt' });
    storage.put(upload.candidateKey, {
      contentLength: 13,
      contentType: 'text/plain',
    });

    await expect(kernel.completeUpload(upload)).resolves.toMatchObject({
      outcome: 'completed',
      file: {
        id: upload.file.id,
        status: 'ready',
        size: 13,
        contentType: 'text/plain',
      },
    });
    const stored = await repository.getRequired(upload.file.id);
    expect(stored.storageKey).toMatch(readyKeyPattern(upload.file.id));
    const immutableReadyKey = requireStorageKey(stored.storageKey);

    storage.put(upload.candidateKey, {
      contentLength: 999,
      contentType: 'application/octet-stream',
    });
    await expect(kernel.completeUpload(upload)).resolves.toMatchObject({
      outcome: 'ready',
      cleanupStorageKeys: [upload.candidateKey],
      file: { size: 13, contentType: 'text/plain' },
    });
    expect((await repository.getRequired(upload.file.id)).storageKey).toBe(
      immutableReadyKey,
    );
  });

  it('allows only one concurrent completion CAS winner for the same plan', async () => {
    const upload = await kernel.createPending({ name: 'race.bin' });
    storage.put(upload.candidateKey, {
      contentLength: 10,
      contentType: 'application/first',
    });
    storage.pauseFinalizations(2);

    const results = await Promise.all([
      kernel.completeUpload(upload),
      kernel.completeUpload(upload),
    ]);

    expect(
      results.filter((result) => result.outcome === 'completed'),
    ).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'ready')).toHaveLength(
      1,
    );
    const winner = await repository.getRequired(upload.file.id);
    expect(winner.status).toBe('ready');
    expect(winner.storageKey).toMatch(readyKeyPattern(upload.file.id));
    const winnerKey = requireStorageKey(winner.storageKey);
    const finalizedKeys = storage.readyKeys(upload.file.id);
    expect(finalizedKeys).toHaveLength(2);
    expect(new Set(finalizedKeys).size).toBe(2);
    expect(storage.has(winnerKey)).toBe(true);
    const losingKey = finalizedKeys.find((key) => key !== winnerKey);
    expect(losingKey).toBeDefined();
    expect(results.flatMap((result) => result.cleanupStorageKeys)).toContain(
      losingKey,
    );
    expect(
      results.flatMap((result) => result.cleanupStorageKeys),
    ).not.toContain(winnerKey);
    for (const storageKey of results.flatMap(
      (result) => result.cleanupStorageKeys,
    )) {
      await storage.delete(storageKey);
    }
    expect(storage.has(winnerKey)).toBe(true);
  });

  it('rejects a completion whose expiry changes before the final CAS', async () => {
    const upload = await kernel.createPending({ name: 'expiry-race.bin' });
    storage.put(upload.candidateKey, { contentLength: 4 });
    let clockCalls = 0;
    const expiringRepository = new ExpiringCompleteRepository(database);
    const expiringKernel = createFileKernel({
      repository: expiringRepository,
      storage,
      uploadExpiresInSeconds: 900,
      clock: () => {
        clockCalls += 1;
        return now;
      },
    });

    const result = await expiringKernel.completeUpload(upload);

    expect(clockCalls).toBe(1);
    expect(result).toMatchObject({
      outcome: 'expired',
      file: { id: upload.file.id, status: 'pending' },
      cleanupStorageKeys: expect.arrayContaining([upload.candidateKey]),
    });
    expect(result.cleanupStorageKeys).toHaveLength(2);
    const record = await repository.getRequired(upload.file.id);
    expect(record).toMatchObject({ status: 'pending', storageKey: null });
    for (const storageKey of result.cleanupStorageKeys) {
      await storage.delete(storageKey);
    }
    expect(storage.readyKeys(upload.file.id)).toEqual([]);
    expect(storage.has(upload.candidateKey)).toBe(false);
  });

  it('commits metadata from the copied ready candidate when the source changes after HEAD', async () => {
    const upload = await kernel.createPending({ name: 'changing.bin' });
    storage.put(
      upload.candidateKey,
      { contentLength: 5, contentType: 'text/plain' },
      'first',
    );
    storage.mutateCandidateOnNextFinalization(
      { contentLength: 11, contentType: 'application/octet-stream' },
      'replacement',
    );

    const result = await kernel.completeUpload(upload);
    expect(result).toMatchObject({
      outcome: 'completed',
      file: {
        size: 11,
        contentType: 'application/octet-stream',
      },
    });
    const record = await repository.getRequired(upload.file.id);
    const storageKey = requireStorageKey(record.storageKey);
    expect(await storage.head(storageKey)).toMatchObject({
      contentLength: record.size,
      contentType: record.contentType ?? undefined,
    });
    expect(storage.read(storageKey)).toBe('replacement');
  });

  it('treats a delayed concurrent complete as ready after the winner removes pending bytes', async () => {
    const upload = await kernel.createPending({ name: 'delayed.bin' });
    storage.put(upload.candidateKey, { contentLength: 7 }, 'payload');
    const pause = storage.pauseNextFinalization();
    const delayed = kernel.completeUpload(upload);
    await pause.started;

    const winner = await kernel.completeUpload(upload);
    expect(winner.outcome).toBe('completed');
    for (const storageKey of winner.cleanupStorageKeys) {
      await storage.delete(storageKey);
    }
    expect(storage.has(upload.candidateKey)).toBe(false);

    pause.release();
    const resolved = await delayed;
    expect(resolved).toMatchObject({
      outcome: 'ready',
      file: { id: upload.file.id, status: 'ready', size: 7 },
    });
    expect(resolved.cleanupStorageKeys).toHaveLength(1);
    expect(resolved.cleanupStorageKeys[0]).toMatch(
      readyKeyPattern(upload.file.id),
    );
    const record = await repository.getRequired(upload.file.id);
    expect(storage.has(requireStorageKey(record.storageKey))).toBe(true);
  });

  it('returns the finalized object key when the database CAS throws', async () => {
    const upload = await kernel.createPending({ name: 'db-failure.bin' });
    storage.put(upload.candidateKey, { contentLength: 5 });
    const failingRepository = new FailingCompleteRepository(database);
    const failingKernel = createFileKernel({
      repository: failingRepository,
      storage,
      uploadExpiresInSeconds: 900,
      clock: () => now,
    });

    const result = await failingKernel.completeUpload(upload);
    expect(result).toMatchObject({
      outcome: 'persistence-failed',
      error: new Error('simulated CAS failure'),
    });
    expect(result.cleanupStorageKeys).toHaveLength(1);
    expect(result.cleanupStorageKeys[0]).toMatch(
      readyKeyPattern(upload.file.id),
    );
    expect(storage.has(result.cleanupStorageKeys[0] ?? '')).toBe(true);
    expect(storage.has(upload.candidateKey)).toBe(true);
    expect((await repository.getRequired(upload.file.id)).status).toBe(
      'pending',
    );

    if (result.outcome !== 'persistence-failed') {
      throw new Error('Expected persistence failure compensation result.');
    }
  });

  it('retains a possibly referenced ready object when commit and readback are uncertain', async () => {
    const upload = await kernel.createPending({ name: 'uncertain.bin' });
    storage.put(upload.candidateKey, { contentLength: 5 });
    const uncertainRepository = new UncertainCommitRepository(database);
    const uncertainKernel = createFileKernel({
      repository: uncertainRepository,
      storage,
      uploadExpiresInSeconds: 900,
      clock: () => now,
    });

    const result = await uncertainKernel.completeUpload(upload);

    expect(result).toMatchObject({
      outcome: 'persistence-failed',
      error: new Error('simulated uncertain commit result'),
      cleanupStorageKeys: [],
    });
    const committed = await repository.getRequired(upload.file.id);
    expect(committed.status).toBe('ready');
    expect(storage.has(requireStorageKey(committed.storageKey))).toBe(true);
  });

  it('rolls back file readiness and business writes in one transaction', async () => {
    await database.builder().createCollection('fileBindings', (collection) => {
      collection.string('id', { length: 64 }).notNull().primary();
      collection.string('fileId', { length: 64 }).notNull();
    });
    const upload = await kernel.createPending({ name: 'atomic.bin' });
    storage.put(upload.candidateKey, { contentLength: 6 });

    const result = await kernel.completeUpload({
      ...upload,
      commitBinding: async (connection, file) => {
        await connection.query
          .insertInto('fileBindings')
          .values({ id: 'binding-one', fileId: file.id })
          .execute();
        throw new Error('simulated business write failure');
      },
    });

    expect(result).toMatchObject({
      outcome: 'persistence-failed',
    });
    expect(result.cleanupStorageKeys).toHaveLength(1);
    expect(result.cleanupStorageKeys[0]).toMatch(
      readyKeyPattern(upload.file.id),
    );
    expect(storage.has(upload.candidateKey)).toBe(true);
    expect((await repository.getRequired(upload.file.id)).status).toBe(
      'pending',
    );
    expect(
      await database.query().selectFrom('fileBindings').selectAll().execute(),
    ).toEqual([]);
  });

  it('cleans only a failed request candidate while a concurrent completion succeeds', async () => {
    const upload = await kernel.createPending({
      name: 'independent-ready.bin',
    });
    storage.put(upload.candidateKey, { contentLength: 8 });
    const pausedRepository = new PausingFirstTransactionRepository(database);
    const concurrentKernel = createFileKernel({
      repository: pausedRepository,
      storage,
      uploadExpiresInSeconds: 900,
      clock: () => now,
    });

    const winner = concurrentKernel.completeUpload(upload);
    await pausedRepository.firstTransactionStarted;
    const firstReadyKey = storage.readyKeys(upload.file.id)[0];
    expect(firstReadyKey).toBeDefined();

    const failed = await concurrentKernel.completeUpload({
      ...upload,
      commitBinding: async () => {
        throw new Error('simulated binding failure');
      },
    });
    expect(failed).toMatchObject({
      outcome: 'persistence-failed',
    });
    expect(failed.cleanupStorageKeys).toHaveLength(1);
    expect(failed.cleanupStorageKeys[0]).not.toBe(firstReadyKey);
    for (const storageKey of failed.cleanupStorageKeys) {
      await storage.delete(storageKey);
    }

    pausedRepository.releaseFirstTransaction();
    await expect(winner).resolves.toMatchObject({ outcome: 'completed' });
    const record = await repository.getRequired(upload.file.id);
    expect(record).toMatchObject({
      status: 'ready',
      storageKey: firstReadyKey,
    });
    expect(storage.has(requireStorageKey(firstReadyKey))).toBe(true);
  });

  it('resolves complete and cancel competition to one terminal state', async () => {
    const upload = await kernel.createPending({ name: 'cancel-race.bin' });
    storage.put(upload.candidateKey, { contentLength: 7 });
    const pause = storage.pauseNextFinalization();
    const completion = kernel.completeUpload(upload);
    await pause.started;

    const cancellation = await kernel.cancelUpload(upload.file.id);
    pause.release();
    const completionResult = await completion;

    expect(cancellation).toMatchObject({
      outcome: 'failed',
    });
    expect(storage.has(upload.candidateKey)).toBe(false);
    expect(completionResult).toMatchObject({
      outcome: 'failed',
    });
    expect(completionResult.cleanupStorageKeys).toHaveLength(1);
    expect(completionResult.cleanupStorageKeys[0]).toMatch(
      readyKeyPattern(upload.file.id),
    );
    expect((await repository.getRequired(upload.file.id)).status).toBe(
      'failed',
    );

    storage.put(upload.candidateKey, { contentLength: 99 });
    await expect(kernel.completeUpload(upload)).resolves.toMatchObject({
      outcome: 'failed',
      cleanupStorageKeys: [upload.candidateKey],
    });
    expect((await repository.getRequired(upload.file.id)).status).toBe(
      'failed',
    );
  });

  it('keeps the ready object when cancellation loses to completion', async () => {
    const upload = await createReadyFile(kernel, storage, 'ready-cancel.bin');
    expect(storage.has(upload.candidateKey)).toBe(true);
    const stored = await repository.getRequired(upload.file.id);
    const readyKey = requireStorageKey(stored.storageKey);
    expect(storage.has(readyKey)).toBe(true);

    await expect(kernel.cancelUpload(upload.file.id)).resolves.toMatchObject({
      outcome: 'ready',
    });

    expect(storage.has(upload.candidateKey)).toBe(false);
    expect(storage.has(readyKey)).toBe(true);
  });

  it('rejects candidate keys that belong to another file', async () => {
    const first = await kernel.createPending({ name: 'first.bin' });
    const second = await kernel.createPending({ name: 'second.bin' });
    storage.put(second.candidateKey, { contentLength: 1 });

    await expect(
      kernel.completeUpload({
        fileId: first.file.id,
        candidateKey: second.candidateKey,
      }),
    ).rejects.toThrow('storage key does not belong to fileId');
    expect((await repository.getRequired(first.file.id)).status).toBe(
      'pending',
    );
    expect(storage.has(second.candidateKey)).toBe(true);
  });

  it('manages public token state atomically on ready files', async () => {
    const upload = await createReadyFile(kernel, storage, 'public.txt');

    await kernel.enablePublicAccess(
      upload.file.id,
      'sha256:token-one',
      'attachment',
    );
    await expect(kernel.getPublicAccessState(upload.file.id)).resolves.toEqual({
      tokenHash: 'sha256:token-one',
      disposition: 'attachment',
    });

    await kernel.resetPublicAccess(
      upload.file.id,
      'sha256:token-two',
      'inline',
    );
    await expect(kernel.getPublicAccessState(upload.file.id)).resolves.toEqual({
      tokenHash: 'sha256:token-two',
      disposition: 'inline',
    });
    await kernel.disablePublicAccess(upload.file.id);
    await expect(kernel.getPublicAccessState(upload.file.id)).resolves.toEqual({
      tokenHash: null,
      disposition: null,
    });

    const pending = await kernel.createPending({ name: 'pending.txt' });
    await expect(
      kernel.enablePublicAccess(pending.file.id, 'sha256:nope', 'attachment'),
    ).rejects.toThrow('requires an existing ready file');
  });

  it('keeps public DTO queries independent from internal columns', async () => {
    const upload = await createReadyFile(kernel, storage, 'safe.txt');
    await kernel.enablePublicAccess(
      upload.file.id,
      'sha256:secret-token-hash',
      'inline',
    );
    const row = await knex('files').where({ id: upload.file.id }).first();
    expect(row).toMatchObject({
      public_token_hash: 'sha256:secret-token-hash',
      public_disposition: 'inline',
    });
    expect(row.storage_key).toMatch(readyKeyPattern(upload.file.id));

    const storedFile = await kernel.getFile(upload.file.id);
    expect(storedFile).not.toHaveProperty('storageKey');
    expect(storedFile).not.toHaveProperty('publicTokenHash');
    expect(storedFile).not.toHaveProperty('publicDisposition');
  });
});

async function createReadyFile(
  kernel: FileKernel,
  storage: FakeFilesStorage,
  name: string,
) {
  const upload = await kernel.createPending({ name });
  storage.put(upload.candidateKey, {
    contentLength: 12,
    contentType: 'text/plain',
  });
  const result = await kernel.completeUpload(upload);
  if (result.outcome !== 'completed') {
    throw new Error('Expected test file completion to succeed.');
  }
  return upload;
}

function readyKeyPattern(fileId: string): RegExp {
  return new RegExp(`^ready/${fileId}/[a-f0-9]{64}$`);
}

function requireStorageKey(value: string | null | undefined): string {
  if (!value) {
    throw new Error('Expected a storage key.');
  }
  return value;
}

interface FakeStorageObject {
  metadata: StorageObjectMetadata;
  contents: string;
}

class FakeFilesStorage {
  readonly #objects = new Map<string, FakeStorageObject>();
  #barrier: FinalizationBarrier | undefined;
  #nextPause: DeferredFinalization | undefined;
  #nextCandidateMutation: FakeStorageObject | undefined;
  #failNextDelete = false;

  put(
    key: string,
    metadata: StorageObjectMetadata,
    contents: string = '',
  ): void {
    this.#objects.set(key, { metadata: { ...metadata }, contents });
  }

  has(key: string): boolean {
    return this.#objects.has(key);
  }

  async head(key: string): Promise<StorageObjectMetadata> {
    const object = this.#objects.get(key);
    if (!object) {
      throw new Error(`Missing fake storage object: ${key}`);
    }
    return { ...object.metadata };
  }

  read(key: string): string {
    const object = this.#objects.get(key);
    if (!object) {
      throw new Error(`Missing fake storage object: ${key}`);
    }
    return object.contents;
  }

  readyKeys(fileId: string): string[] {
    return [...this.#objects.keys()]
      .filter((key) => key.startsWith(`ready/${fileId}/`))
      .sort();
  }

  mutateCandidateOnNextFinalization(
    metadata: StorageObjectMetadata,
    contents: string,
  ): void {
    this.#nextCandidateMutation = { metadata: { ...metadata }, contents };
  }

  async finalizeCandidate(
    candidateKey: string,
    readyKey: string,
  ): Promise<void> {
    if (this.#nextCandidateMutation) {
      this.#objects.set(candidateKey, this.#nextCandidateMutation);
      this.#nextCandidateMutation = undefined;
    }
    if (this.#barrier) {
      const barrier = this.#barrier;
      await barrier.arrive();
      if (barrier.complete && this.#barrier === barrier) {
        this.#barrier = undefined;
      }
    }
    if (this.#nextPause) {
      const pause = this.#nextPause;
      this.#nextPause = undefined;
      pause.markStarted();
      await pause.waitForRelease();
    }
    const source = this.#objects.get(candidateKey);
    if (!source) {
      throw new Error(`Missing fake storage object: ${candidateKey}`);
    }
    this.#objects.set(readyKey, {
      metadata: { ...source.metadata },
      contents: source.contents,
    });
  }

  async delete(key: string): Promise<void> {
    if (this.#failNextDelete) {
      this.#failNextDelete = false;
      throw new Error('simulated storage deletion failure');
    }
    this.#objects.delete(key);
  }

  failNextDelete(): void {
    this.#failNextDelete = true;
  }

  pauseFinalizations(count: number): void {
    this.#barrier = new FinalizationBarrier(count);
  }

  pauseNextFinalization(): {
    started: Promise<void>;
    release(): void;
  } {
    const pause = new DeferredFinalization();
    this.#nextPause = pause;
    return {
      started: pause.started,
      release: () => pause.release(),
    };
  }
}

class FailingCompleteRepository extends FilesRepository {
  override async completePending(
    ..._args: Parameters<FilesRepository['completePending']>
  ): Promise<boolean> {
    throw new Error('simulated CAS failure');
  }
}

class ExpiringCompleteRepository extends FilesRepository {
  readonly #database: DatabaseManager;

  constructor(database: DatabaseManager) {
    super(database);
    this.#database = database;
  }

  override async completePending(
    ...args: Parameters<FilesRepository['completePending']>
  ): Promise<boolean> {
    const [input, connection] = args;
    await (connection?.query ?? this.#database.query())
      .updateTable('files')
      .set({ uploadExpiresAt: input.now })
      .where('id', '=', input.id)
      .execute();
    return super.completePending(...args);
  }
}

class UncertainCommitRepository extends FilesRepository {
  #rejectReads = false;

  override async get(
    ...args: Parameters<FilesRepository['get']>
  ): ReturnType<FilesRepository['get']> {
    if (this.#rejectReads) {
      throw new Error('simulated uncertain readback');
    }
    return super.get(...args);
  }

  override async transaction<T>(
    callback: Parameters<FilesRepository['transaction']>[0],
  ): Promise<T> {
    await super.transaction(callback);
    this.#rejectReads = true;
    throw new Error('simulated uncertain commit result');
  }
}

class PausingFirstTransactionRepository extends FilesRepository {
  readonly firstTransactionStarted: Promise<void>;
  #markFirstTransactionStarted!: () => void;
  #releaseFirstTransaction!: () => void;
  readonly #firstTransactionReleased: Promise<void>;
  #transactionCount = 0;

  constructor(database: DatabaseManager) {
    super(database);
    this.firstTransactionStarted = new Promise<void>((resolve) => {
      this.#markFirstTransactionStarted = resolve;
    });
    this.#firstTransactionReleased = new Promise<void>((resolve) => {
      this.#releaseFirstTransaction = resolve;
    });
  }

  override async transaction<T>(
    callback: Parameters<FilesRepository['transaction']>[0],
  ): Promise<T> {
    this.#transactionCount += 1;
    if (this.#transactionCount === 1) {
      this.#markFirstTransactionStarted();
      await this.#firstTransactionReleased;
    }
    return super.transaction(callback) as Promise<T>;
  }

  releaseFirstTransaction(): void {
    this.#releaseFirstTransaction();
  }
}

class FinalizationBarrier {
  #arrivals = 0;
  readonly #expected: number;
  readonly #waiters: Array<() => void> = [];

  constructor(expected: number) {
    this.#expected = expected;
  }

  get complete(): boolean {
    return this.#arrivals >= this.#expected;
  }

  async arrive(): Promise<void> {
    this.#arrivals += 1;
    if (this.complete) {
      for (const resolve of this.#waiters.splice(0)) {
        resolve();
      }
      return;
    }
    await new Promise<void>((resolve) => this.#waiters.push(resolve));
  }
}

class DeferredFinalization {
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
