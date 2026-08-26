import type { Readable } from 'node:stream';

import { Disk, KeyNormalizer } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { S3Driver } from 'flydrive/drivers/s3';
import type { S3DriverOptions } from 'flydrive/drivers/s3/types';

import type {
  FilesConfig,
  FilesLocalStorageConfig,
  FilesS3StorageConfig,
} from '../../config.js';
import type {
  FilesStorageDisk,
  InternalFilesStorage,
  LocalCandidateWriteOptions,
  SignedReadOptions,
  SignedStorageRequest,
  SignedUploadOptions,
  StorageObjectMetadata,
} from './types.js';

export type {
  FilesStorageDisk,
  InternalFilesStorage,
  LocalCandidateWriteOptions,
  LocalFilesStorage,
  S3FilesStorage,
  SignedReadOptions,
  SignedStorageRequest,
  SignedUploadOptions,
  StorageObjectMetadata,
} from './types.js';

export interface CreateInternalFilesStorageOptions {
  disk?: FilesStorageDisk;
}

export function createInternalFilesStorage(
  config: FilesConfig,
  options: CreateInternalFilesStorageOptions = {},
): InternalFilesStorage {
  const disk = options.disk ?? createFlydriveDisk(config.storage);
  if (config.storage.driver === 'local') {
    return new FlydriveFilesStorage('local', undefined, disk);
  }
  return new FlydriveFilesStorage('s3', config.storage.prefix, disk);
}

export function createFlydriveDisk(config: FilesConfig['storage']): Disk {
  if (config.driver === 'local') {
    return new Disk(createFsDriver(config));
  }

  return new Disk(createS3Driver(config));
}

class FlydriveFilesStorage<TDriver extends 'local' | 's3'> {
  readonly driver: TDriver;
  readonly #disk: FilesStorageDisk;
  readonly #prefix: string | undefined;
  #disposed = false;

  constructor(
    driver: TDriver,
    prefix: string | undefined,
    disk: FilesStorageDisk,
  ) {
    this.driver = driver;
    this.#disk = disk;
    this.#prefix = prefix;
  }

  async putCandidate(
    key: string,
    contents: Readable,
    options: LocalCandidateWriteOptions = {},
  ): Promise<void> {
    this.#assertActive();
    const resolvedKey = this.#resolveKey(key);
    await callFlydriveStream(contents, () =>
      this.#disk.putStream(resolvedKey, contents, {
        visibility: 'private',
        ...(options.contentType === undefined
          ? {}
          : { contentType: options.contentType }),
        ...(options.contentLength === undefined
          ? {}
          : { contentLength: options.contentLength }),
      }),
    );

    if (this.driver === 'local') {
      try {
        await callFlydrive(() =>
          this.#disk.put(
            metadataKey(resolvedKey),
            JSON.stringify({ contentType: options.contentType ?? null }),
            { visibility: 'private', contentType: 'application/json' },
          ),
        );
      } catch (error) {
        try {
          await this.#disk.delete(resolvedKey);
        } catch {
          // Preserve the metadata persistence failure.
        }
        throw error;
      }
    }
  }

  async head(key: string): Promise<StorageObjectMetadata> {
    this.#assertActive();
    const resolvedKey = this.#resolveKey(key);
    const metadata = await callFlydrive(() =>
      this.#disk.getMetaData(resolvedKey),
    );
    if (this.driver === 's3') {
      return toStorageMetadata(metadata);
    }

    const contentType = readLocalContentType(
      await callFlydrive(() => this.#disk.get(metadataKey(resolvedKey))),
    );
    return {
      ...toStorageMetadata(metadata),
      ...(contentType === undefined ? {} : { contentType }),
    };
  }

  async finalizeCandidate(
    candidateKey: string,
    readyKey: string,
  ): Promise<void> {
    this.#assertActive();
    const sourceKey = this.#resolveKey(candidateKey);
    const destinationKey = this.#resolveKey(readyKey);
    if (this.driver === 'local') {
      await callFlydrive(() =>
        this.#disk.copy(sourceKey, destinationKey, {
          visibility: 'private',
        }),
      );
      try {
        await callFlydrive(() =>
          this.#disk.copy(metadataKey(sourceKey), metadataKey(destinationKey)),
        );
      } catch (error) {
        try {
          await this.#disk.delete(destinationKey);
        } catch {
          // Preserve the metadata copy failure.
        }
        throw error;
      }
      return;
    }

    await callFlydrive(() =>
      this.#disk.copy(sourceKey, destinationKey, {
        visibility: 'private',
      }),
    );
  }

  async openRead(key: string): Promise<Readable> {
    this.#assertActive();
    return callFlydrive(() => this.#disk.getStream(this.#resolveKey(key)));
  }

  async createCandidateUpload(
    key: string,
    options: SignedUploadOptions,
  ): Promise<SignedStorageRequest> {
    this.#assertS3();
    const url = await callFlydrive(() =>
      this.#disk.getSignedUploadUrl(this.#resolveKey(key), {
        expiresIn: options.expiresInSeconds,
        ContentLength: options.contentLength,
        ...(options.contentType === undefined
          ? {}
          : { contentType: options.contentType }),
      }),
    );
    return {
      method: 'PUT',
      url,
      headers: {
        ...(options.contentType === undefined
          ? {}
          : { 'content-type': options.contentType }),
      },
    };
  }

  async createReadUrl(
    key: string,
    options: SignedReadOptions,
  ): Promise<string> {
    this.#assertS3();
    return callFlydrive(() =>
      this.#disk.getSignedUrl(this.#resolveKey(key), {
        expiresIn: options.expiresInSeconds,
        ...(options.contentDisposition === undefined
          ? {}
          : { contentDisposition: options.contentDisposition }),
        ...(options.cacheControl === undefined
          ? {}
          : { ResponseCacheControl: options.cacheControl }),
      }),
    );
  }

  async delete(key: string): Promise<void> {
    this.#assertActive();
    const resolvedKey = this.#resolveKey(key);
    await this.#disk.delete(resolvedKey);
    if (this.driver === 'local') {
      await this.#disk.delete(metadataKey(resolvedKey));
    }
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
  }

  #resolveKey(key: string): string {
    const normalizedKey = normalizeStorageKey(key);
    return this.#prefix
      ? normalizeStorageKey(`${this.#prefix}/${normalizedKey}`)
      : normalizedKey;
  }

  #assertS3(): void {
    this.#assertActive();
    if (this.driver !== 's3') {
      throw new Error('Signed Files storage operations require S3.');
    }
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('Files storage has been disposed.');
    }
  }
}

