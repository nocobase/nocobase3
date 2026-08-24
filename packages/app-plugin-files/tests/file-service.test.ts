import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/database';
import {
  createFileService,
  FileServiceError,
  resolveFilesConfig,
  type FileService,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import {
  createOpaqueFilesRuntime,
  getFilesRuntimeDataPlane,
} from '../server/internal/runtime.js';
import type {
  LocalCandidateWriteOptions,
  S3Provider,
  SignedReadOptions,
  SignedUploadOptions,
  StorageObjectMetadata,
} from '../server/internal/storage/types.js';

const secret = 'test-secret-with-at-least-thirty-two-bytes';

interface ServiceFixture {
  app: Hono;
  database: DatabaseManager;
  runtime: FilesRuntime;
  service: FileService;
  storageRoot: string;
}

const activeFixtures: ServiceFixture[] = [];

afterEach(async () => {
  await Promise.all(
    activeFixtures.splice(0).map(async (fixture) => {
      await fixture.runtime.dispose();
      await fixture.database.destroy();
      await rm(fixture.storageRoot, { recursive: true, force: true });
    }),
  );
});

describe('public FileService', () => {
  it('streams a Local file into ready state and opens it as a stream', async () => {
    const fixture = await createFixture();
    const chunksRead: string[] = [];
    const file = await fixture.service.createFile({
      name: 'report.txt',
      contentType: 'text/plain',
      content: asyncChunks(['streamed ', 'content'], chunksRead),
      constraints: {
        maxBytes: 64,
        allowedExtensions: ['.txt'],
        allowedContentTypes: ['text/plain'],
      },
    });

    expect(file).toMatchObject({
      status: 'ready',
      name: 'report.txt',
      size: 16,
      contentType: 'text/plain',
    });
    expect(chunksRead).toEqual(['streamed ', 'content']);

    const opened = await fixture.service.openFile(file.id);
    expect(opened.file).toEqual(file);
    expect(await readWebStream(opened.stream)).toBe('streamed content');
  });

  it('streams through the S3 provider abstraction without exposing provider types', async () => {
    const provider = new StreamingS3Provider();
    const fixture = await createFixture(
      {
        storage: {
          driver: 's3',
          bucket: 'private-files',
          region: 'auto',
        },
      },
      provider,
    );
    const file = await fixture.service.createFile({
      name: 'generated.bin',
      contentType: 'application/octet-stream',
      size: 6,
      content: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('abc'));
          controller.enqueue(new TextEncoder().encode('def'));
          controller.close();
        },
      }),
    });

    expect(file).toMatchObject({ status: 'ready', size: 6 });
    expect(provider.writeChunkCount).toBe(2);
    expect(
      await readWebStream((await fixture.service.openFile(file.id)).stream),
    ).toBe('abcdef');
  });

  it('rejects size and type violations with stable service errors', async () => {
    const fixture = await createFixture();
    await expect(
      fixture.service.createFile({
        name: 'too-large.txt',
        contentType: 'text/plain',
        content: asyncChunks(['123', '456']),
        constraints: { maxBytes: 5 },
      }),
    ).rejects.toMatchObject({
      code: 'UPLOAD_SIZE_EXCEEDED',
      status: 413,
    });

    let typeSourceRead = false;
    await expect(
      fixture.service.createFile({
        name: 'wrong.txt',
        contentType: 'text/plain',
        content: {
          async *[Symbol.asyncIterator]() {
            typeSourceRead = true;
            yield new Uint8Array([1]);
          },
        },
        constraints: { allowedContentTypes: ['application/pdf'] },
      }),
    ).rejects.toMatchObject({
      code: 'UPLOAD_TYPE_NOT_ALLOWED',
      status: 415,
    });
    expect(typeSourceRead).toBe(false);
  });

  it('preserves getFiles order and null holes', async () => {
    const fixture = await createFixture();
    const first = await createTextFile(fixture.service, 'first.txt', 'one');
    const second = await createTextFile(fixture.service, 'second.txt', 'two');

    await expect(
      fixture.service.getFiles([second.id, 'missing', first.id, second.id]),
    ).resolves.toEqual([second, null, first, second]);
    await expect(fixture.service.getFile('missing')).resolves.toBeNull();
  });

  it('rejects opening pending files and only cancels pending uploads', async () => {
    const fixture = await createFixture();
    const pending = await fixture.service.createUpload({
      name: 'pending.txt',
      size: 4,
      contentType: 'text/plain',
    });

    await expect(fixture.service.openFile(pending.fileId)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof FileServiceError && error.code === 'FILE_NOT_READY',
    );
    await fixture.service.cancelUpload(pending.fileId);
    await expect(
      fixture.service.getFile(pending.fileId),
    ).resolves.toMatchObject({
      status: 'failed',
    });

    const ready = await createTextFile(fixture.service, 'ready.txt', 'ready');
    await expect(fixture.service.cancelUpload(ready.id)).rejects.toMatchObject({
      code: 'FILE_NOT_READY',
    });
    await expect(fixture.service.getFile(ready.id)).resolves.toEqual(ready);
  });

  it('uses the public FileServiceError family for Routes and direct calls', async () => {
    const fixture = await createFixture();
    expect(() =>
      fixture.service.createFileRoute({
        binding: {
          type: 'field',
          collection: 'missingBusinessRecords',
          recordParam: 'recordId',
          fileField: 'fileId',
        },
        authorize() {},
      }),
    ).toThrow(FileServiceError);

    await expect(fixture.service.openFile('missing')).rejects.toBeInstanceOf(
      FileServiceError,
    );
  });

  it('issues redacted short-lived Core URLs with bounded expiry', async () => {
    let now = new Date('2026-08-24T00:00:00.000Z');
    const fixture = await createFixture({}, undefined, () => now);
    const file = await createTextFile(fixture.service, 'access.txt', 'access');
    const url = await fixture.service.createTemporaryAccessUrl(file.id, {
      expiresInSeconds: 2,
    });

    expect(url).toMatch(/^\/api\/files\/.+\/content\?access=/);
    expect(url).not.toContain(secret);
    expect(url).not.toContain('ready/');
    expect((await fixture.app.request(url)).status).toBe(200);

    now = new Date('2026-08-24T00:00:02.000Z');
    const expired = await fixture.app.request(url);
    expect(expired.status).toBe(403);
    expect(await expired.text()).not.toContain(
      new URL(`http://local${url}`).search,
    );
  });

  it('reuses Public Access enable, reset, disable, and the global flag', async () => {
    const fixture = await createFixture({ publicAccess: { enabled: true } });
    const file = await createTextFile(fixture.service, 'public.txt', 'public');

    const firstUrl = await fixture.service.enablePublicAccess(file.id);
    expect((await fixture.app.request(firstUrl)).status).toBe(200);
    const secondUrl = await fixture.service.resetPublicAccess(file.id);
    expect(secondUrl).not.toBe(firstUrl);
    expect((await fixture.app.request(firstUrl)).status).toBe(403);
    expect((await fixture.app.request(secondUrl)).status).toBe(200);
    await fixture.service.disablePublicAccess(file.id);
    expect((await fixture.app.request(secondUrl)).status).toBe(403);

    const disabled = await createFixture();
    const disabledFile = await createTextFile(
      disabled.service,
      'private.txt',
      'private',
    );
    await expect(
      disabled.service.enablePublicAccess(disabledFile.id),
    ).rejects.toMatchObject({ code: 'PUBLIC_ACCESS_DISABLED' });
  });

  it('shares one Runtime between direct service calls and the Core Route', async () => {
    const fixture = await createFixture();
    const plan = await fixture.service.createUpload({
      name: 'shared.txt',
      size: 6,
      contentType: 'text/plain',
    });
    expect(
      (
        await fixture.app.request(plan.upload.url, {
          method: 'PUT',
          headers: plan.upload.headers,
          body: 'shared',
        })
      ).status,
    ).toBe(200);
    expect(
      (await fixture.app.request(plan.complete.url, { method: 'POST' })).status,
    ).toBe(200);

    await expect(fixture.service.getFile(plan.fileId)).resolves.toMatchObject({
      id: plan.fileId,
      status: 'ready',
    });
  });
});

