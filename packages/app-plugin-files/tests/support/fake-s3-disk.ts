import { Readable } from 'node:stream';

import type { SignedURLOptions, WriteOptions } from 'flydrive/types';

import type { FileUploadPlan } from '../../protocol.js';
import type {
  FilesStorageDisk,
  SignedReadOptions,
  StorageObjectMetadata,
} from '../../server/internal/storage/types.js';

interface FakeObject {
  contents: Buffer;
  metadata: StorageObjectMetadata;
}

export class FakeS3Disk implements FilesStorageDisk {
  readonly #objects = new Map<string, FakeObject>();
  readonly readOptions: SignedReadOptions[] = [];
  readonly uploadRequests: Array<{
    key: string;
    options: SignedURLOptions;
  }> = [];
  readonly copies: Array<{
    source: string;
    destination: string;
    options: WriteOptions;
  }> = [];
  writeChunkCount = 0;
  #copyPause: DeferredCopy | undefined;
  #readFailures = 0;

  constructor(readonly defaultContentType?: string) {}

  async put(
    key: string,
    contents: string | Uint8Array | StorageObjectMetadata,
    options: WriteOptions = {},
  ): Promise<void> {
    if (isStorageMetadata(contents)) {
      this.seed(key, contents);
      return;
    }
    const value = Buffer.from(contents);
    this.#objects.set(key, {
      contents: value,
      metadata: metadataFor(
        value,
        options.contentType ?? this.defaultContentType,
      ),
    });
  }

  async putStream(
    key: string,
    contents: Readable,
    options: WriteOptions = {},
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of contents) {
      this.writeChunkCount += 1;
      chunks.push(Buffer.from(chunk));
    }
    const value = Buffer.concat(chunks);
    this.#objects.set(key, {
      contents: value,
      metadata: metadataFor(
        value,
        options.contentType ?? this.defaultContentType,
      ),
    });
  }

  async get(key: string): Promise<string> {
    return this.#require(key).contents.toString('utf8');
  }

  async getStream(key: string): Promise<Readable> {
    return Readable.from([this.#require(key).contents]);
  }

  async getMetaData(key: string): Promise<StorageObjectMetadata> {
    return { ...this.#require(key).metadata };
  }

  async getSignedUrl(
    key: string,
    options: SignedURLOptions = {},
  ): Promise<string> {
    if (this.#readFailures > 0) {
      this.#readFailures -= 1;
      throw new Error('provider read signing failed with signature=secret');
    }
    this.#require(key);
    this.readOptions.push({
      expiresInSeconds: Number(options.expiresIn),
      ...(typeof options.contentDisposition === 'string'
        ? { contentDisposition: options.contentDisposition }
        : {}),
      ...(typeof options.ResponseCacheControl === 'string'
        ? { cacheControl: options.ResponseCacheControl }
        : {}),
    });
    return `https://read.invalid/${encodeURIComponent(key)}?signature=secret`;
  }

  async getSignedUploadUrl(
    key: string,
    options: SignedURLOptions = {},
  ): Promise<string> {
    this.uploadRequests.push({ key, options: { ...options } });
    return `https://upload.invalid/${encodeURIComponent(key)}`;
  }

  async copy(
    source: string,
    destination: string,
    options: WriteOptions = {},
  ): Promise<void> {
    this.copies.push({ source, destination, options: { ...options } });
    if (this.#copyPause) {
      const pause = this.#copyPause;
      this.#copyPause = undefined;
      pause.markStarted();
      await pause.waitForRelease();
    }
    const sourceObject = this.#require(source);
    this.#objects.set(destination, {
      contents: Buffer.from(sourceObject.contents),
      metadata: { ...sourceObject.metadata },
    });
  }

  async delete(key: string): Promise<void> {
    this.#objects.delete(key);
  }

  seed(
    key: string,
    metadata: StorageObjectMetadata,
    contents: string | Uint8Array = '',
  ): void {
    this.#objects.set(key, {
      contents: Buffer.from(contents),
      metadata: { ...metadata },
    });
  }

  putUpload(
    plan: FileUploadPlan,
    metadata: StorageObjectMetadata,
    contents: string | Uint8Array = '',
  ): string {
    const key = decodeURIComponent(new URL(plan.upload.url).pathname.slice(1));
    this.seed(key, metadata, contents);
    return key;
  }

  has(key: string): boolean {
    return this.#objects.has(key);
  }

  keys(): string[] {
    return [...this.#objects.keys()].sort();
  }

  pauseNextCopy(): { started: Promise<void>; release(): void } {
    const pause = new DeferredCopy();
    this.#copyPause = pause;
    return {
      started: pause.started,
      release: (): void => pause.release(),
    };
  }

  failNextRead(): void {
    this.#readFailures += 1;
  }

  #require(key: string): FakeObject {
    const value = this.#objects.get(key);
    if (!value) {
      const error = new Error('missing object') as NodeJS.ErrnoException;
      error.code = 'NoSuchKey';
      throw error;
    }
    return value;
  }
}

function isStorageMetadata(
  value: string | Uint8Array | StorageObjectMetadata,
): value is StorageObjectMetadata {
  return (
    typeof value === 'object' &&
    !(value instanceof Uint8Array) &&
    'contentLength' in value
  );
}

function metadataFor(
  contents: Buffer,
  contentType: string | undefined,
): StorageObjectMetadata {
  return {
    contentLength: contents.byteLength,
    ...(contentType === undefined ? {} : { contentType }),
  };
}

class DeferredCopy {
  readonly started: Promise<void>;
  readonly #released: Promise<void>;
  #markStarted!: () => void;
  #release!: () => void;

  constructor() {
    this.started = new Promise<void>((resolve) => {
      this.#markStarted = resolve;
    });
    this.#released = new Promise<void>((resolve) => {
      this.#release = resolve;
    });
  }

  markStarted(): void {
    this.#markStarted();
  }

  waitForRelease(): Promise<void> {
    return this.#released;
  }

  release(): void {
    this.#release();
  }
}
