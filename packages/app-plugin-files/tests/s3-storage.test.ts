import { Readable } from 'node:stream';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveFilesConfig } from '@nocobase/app-plugin-files/server';

import {
  createAwsS3ClientConfig,
  createInternalFilesStorage,
  type S3Provider,
  type SignedReadOptions,
  type SignedUploadOptions,
  type StorageObjectMetadata,
} from '../server/internal/storage/index.js';
import { AwsS3Provider } from '../server/internal/storage/aws-s3-provider.js';

const appStorageRoot = '/tmp/nocobase/files-storage';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('preserves an omitted MIME through AWS PutObject and HeadObject defaults', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({
        ContentLength: 6,
        ContentType: 'application/octet-stream',
        Metadata: { 'nocobase-content-type': 'omitted' },
      } as never);
    const provider = new AwsS3Provider({
      driver: 's3',
      bucket: 'managed-files',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
      },
    });

    await provider.putObject('pending/file-1', Readable.from(['abcdef']), {
      contentLength: 6,
    });
    const put = send.mock.calls[0]?.[0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect((put as PutObjectCommand).input).toMatchObject({
      Metadata: { 'nocobase-content-type': 'omitted' },
    });
    await expect(provider.headObject('pending/file-1')).resolves.toEqual({
      contentLength: 6,
    });
    provider.dispose();
  });

  it('keeps an explicit application/octet-stream MIME strict', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      ContentLength: 6,
      ContentType: 'application/octet-stream',
    } as never);
    const provider = new AwsS3Provider({
      driver: 's3',
      bucket: 'managed-files',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
      },
    });

    await expect(provider.headObject('pending/file-1')).resolves.toEqual({
      contentLength: 6,
      contentType: 'application/octet-stream',
    });
    expect(send).toHaveBeenCalledOnce();
    provider.dispose();
  });

  it('signs private operations and publishes ready content without deleting pending', async () => {
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