async function createFixture(
  config: Record<string, unknown> = {},
  s3Provider?: S3Provider,
  clock?: () => Date,
): Promise<ServiceFixture> {
  const database = createDatabaseManager({
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
      },
    },
  });
  await filesMigration.up(createMigrationContext(database.connection()));
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'file-service-'));
  const runtime = createOpaqueFilesRuntime(
    {
      database,
      config: resolveFilesConfig({ appStorageRoot: storageRoot, config }),
      audience: 'file-service-test',
      secret,
      basePath: '/api/files',
    },
    {
      ...(s3Provider === undefined ? {} : { s3Provider }),
      ...(clock === undefined ? {} : { clock }),
    },
  );
  const service = createFileService({ runtime });
  const app = new Hono();
  app.route('/api/files', getFilesRuntimeDataPlane(runtime).createRoute());
  const fixture = { app, database, runtime, service, storageRoot };
  activeFixtures.push(fixture);
  return fixture;
}

async function createTextFile(
  service: FileService,
  name: string,
  contents: string,
) {
  return service.createFile({
    name,
    contentType: 'text/plain',
    size: Buffer.byteLength(contents),
    content: asyncChunks([contents]),
  });
}

function asyncChunks(
  values: readonly string[],
  read?: string[],
): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const value of values) {
        read?.push(value);
        yield new TextEncoder().encode(value);
      }
    },
  };
}

async function readWebStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

class StreamingS3Provider implements S3Provider {
  readonly #objects = new Map<string, Buffer>();
  readonly #contentTypes = new Map<string, string>();
  writeChunkCount = 0;

  async createUploadUrl(
    key: string,
    _options: SignedUploadOptions,
  ): Promise<string> {
    return `https://upload.invalid/${encodeURIComponent(key)}`;
  }

  async putObject(
    key: string,
    contents: Readable,
    options: LocalCandidateWriteOptions,
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of contents) {
      this.writeChunkCount += 1;
      chunks.push(Buffer.from(chunk));
    }
    this.#objects.set(key, Buffer.concat(chunks));
    if (options.contentType) {
      this.#contentTypes.set(key, options.contentType);
    }
  }

  async headObject(key: string): Promise<StorageObjectMetadata> {
    const contents = this.#require(key);
    const contentType = this.#contentTypes.get(key);
    return {
      contentLength: contents.byteLength,
      ...(contentType === undefined ? {} : { contentType }),
    };
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    this.#objects.set(destinationKey, Buffer.from(this.#require(sourceKey)));
    const contentType = this.#contentTypes.get(sourceKey);
    if (contentType) {
      this.#contentTypes.set(destinationKey, contentType);
    }
  }

  async openRead(key: string): Promise<Readable> {
    return Readable.from([this.#require(key)]);
  }

  async createReadUrl(
    key: string,
    _options: SignedReadOptions,
  ): Promise<string> {
    this.#require(key);
    return `https://read.invalid/${encodeURIComponent(key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    this.#objects.delete(key);
    this.#contentTypes.delete(key);
  }

  dispose(): void {}

  #require(key: string): Buffer {
    const value = this.#objects.get(key);
    if (!value) {
      const error = new Error('missing object') as NodeJS.ErrnoException;
      error.code = 'NoSuchKey';
      throw error;
    }
    return value;
  }
}
