import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createDriveManager } from '@nocobase/drive';
import { DriveFileManager } from '../src/manager/file/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('DriveFileManager', () => {
  it('writes and reads AI files through the configured drive', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nocobase-ai-files-'));
    tempDirs.push(root);
    const drive = createDriveManager({
      default: 'public',
      links: {},
      disks: {
        public: {
          driver: 'fs',
          location: root,
          visibility: 'public',
          url: '/storage',
        },
      },
    });
    const manager = new DriveFileManager(drive);

    const stored = await manager.put(
      '42',
      new TextEncoder().encode('hello'),
      'hello world.txt',
      'text/plain',
    );

    expect(stored).toMatchObject({
      key: 'ai-files/42-hello-world.txt',
      filename: 'hello world.txt',
      size: 5,
      mimetype: 'text/plain',
      url: '/storage/ai-files/42-hello-world.txt',
    });
    await expect(readFile(path.join(root, stored.key), 'utf8')).resolves.toBe(
      'hello',
    );
    await expect(manager.getBytes(stored.key)).resolves.toEqual(
      new TextEncoder().encode('hello'),
    );

    const { stream, contentType } = await manager.getFileStream({
      path: stored.key,
      mimetype: 'text/plain',
    });
    expect(contentType).toBe('text/plain');
    expect(await readStream(stream)).toBe('hello');
  });
});

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
