import { describe, expect, it } from 'vitest';

import { resolveFilesConfig } from '@nocobase/app-plugin-files/server';

import {
  createAwsS3ClientConfig,
  createInternalFilesStorage,
  type S3Provider,
  type SignedReadOptions,
  type SignedUploadOptions,
  type StorageObjectMetadata,
} from '../server/internal/storage/index.js';

const appStorageRoot = '/tmp/nocobase/files-storage';

describe('S3-compatible Files storage', () => {
  it('maps AWS/R2/MinIO client options including temporary credentials', () => {
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

    expect(createAwsS3ClientConfig(storage)).toEqual({
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

  it('signs private upload/read operations and finalizes with copy then delete', async () => {
    const provider = new FakeS3Provider();
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
      { s3Provider: provider },
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
        'if-none-match': '*',
        'content-type': 'text/plain',
      },
    });

    await expect(storage.head('pending/file-1')).resolves.toEqual({
      contentLength: 13,
      contentType: 'text/plain',
      etag: 'fake-etag',
    });
    await storage.finalizeCandidate('pending/file-1', 'ready/file-1');
    await expect(
      storage.createReadUrl('ready/file-1', {
        expiresInSeconds: 30,
        contentDisposition: 'attachment; filename="report.txt"',
      }),
    ).resolves.toBe('https://read.invalid/apps%2Fprimary%2Fready%2Ffile-1');
    await storage.delete('ready/file-1');

    expect(provider.calls).toEqual([
      {
        operation: 'signUpload',
        key: 'apps/primary/pending/file-1',
        options: {
          expiresInSeconds: 120,
          contentLength: 13,
          contentType: 'text/plain',
        },
      },
      { operation: 'head', key: 'apps/primary/pending/file-1' },
      {
        operation: 'copy',
        sourceKey: 'apps/primary/pending/file-1',
        destinationKey: 'apps/primary/ready/file-1',
      },
      { operation: 'delete', key: 'apps/primary/pending/file-1' },
      {
        operation: 'signRead',
        key: 'apps/primary/ready/file-1',
        options: {
          expiresInSeconds: 30,
          contentDisposition: 'attachment; filename="report.txt"',
        },
      },
      { operation: 'delete', key: 'apps/primary/ready/file-1' },
    ]);
  });

  it('disposes the provider once and blocks later operations', async () => {
    const provider = new FakeS3Provider();
    const storage = createInternalFilesStorage(
      resolveFilesConfig({
        appStorageRoot,
        config: {
          storage: { driver: 's3', bucket: 'managed-files' },
        },
      }),
      { s3Provider: provider },
    );

    await storage.dispose();
    await storage.dispose();
    expect(provider.disposeCount).toBe(1);
    await expect(storage.head('ready/file-1')).rejects.toThrow(
      'Files storage has been disposed.',
    );
  });
});

type FakeS3Call =
  | { operation: 'signUpload'; key: string; options: SignedUploadOptions }
  | { operation: 'head'; key: string }
  | { operation: 'copy'; sourceKey: string; destinationKey: string }
  | { operation: 'signRead'; key: string; options: SignedReadOptions }
  | { operation: 'delete'; key: string };

class FakeS3Provider implements S3Provider {
  readonly calls: FakeS3Call[] = [];
  disposeCount = 0;

  async createUploadUrl(
    key: string,
    options: SignedUploadOptions,
  ): Promise<string> {
    this.calls.push({ operation: 'signUpload', key, options });
    return `https://upload.invalid/${encodeURIComponent(key)}`;
  }

  async headObject(key: string): Promise<StorageObjectMetadata> {
    this.calls.push({ operation: 'head', key });
    return {
      contentLength: 13,
      contentType: 'text/plain',
      etag: 'fake-etag',
    };
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    this.calls.push({ operation: 'copy', sourceKey, destinationKey });
  }

  async createReadUrl(
    key: string,
    options: SignedReadOptions,
  ): Promise<string> {
    this.calls.push({ operation: 'signRead', key, options });
    return `https://read.invalid/${encodeURIComponent(key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    this.calls.push({ operation: 'delete', key });
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}
