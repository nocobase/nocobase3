import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/database';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
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
    expect(first.readyKey).not.toBe(second.readyKey);
    expect(first.candidateKey).toMatch(
      new RegExp(`^pending/${first.file.id}/[a-f0-9]{48}$`),
    );
    expect(first.readyKey).toMatch(
      new RegExp(`^ready/${first.file.id}/[a-f0-9]{48}$`),
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
    ).resolves.toEqual([second.file, first.file]);
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
    expect(stored.storageKey).toBe(upload.readyKey);

    const retryCandidate = `pending/${upload.file.id}/retry`;
    const retryReady = `ready/${upload.file.id}/retry`;
    storage.put(retryCandidate, {
      contentLength: 999,
      contentType: 'application/octet-stream',
    });
    await expect(
      kernel.completeUpload({
        fileId: upload.file.id,
        candidateKey: retryCandidate,
        readyKey: retryReady,
      }),
    ).resolves.toMatchObject({
      outcome: 'ready',
      cleanupStorageKey: retryCandidate,
      file: { size: 13, contentType: 'text/plain' },
    });
    expect((await repository.getRequired(upload.file.id)).storageKey).toBe(
      upload.readyKey,
    );
    expect(storage.has(retryReady)).toBe(false);
  });

  it('allows only one concurrent completion CAS winner and identifies loser cleanup', async () => {
    const upload = await kernel.createPending({ name: 'race.bin' });
    const secondCandidate = `pending/${upload.file.id}/second-candidate`;
    const secondReady = `ready/${upload.file.id}/second-ready`;
    storage.put(upload.candidateKey, {
      contentLength: 10,
      contentType: 'application/first',
    });
    storage.put(secondCandidate, {
      contentLength: 20,
      contentType: 'application/second',
    });
    storage.pauseFinalizations(2);

    const results = await Promise.all([
      kernel.completeUpload(upload),
      kernel.completeUpload({
        fileId: upload.file.id,
        candidateKey: secondCandidate,
        readyKey: secondReady,
      }),
    ]);

    expect(
      results.filter((result) => result.outcome === 'completed'),
    ).toHaveLength(1);
    const loser = results.find(
      (
        result,
      ): result is Extract<(typeof results)[number], { outcome: 'ready' }> =>
        result.outcome === 'ready' && result.cleanupStorageKey !== undefined,
    );
    expect(loser).toBeDefined();
    const winner = await repository.getRequired(upload.file.id);
    expect(winner.status).toBe('ready');
    expect([upload.readyKey, secondReady]).toContain(winner.storageKey);
    expect(loser?.cleanupStorageKey).not.toBe(winner.storageKey);
    expect(storage.has(winner.storageKey ?? '')).toBe(true);

    await kernel.deleteStorageObject(loser?.cleanupStorageKey ?? 'missing');
    expect(storage.has(winner.storageKey ?? '')).toBe(true);
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
      candidateStorageKey: upload.readyKey,
      cleanupStorageKey: upload.readyKey,
      cleanupSafe: true,
      error: new Error('simulated CAS failure'),
    });
    expect(storage.has(upload.readyKey)).toBe(true);
    expect((await repository.getRequired(upload.file.id)).status).toBe(
      'pending',
    );

    if (
      result.outcome !== 'persistence-failed' ||
      !result.cleanupSafe ||
      result.cleanupStorageKey === undefined
    ) {
      throw new Error('Expected persistence failure compensation result.');
    }
    await failingKernel.deleteStorageObject(result.cleanupStorageKey);
    expect(storage.has(upload.readyKey)).toBe(false);
  });

  it('resolves complete and cancel competition to one terminal state', async () => {
    const upload = await kernel.createPending({ name: 'cancel-race.bin' });
    storage.put(upload.candidateKey, { contentLength: 7 });
    const pause = storage.pauseNextFinalization();
    const completion = kernel.completeUpload(upload);
    await pause.started;

    const cancellation = await kernel.cancelUpload(
      upload.file.id,
      upload.candidateKey,
    );
    pause.release();
    const completionResult = await completion;

    expect(cancellation).toMatchObject({
      outcome: 'failed',
      cleanupStorageKey: upload.candidateKey,
    });
    expect(storage.has(upload.candidateKey)).toBe(false);
    expect(completionResult).toMatchObject({
      outcome: 'failed',
      cleanupStorageKey: upload.readyKey,
    });
    expect((await repository.getRequired(upload.file.id)).status).toBe(
      'failed',
    );

    storage.put(upload.candidateKey, { contentLength: 99 });
    await expect(kernel.completeUpload(upload)).resolves.toMatchObject({
      outcome: 'failed',
      cleanupStorageKey: upload.candidateKey,
    });
    expect((await repository.getRequired(upload.file.id)).status).toBe(
      'failed',
    );
  });

  it('rejects candidate and ready keys that belong to another file', async () => {
    const first = await kernel.createPending({ name: 'first.bin' });
    const second = await kernel.createPending({ name: 'second.bin' });
    storage.put(second.candidateKey, { contentLength: 1 });

    await expect(
      kernel.completeUpload({
        fileId: first.file.id,
        candidateKey: second.candidateKey,
        readyKey: second.readyKey,
      }),
    ).rejects.toThrow('storage key does not belong to fileId');
    await expect(
      kernel.cancelUpload(first.file.id, second.candidateKey),
    ).rejects.toThrow('storage key does not belong to fileId');
    expect((await repository.getRequired(first.file.id)).status).toBe(
      'pending',
    );
    expect(storage.has(second.candidateKey)).toBe(true);
  });

  it('writes and clears public token state atomically on ready files', async () => {
    const upload = await createReadyFile(kernel, storage, 'public.txt');

    await kernel.setPublicAccess(
      upload.file.id,
      'sha256:token-one',
      'attachment',
    );
    await expect(kernel.getPublicAccessState(upload.file.id)).resolves.toEqual({
      tokenHash: 'sha256:token-one',
      disposition: 'attachment',
    });

    await Promise.all([
      kernel.setPublicAccess(upload.file.id, 'sha256:token-two', 'inline'),
      kernel.clearPublicAccess(upload.file.id),
    ]);
    const state = await kernel.getPublicAccessState(upload.file.id);
    expect([
      { tokenHash: 'sha256:token-two', disposition: 'inline' },
      { tokenHash: null, disposition: null },
    ]).toContainEqual(state);
    expect((state.tokenHash === null) === (state.disposition === null)).toBe(
      true,
    );

    const pending = await kernel.createPending({ name: 'pending.txt' });
    await expect(
      kernel.setPublicAccess(pending.file.id, 'sha256:nope', 'attachment'),
    ).rejects.toThrow('requires an existing ready file');
  });

  it('selects expired pending files in stable batches', async () => {
    const first = await kernel.createPending({ name: 'first.txt' });
    now = new Date('2026-08-24T00:05:00.000Z');
    const second = await kernel.createPending({ name: 'second.txt' });
    now = new Date('2026-08-24T00:16:00.000Z');

    await expect(kernel.findExpiredPending(1)).resolves.toEqual([first.file]);
    await expect(kernel.findExpiredPending(10)).resolves.toEqual([first.file]);
    expect((await repository.getRequired(second.file.id)).status).toBe(
      'pending',
    );
  });

  it('purges records internally without exposing purge through FileService', async () => {
    const upload = await createReadyFile(kernel, storage, 'purge.txt');
    const readyKey = (await repository.getRequired(upload.file.id)).storageKey;
    expect(readyKey).not.toBeNull();

    await expect(kernel.purgeFile(upload.file.id)).resolves.toBe(true);
    await expect(kernel.getFile(upload.file.id)).resolves.toBeUndefined();
    expect(storage.has(readyKey ?? '')).toBe(false);
    await expect(kernel.purgeFile(upload.file.id)).resolves.toBe(false);
  });

  it('keeps public DTO queries independent from internal columns', async () => {
    const upload = await createReadyFile(kernel, storage, 'safe.txt');
    await kernel.setPublicAccess(
      upload.file.id,
      'sha256:secret-token-hash',
      'inline',
    );
    const row = await knex('files').where({ id: upload.file.id }).first();
    expect(row).toMatchObject({
      storage_key: upload.readyKey,
      public_token_hash: 'sha256:secret-token-hash',
      public_disposition: 'inline',
    });

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

class FakeFilesStorage {
  readonly #objects = new Map<string, StorageObjectMetadata>();
  #barrier: FinalizationBarrier | undefined;
  #nextPause: DeferredFinalization | undefined;

  put(key: string, metadata: StorageObjectMetadata): void {
    this.#objects.set(key, metadata);
  }

  has(key: string): boolean {
    return this.#objects.has(key);
  }

  async head(key: string): Promise<StorageObjectMetadata> {
    const metadata = this.#objects.get(key);
    if (!metadata) {
      throw new Error(`Missing fake storage object: ${key}`);
    }
    return { ...metadata };
  }

  async finalizeCandidate(
    candidateKey: string,
    readyKey: string,
  ): Promise<void> {
    const metadata = await this.head(candidateKey);
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
    this.#objects.set(readyKey, metadata);
    this.#objects.delete(candidateKey);
  }

  async delete(key: string): Promise<void> {
    this.#objects.delete(key);
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
