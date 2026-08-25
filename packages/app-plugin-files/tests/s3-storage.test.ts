import { Readable } from 'node:stream';

import { S3Driver } from 'flydrive/drivers/s3';
import { describe, expect, it } from 'vitest';

import { resolveFilesConfig } from '@nocobase/app-plugin-files/server';

import {
  createFlydriveDisk,
  createInternalFilesStorage,
} from '../server/internal/storage/index.js';
import { FakeS3Disk } from './support/fake-s3-disk.js';

const appStorageRoot = '/tmp/nocobase/files-storage';

describe('S3-compatible Files storage', () => {
  it('constructs the Flydrive S3 driver with private provider settings', () => {
    const storage = resolveFilesConfig({
      appStorageRoot,
      config: {
        storage: {
          driver: 's3',
          bucket: 'managed-files',
          region: 'auto',
          endpoint: 'https://account-id.r2.cloudflarestorage.com',
          forcePathStyle: true,
          credentials: {
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key',
            sessionToken: 'session-token',
          },
        },
      },
    }).storage;
    if (storage.driver !== 's3') {
      throw new Error('Expected S3 Files storage configuration.');
    }

    const disk = createFlydriveDisk(storage);

    expect(disk.driver).toBeInstanceOf(S3Driver);
    expect((disk.driver as S3Driver).options).toMatchObject({
      bucket: 'managed-files',
      visibility: 'private',
      supportsACL: false,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      region: 'auto',
      endpoint: 'https://account-id.r2.cloudflarestorage.com',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        sessionToken: 'session-token',
      },
    });
  });

  it('uses Flydrive for signed PUT, metadata, copy, read URL, and delete', async () => {
    const disk = new FakeS3Disk();
    const storage = createInternalFilesStorage(
      resolveFilesConfig({
        appStorageRoot,
        config: {
          storage: {
            driver: 's3',
            bucket: 'managed-files',
            prefix: 'apps/primary',
          },
        },
      }),
      { disk },
    );
    if (storage.driver !== 's3') {
      throw new Error('Expected S3 Files storage.');
    }

    await expect(
      storage.createCandidateUpload('pending/file-1', {
        expiresInSeconds: 120,
        contentLength: 13,
        contentType: 'text/plain',
      }),
    ).resolves.toEqual({
      method: 'PUT',
      url: 'https://upload.invalid/apps%2Fprimary%2Fpending%2Ffile-1',
      headers: {
        'content-type': 'text/plain',
        'if-none-match': '*',
      },
    });
    expect(disk.uploadRequests).toEqual([
      {
        key: 'apps/primary/pending/file-1',
        options: {
          expiresIn: 120,
          ContentLength: 13,
          IfNoneMatch: '*',
          contentType: 'text/plain',
        },
      },
    ]);

    disk.seed('apps/primary/pending/file-1', {
      contentLength: 13,
      contentType: 'text/plain',
      etag: 'fake-etag',
    });
    await expect(storage.head('pending/file-1')).resolves.toEqual({
      contentLength: 13,
      contentType: 'text/plain',
      etag: 'fake-etag',
    });

    await storage.finalizeCandidate('pending/file-1', 'ready/file-1');
    expect(disk.copies).toEqual([
      {
        source: 'apps/primary/pending/file-1',
        destination: 'apps/primary/ready/file-1',
        options: { IfNoneMatch: '*', visibility: 'private' },
      },
    ]);
    await expect(
      storage.createReadUrl('ready/file-1', {
        expiresInSeconds: 30,
        contentDisposition: 'attachment; filename="report.txt"',
        cacheControl: 'private, no-store',
      }),
    ).resolves.toBe(
      'https://read.invalid/apps%2Fprimary%2Fready%2Ffile-1?signature=secret',
    );
    expect(disk.readOptions).toEqual([
      {
        expiresInSeconds: 30,
        contentDisposition: 'attachment; filename="report.txt"',
        cacheControl: 'private, no-store',
      },
    ]);

    await storage.delete('ready/file-1');
    expect(disk.keys()).toEqual(['apps/primary/pending/file-1']);
  });

  it('does not overwrite existing candidate or ready content', async () => {
    const disk = new FakeS3Disk();
    const storage = createInternalFilesStorage(
      resolveFilesConfig({
        appStorageRoot,
        config: {
          storage: { driver: 's3', bucket: 'managed-files' },
        },
      }),
      { disk },
    );
    if (storage.driver !== 's3') {
      throw new Error('Expected S3 Files storage.');
    }

    await storage.putCandidate('pending/file-1', Readable.from(['original']));
    await expect(
      storage.putCandidate('pending/file-1', Readable.from(['replacement'])),
    ).rejects.toBeDefined();
    await expect(
      readText(await storage.openRead('pending/file-1')),
    ).resolves.toBe('original');

    disk.seed(
      'ready/file-1',
      { contentLength: 9, contentType: 'text/plain' },
      'published',
    );
    await expect(
      storage.finalizeCandidate('pending/file-1', 'ready/file-1'),
    ).rejects.toBeDefined();
    await expect(
      readText(await storage.openRead('ready/file-1')),
    ).resolves.toBe('published');
  });

  it('blocks operations after idempotent disposal', async () => {
    const storage = createInternalFilesStorage(
      resolveFilesConfig({
        appStorageRoot,
        config: {
          storage: { driver: 's3', bucket: 'managed-files' },
        },
      }),
      { disk: new FakeS3Disk() },
    );

    await storage.dispose();
    await storage.dispose();
    await expect(storage.head('ready/file-1')).rejects.toThrow(
      'Files storage has been disposed.',
    );
  });
});

async function readText(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
