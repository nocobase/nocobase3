// @vitest-environment node

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { HubStorageService } from '../../server/hub/storage-service.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('HubStorageService', () => {
  it('explains each managed category and never follows runtime symlinks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nocobase-hub-storage-'));
    temporaryDirectories.push(root);
    const releaseRoot = path.join(root, 'releases');
    const logsRoot = path.join(root, 'logs');
    await mkdir(path.join(releaseRoot, 'app', 'release'), { recursive: true });
    await mkdir(path.join(releaseRoot, '.uploads'), { recursive: true });
    await mkdir(path.join(releaseRoot, '.runtime', 'app'), { recursive: true });
    await mkdir(logsRoot, { recursive: true });
    await writeFile(
      path.join(releaseRoot, 'app', 'release', 'artifact'),
      'artifact',
    );
    await writeFile(path.join(releaseRoot, '.uploads', 'pending'), 'upload');
    await writeFile(
      path.join(releaseRoot, '.runtime', 'app', 'database.sqlite'),
      'database',
    );
    await writeFile(path.join(logsRoot, 'hub.log'), 'logs');
    await symlink(
      path.join(releaseRoot, 'app', 'release'),
      path.join(releaseRoot, '.runtime', 'app', 'public'),
    );

    const service = new HubStorageService({
      releaseRoot,
      logsRoot,
    });
    const result = await service.measure();

    expect(result.categories.map((category) => category.key)).toEqual([
      'releaseArtifacts',
      'temporaryUploads',
      'runtimeData',
      'logs',
      'otherFilesystemUsage',
    ]);
    expect(result.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'runtimeData',
          bytes: Buffer.byteLength('database'),
          reclaimableBytes: 0,
          accuracy: 'exact',
        }),
        expect.objectContaining({
          key: 'otherFilesystemUsage',
          reclaimableBytes: null,
          scope: 'outside-hub',
          accuracy: 'derived',
        }),
      ]),
    );
    expect(result.knownUsageBytes).toBe(
      Buffer.byteLength('artifactuploaddatabaselogs'),
    );
    expect(result.filesystem.capacityBytes).toBeGreaterThan(0);
    expect(result.measuredAt).toMatch(/Z$/);
  });
});
