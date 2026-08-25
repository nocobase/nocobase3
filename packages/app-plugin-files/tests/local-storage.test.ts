import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import type { SignedURLOptions, WriteOptions } from 'flydrive/types';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveFilesConfig } from '@nocobase/app-plugin-files/server';

import {
  createFlydriveDisk,
  createInternalFilesStorage,
} from '../server/internal/storage/index.js';
import type { FilesStorageDisk } from '../server/internal/storage/types.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('local Files storage', () => {
  it('streams candidate bytes, preserves metadata, finalizes, reads, and deletes', async () => {
    const appStorageRoot = await createTempDirectory();
    const storage = createInternalFilesStorage(
      resolveFilesConfig({ appStorageRoot }),
    );
    expect(storage.driver).toBe('local');
    if (storage.driver !== 'local') {
      throw new Error('Expected local Files storage.');
    }

    await storage.putCandidate(
      'pending/file-1',
      Readable.from(['managed ', 'files']),
      { contentType: 'text/plain' },
    );
    expect(await storage.head('pending/file-1')).toMatchObject({
      contentLength: 13,
      contentType: 'text/plain',
    });

    await storage.finalizeCandidate('pending/file-1', 'ready/file-1');
    await expect(storage.head('pending/file-1')).resolves.toMatchObject({
      contentLength: 13,
      contentType: 'text/plain',
    });
    expect(await readText(await storage.openRead('ready/file-1'))).toBe(
      'managed files',
    );

    await storage.delete('ready/file-1');
    await storage.delete('ready/file-1');
    await expect(storage.head('ready/file-1')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('keeps a streaming PUT hidden until bytes and metadata are complete', async () => {
    const appStorageRoot = await createTempDirectory();
    const storage = createInternalFilesStorage(
      resolveFilesConfig({ appStorageRoot }),
    );
    if (storage.driver !== 'local') {
      throw new Error('Expected local Files storage.');
    }

    const source = new PassThrough();
    source.write('partial');
    const writing = storage.putCandidate('pending/file-1', source, {
      contentType: 'text/plain',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    await expect(storage.head('pending/file-1')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      storage.finalizeCandidate('pending/file-1', 'ready/file-1'),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    source.end(' content');
    await writing;
    await expect(storage.head('pending/file-1')).resolves.toMatchObject({
      contentLength: 15,
      contentType: 'text/plain',
    });
    await storage.finalizeCandidate('pending/file-1', 'ready/file-1');
    await expect(
      readText(await storage.openRead('ready/file-1')),
    ).resolves.toBe('partial content');
  });

  it('allows pending retries while independent ready candidates stay isolated', async () => {
    const appStorageRoot = await createTempDirectory();
    const storage = createInternalFilesStorage(
      resolveFilesConfig({ appStorageRoot }),
    );
    if (storage.driver !== 'local') {
      throw new Error('Expected local Files storage.');
    }

    await storage.putCandidate('pending/file-1', Readable.from(['original']));
    await storage.putCandidate(
      'pending/file-1',
      Readable.from(['replacement']),
    );
    await expect(
      readText(await storage.openRead('pending/file-1')),
    ).resolves.toBe('replacement');

    await storage.finalizeCandidate('pending/file-1', 'ready/file-1/first');
    await storage.putCandidate('pending/file-1', Readable.from(['next']));
    await storage.finalizeCandidate('pending/file-1', 'ready/file-1/second');
    await expect(
      readText(await storage.openRead('ready/file-1/first')),
    ).resolves.toBe('replacement');
    await expect(
      readText(await storage.openRead('ready/file-1/second')),
    ).resolves.toBe('next');
  });

  it('keeps another ready candidate independent while one Local sidecar copy is paused', async () => {
    const appStorageRoot = await createTempDirectory();
    const config = resolveFilesConfig({ appStorageRoot });
    const disk = createFlydriveDisk(config.storage);
    let markPaused!: () => void;
    let releaseCopy!: () => void;
    const paused = new Promise<void>((resolve) => {
      markPaused = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseCopy = resolve;
    });
    const pausingDisk: FilesStorageDisk = {
      put: (key, contents, options) => disk.put(key, contents, options),
      putStream: (key, contents, options) =>
        disk.putStream(key, contents, options),
      get: (key) => disk.get(key),
      getStream: (key) => disk.getStream(key),
      getMetaData: (key) => disk.getMetaData(key),
      getSignedUrl: (key: string, options?: SignedURLOptions) =>
        disk.getSignedUrl(key, options),
      getSignedUploadUrl: (key: string, options?: SignedURLOptions) =>
        disk.getSignedUploadUrl(key, options),
      copy: async (
        source: string,
        destination: string,
        options?: WriteOptions,
      ): Promise<void> => {
        if (destination === 'ready/file-1/first.files-metadata.json') {
          markPaused();
          await released;
        }
        await disk.copy(source, destination, options);
      },
      delete: (key) => disk.delete(key),
    };
    const storage = createInternalFilesStorage(config, { disk: pausingDisk });

    await storage.putCandidate(
      'pending/file-1',
      Readable.from(['independent']),
      { contentType: 'text/plain' },
    );
    const first = storage.finalizeCandidate(
      'pending/file-1',
      'ready/file-1/first',
    );
    await paused;
    await expect(storage.head('ready/file-1/first')).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await storage.finalizeCandidate('pending/file-1', 'ready/file-1/second');
    await expect(storage.head('ready/file-1/second')).resolves.toMatchObject({
      contentLength: 11,
      contentType: 'text/plain',
    });
    await expect(
      readText(await storage.openRead('ready/file-1/second')),
    ).resolves.toBe('independent');

    releaseCopy();
    await first;
    await expect(storage.head('ready/file-1/first')).resolves.toMatchObject({
      contentLength: 11,
      contentType: 'text/plain',
    });
  });

  it('rejects unsafe object keys and operations after disposal', async () => {
    const appStorageRoot = await createTempDirectory();
    const storage = createInternalFilesStorage(
      resolveFilesConfig({ appStorageRoot }),
    );
    if (storage.driver !== 'local') {
      throw new Error('Expected local Files storage.');
    }

    await expect(
      storage.putCandidate('../outside', Readable.from(['blocked'])),
    ).rejects.toThrow('Path traversal segment detected');

    await storage.dispose();
    await storage.dispose();
    await expect(storage.head('ready/file-1')).rejects.toThrow(
      'Files storage has been disposed.',
    );
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'nocobase-files-'));
  tempDirectories.push(directory);
  return directory;
}

async function readText(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
