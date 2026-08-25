import { Readable } from 'node:stream';

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
const getSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
  getSignedUrlMock.mockReset();
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

  it('omits MIME fields when none are provided and returns the Provider MIME', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({
        ContentLength: 6,
        ContentType: 'application/octet-stream',
      } as never);
    getSignedUrlMock.mockResolvedValue('https://upload.invalid/signed');
    const provider = new AwsS3Provider({
      driver: 's3',
      bucket: 'managed-files',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
      },
    });

    await expect(
      provider.createUploadUrl('pending/file-1', {
        contentLength: 6,
        expiresInSeconds: 60,
      }),
    ).resolves.toBe('https://upload.invalid/signed');
    const signedPut = getSignedUrlMock.mock.calls[0]?.[1];
    expect(signedPut).toBeInstanceOf(PutObjectCommand);
    expect((signedPut as PutObjectCommand).input).not.toHaveProperty(
      'ContentType',
    );
    expect((signedPut as PutObjectCommand).input).not.toHaveProperty(
      'Metadata',
    );

    await provider.putObject('pending/file-1', Readable.from(['abcdef']), {
      contentLength: 6,
    });
    const put = send.mock.calls[0]?.[0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect((put as PutObjectCommand).input).not.toHaveProperty('ContentType');
    expect((put as PutObjectCommand).input).not.toHaveProperty('Metadata');
    await expect(provider.headObject('pending/file-1')).resolves.toEqual({
      contentLength: 6,
      contentType: 'application/octet-stream',
    });
    provider.dispose();
  });

  it('includes an explicit MIME in signing and returns it from HEAD', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      ContentLength: 6,
      ContentType: 'text/plain',
    } as never);
    getSignedUrlMock.mockResolvedValue('https://upload.invalid/signed');
    const provider = new AwsS3Provider({
      driver: 's3',
      bucket: 'managed-files',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
      },
    });

    await provider.createUploadUrl('pending/file-1', {
      contentLength: 6,
      contentType: 'text/plain',
      expiresInSeconds: 60,
    });
    const signedPut = getSignedUrlMock.mock.calls[0]?.[1];
    expect(signedPut).toBeInstanceOf(PutObjectCommand);
    expect((signedPut as PutObjectCommand).input.ContentType).toBe(
      'text/plain',
    );
    await expect(provider.headObject('pending/file-1')).resolves.toEqual({
      contentLength: 6,
      contentType: 'text/plain',
    });
    expect(send).toHaveBeenCalledOnce();
    provider.dispose();
  });

  it('signs the final GET with private no-store cache control', async () => {
    getSignedUrlMock.mockResolvedValue('https://read.invalid/signed');
    const provider = new AwsS3Provider({
      driver: 's3',
      bucket: 'managed-files',
      region: 'us-east-1',
    });

    await expect(
      provider.createReadUrl('ready/file-1/object', {
        expiresInSeconds: 30,
        cacheControl: 'private, no-store',
      }),
    ).resolves.toBe('https://read.invalid/signed');
    const signedGet = getSignedUrlMock.mock.calls[0]?.[1];
    expect(signedGet).toBeInstanceOf(GetObjectCommand);
    expect((signedGet as GetObjectCommand).input.ResponseCacheControl).toBe(
      'private, no-store',
    );
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
        cacheControl: 'private, no-store',
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
          cacheControl: 'private, no-store',
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