const keyNormalizer = new KeyNormalizer();
const flydriveErrors = new WeakSet<object>();

export function isFlydriveStorageError(error: unknown): boolean {
  return isObject(error) && flydriveErrors.has(error);
}

export function normalizeStorageKey(key: string): string {
  return keyNormalizer.normalize(key);
}

function createFsDriver(config: FilesLocalStorageConfig): FSDriver {
  return new FSDriver({ location: config.root, visibility: 'private' });
}

function createS3Driver(config: FilesS3StorageConfig): S3Driver {
  const options: S3DriverOptions = {
    bucket: config.bucket,
    visibility: 'private',
    supportsACL: false,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    ...(config.region === undefined ? {} : { region: config.region }),
    ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
    ...(config.forcePathStyle === undefined
      ? {}
      : { forcePathStyle: config.forcePathStyle }),
    ...(config.credentials === undefined
      ? {}
      : { credentials: config.credentials }),
  };
  return new S3Driver(options);
}

function toStorageMetadata(
  metadata: StorageObjectMetadata,
): StorageObjectMetadata {
  return {
    contentLength: metadata.contentLength,
    ...(metadata.contentType === undefined
      ? {}
      : { contentType: metadata.contentType }),
    ...(metadata.etag === undefined ? {} : { etag: metadata.etag }),
    ...(metadata.lastModified === undefined
      ? {}
      : { lastModified: metadata.lastModified }),
  };
}

function metadataKey(key: string): string {
  return `${key}.files-metadata.json`;
}

function readLocalContentType(value: string): string | undefined {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid Files local metadata.');
  }
  const contentType = (parsed as Record<string, unknown>).contentType;
  if (contentType !== null && typeof contentType !== 'string') {
    throw new Error('Invalid Files local metadata.');
  }
  return contentType ?? undefined;
}

async function callFlydrive<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw markFlydriveError(flydriveCause(error));
  }
}

async function callFlydriveStream<T>(
  contents: Readable,
  operation: () => Promise<T>,
): Promise<T> {
  let producerError: Error | undefined;
  const captureProducerError = (error: Error): void => {
    producerError = error;
  };
  contents.once('error', captureProducerError);
  try {
    return await operation();
  } catch (error) {
    const cause = flydriveCause(error);
    if (producerError !== undefined && cause === producerError) {
      throw producerError;
    }
    throw markFlydriveError(cause);
  } finally {
    contents.off('error', captureProducerError);
  }
}

function markFlydriveError(error: unknown): unknown {
  if (isObject(error)) {
    flydriveErrors.add(error);
    return error;
  }
  const wrapped = new Error('Flydrive storage operation failed.', {
    cause: error,
  });
  flydriveErrors.add(wrapped);
  return wrapped;
}

function flydriveCause(error: unknown): unknown {
  if (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === 'string' &&
    (error as NodeJS.ErrnoException).code?.startsWith('E_CANNOT_') &&
    error.cause !== undefined
  ) {
    return flydriveCause(error.cause);
  }
  return error;
}

function isObject(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}
