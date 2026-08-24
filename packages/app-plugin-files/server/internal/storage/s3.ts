import type { Readable } from 'node:stream';

import type { FilesS3StorageConfig } from '../../config.js';
import { AwsS3Provider } from './aws-s3-provider.js';
import { normalizeStorageKey } from './key.js';
import type {
  LocalCandidateWriteOptions,
  S3FilesStorage,
  S3Provider,
  SignedReadOptions,
  SignedStorageRequest,
  SignedUploadOptions,
  StorageObjectMetadata,
} from './types.js';

export class ProviderS3FilesStorage implements S3FilesStorage {
  readonly driver = 's3' as const;
  readonly #prefix: string | undefined;
  readonly #provider: S3Provider;
  #disposed = false;

  constructor(config: FilesS3StorageConfig, provider?: S3Provider) {
    this.#prefix = config.prefix;
    this.#provider = provider ?? new AwsS3Provider(config);
  }

  async createCandidateUpload(
    key: string,
    options: SignedUploadOptions,
  ): Promise<SignedStorageRequest> {
    this.#assertActive();
    const url = await this.#provider.createUploadUrl(
      this.#resolveKey(key),
      options,
    );
    return {
      method: 'PUT',
      url,
      headers: {
        'if-none-match': '*',
        ...(options.contentType === undefined
          ? {}
          : { 'content-type': options.contentType }),
      },
    };
  }

  async putCandidate(
    key: string,
    contents: Readable,
    options: LocalCandidateWriteOptions = {},
  ): Promise<void> {
    this.#assertActive();
    if (!this.#provider.putObject) {
      throw new Error('The S3 provider does not support streamed writes.');
    }
    await this.#provider.putObject(this.#resolveKey(key), contents, options);
  }

  async head(key: string): Promise<StorageObjectMetadata> {
    this.#assertActive();
    return this.#provider.headObject(this.#resolveKey(key));
  }

  async finalizeCandidate(
    candidateKey: string,
    readyKey: string,
  ): Promise<void> {
    this.#assertActive();
    const sourceKey = this.#resolveKey(candidateKey);
    const destinationKey = this.#resolveKey(readyKey);
    await this.#provider.copyObject(sourceKey, destinationKey);
    try {
      await this.#provider.deleteObject(sourceKey);
    } catch (error) {
      try {
        await this.#provider.deleteObject(destinationKey);
      } catch {
        // Preserve the source deletion failure after best-effort rollback.
      }
      throw error;
    }
  }

  async openRead(key: string): Promise<Readable> {
    this.#assertActive();
    if (!this.#provider.openRead) {
      throw new Error('The S3 provider does not support streamed reads.');
    }
    return this.#provider.openRead(this.#resolveKey(key));
  }

  async createReadUrl(
    key: string,
    options: SignedReadOptions,
  ): Promise<string> {
    this.#assertActive();
    return this.#provider.createReadUrl(this.#resolveKey(key), options);
  }

  async delete(key: string): Promise<void> {
    this.#assertActive();
    await this.#provider.deleteObject(this.#resolveKey(key));
  }

  async dispose(): Promise<void> {
    if (!this.#disposed) {
      this.#disposed = true;
      this.#provider.dispose();
    }
  }

  #resolveKey(key: string): string {
    const normalizedKey = normalizeStorageKey(key);
    return this.#prefix ? `${this.#prefix}/${normalizedKey}` : normalizedKey;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('Files storage has been disposed.');
    }
  }
}
