import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createQueueManager, createSyncQueueConfig } from '../src/index.js';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it.each([true, false])(
  'strictJobLoading=%s controls whether a broken job aborts initialization',
  async (strictJobLoading) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'queue-startup-'));
    directories.push(dir);
    const file = path.join(dir, 'broken.mjs');
    await writeFile(file, 'throw new Error("broken job import");');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = createQueueManager(
      { ...createSyncQueueConfig(), jobs: { locations: [file] } },
      { strictJobLoading },
    );
    try {
      if (strictJobLoading) {
        await expect(manager.init()).rejects.toThrow(
          `Failed to load job from ${file}`,
        );
      } else {
        await expect(manager.init()).resolves.toBeUndefined();
      }
    } finally {
      await manager.close();
    }
  },
);

it('does not import jobs when automatic loading is disabled', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'queue-startup-'));
  directories.push(dir);
  const file = path.join(dir, 'manual.mjs');
  await writeFile(file, 'throw new Error("must not import");');
  const manager = createQueueManager(
    {
      ...createSyncQueueConfig(),
      jobs: { locations: [file], autoLoad: false },
    },
    { strictJobLoading: true },
  );
  try {
    await expect(manager.init()).resolves.toBeUndefined();
  } finally {
    await manager.close();
  }
});

it('initializes successfully with an importable job in strict mode', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'queue-startup-'));
  directories.push(dir);
  const file = path.join(dir, 'valid.mjs');
  await writeFile(file, 'export default class StrictStartupJob {}');
  const manager = createQueueManager(
    { ...createSyncQueueConfig(), jobs: { locations: [file] } },
    { strictJobLoading: true },
  );
  try {
    await expect(manager.init()).resolves.toBeUndefined();
  } finally {
    await manager.close();
  }
});
