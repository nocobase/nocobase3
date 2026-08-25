import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveFilesConfig } from '@nocobase/app-plugin-files/server';

import { createInternalFilesStorage } from '../server/internal/storage/index.js';

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

  it('does not overwrite existing candidate or ready content', async () => {
    const appStorageRoot = await createTempDirectory();
    const storage = createInternalFilesStorage(
      resolveFilesConfig({ appStorageRoot }),
    );
    if (storage.driver !== 'local') {
      throw new Error('Expected local Files storage.');
    }

    await storage.putCandidate('pending/file-1', Readable.from(['original']));
    await expect(
      storage.putCandidate('pending/file-1', Readable.from(['replacement'])),
    ).rejects.toBeDefined();
    await expect(
      readText(await storage.openRead('pending/file-1')),
    ).resolves.toBe('original');

    await storage.putCandidate('ready/file-1', Readable.from(['published']));
    await expect(
      storage.finalizeCandidate('pending/file-1', 'ready/file-1'),
    ).rejects.toBeDefined();
    await expect(
      readText(await storage.openRead('ready/file-1')),
    ).resolves.toBe('published');
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
