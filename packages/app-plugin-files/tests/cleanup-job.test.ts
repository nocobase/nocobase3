import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/database';
import {
  createFileService,
  resolveFilesConfig,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';
import {
  createQueueManager,
  createSyncQueueConfig,
  type JobClass,
  type NocoBaseQueueManager,
} from '@nocobase/queue';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import CleanupExpiredUploadsJob from '../server/jobs/cleanup-expired-uploads.js';
import {
  createOpaqueFilesRuntime,
  runFilesCleanup,
} from '../server/internal/runtime.js';

interface CleanupFixture {
  database: DatabaseManager;
  runtime: FilesRuntime;
  queue: NocoBaseQueueManager;
  storageRoot: string;
}

const fixtures: CleanupFixture[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    fixtures.splice(0).map(async (fixture) => {
      await fixture.queue.close();
      await fixture.runtime.dispose();
      await fixture.database.destroy();
      await rm(fixture.storageRoot, { recursive: true, force: true });
    }),
  );
});

describe('Files cleanup Queue Job', () => {
  it('uses the injected App runtime and honors a stable batch boundary', async () => {
    let now = new Date('2026-08-24T00:00:00.000Z');
    const log = vi.fn();
    const fixture = await createFixture(() => now, log);
    const service = createFileService({ runtime: fixture.runtime });
    const first = await service.createUpload({ name: 'first.txt', size: 1 });
    const second = await service.createUpload({ name: 'second.txt', size: 1 });
    now = new Date('2026-08-24T00:02:00.000Z');

    await fixture.queue.dispatch(CleanupExpiredUploadsJob, {
      batchSize: 1,
      timeBudgetMs: 5_000,
    });

    const states = await service.getFiles([first.fileId, second.fileId]);
    expect(states.filter((file) => file === null)).toHaveLength(1);
    expect(states.filter((file) => file?.status === 'pending')).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        scanned: 1,
        failed: 1,
        purged: 1,
        hasMore: true,
      }),
      'Files expired uploads cleanup completed.',
    );
  });

  it('stops before work when the shared time budget is exhausted', async () => {
    let now = new Date('2026-08-24T00:00:00.000Z');
    const fixture = await createFixture(() => now, vi.fn());
    const service = createFileService({ runtime: fixture.runtime });
    const pending = await service.createUpload({
      name: 'bounded.txt',
      size: 1,
    });
    now = new Date('2026-08-24T00:02:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValue(1_001);

    await expect(
      runFilesCleanup(fixture.runtime, {
        batchSize: 10,
        timeBudgetMs: 1,
      }),
    ).resolves.toMatchObject({
      pending: { scanned: 0, failed: 0, hasMore: true },
      reservationsReleased: 0,
      hasMore: true,
    });
    await expect(service.getFile(pending.fileId)).resolves.toMatchObject({
      status: 'pending',
    });
  });
});

async function createFixture(
  clock: () => Date,
  log: ReturnType<typeof vi.fn>,
): Promise<CleanupFixture> {
  const database = createDatabaseManager({
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
      },
    },
  });
  await filesMigration.up(createMigrationContext(database.connection()));
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'files-cleanup-job-'));
  const runtime = createOpaqueFilesRuntime(
    {
      database,
      config: resolveFilesConfig({
        appStorageRoot: storageRoot,
        config: { upload: { expiresInSeconds: 60 } },
      }),
      audience: 'cleanup-job-test',
      secret: 'cleanup-job-test-secret-at-least-32-characters',
    },
    { clock },
  );
  const queue = createQueueManager(createSyncQueueConfig(), {
    jobFactory: (JobType: JobClass) =>
      new JobType({ filesRuntime: runtime, logger: { info: log } }),
  });
  const fixture = { database, runtime, queue, storageRoot };
  fixtures.push(fixture);
  return fixture;
}
