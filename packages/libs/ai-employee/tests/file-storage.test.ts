import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import {
  DriveFileStorageFactory,
  FileMetadataPersistenceError,
  type FileMetadata,
  type FileMetadataRepository,
  type FileStorageDriveDisk,
} from '../src/file-storage/index.js';

interface Entity {
  id: string;
  disk: string;
  path: string;
  filename: string;
  extname: string;
  size: number;
  mimetype: string;
  url?: string;
}

interface CreateContext {
  createdById: string;
}

class MetadataRepository implements FileMetadataRepository<
  Entity,
  CreateContext
> {
  public readonly records = new Map<string, FileMetadata<Entity>>();
  public createContext: CreateContext | undefined;

  public async create(
    metadata: Parameters<
      FileMetadataRepository<Entity, CreateContext>['create']
    >[0],
    context: CreateContext,
  ): Promise<FileMetadata<Entity>> {
    const id = String(metadata.id);
    const entity: Entity = {
      id,
      disk: metadata.disk,
      path: metadata.key,
      filename: metadata.filename,
      extname: metadata.extname,
      size: metadata.size,
      mimetype: metadata.mimeType,
      url: metadata.url,
    };
    const result = { ...metadata, id, entity };
    this.records.set(id, result);
    this.createContext = context;
    return result;
  }

  public async findById(
    id: string | number,
  ): Promise<FileMetadata<Entity> | null> {
    return this.records.get(String(id)) ?? null;
  }
}

function createDisk(): FileStorageDriveDisk & {
  objects: Map<string, Uint8Array>;
} {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, content) {
      objects.set(key, content);
    },
    async getStream(key) {
      return Readable.from(objects.get(key) ?? []);
    },
    async getUrl(key) {
      return `/storage/${key}`;
    },
  };
}

describe('DriveFileStorage', () => {
  it('normalizes metadata, persists it, and opens the stored object', async () => {
    const disk = createDisk();
    const repository = new MetadataRepository();
    const storage = new DriveFileStorageFactory({ use: () => disk }).create({
      disk: 'public',
      prefix: 'ai-files',
      metadataRepository: repository,
    });

    const metadata = await storage.write({
      id: '42',
      objectId: '42',
      filename: '../hello world.TXT',
      content: Readable.from(['hello']),
      mimeType: 'text/plain',
      metadataContext: { createdById: 'user-1' },
    });

    expect(metadata).toMatchObject({
      id: '42',
      disk: 'public',
      key: 'ai-files/42-hello-world.TXT',
      filename: 'hello-world.TXT',
      extname: '.txt',
      size: 5,
      mimeType: 'text/plain',
      url: '/storage/ai-files/42-hello-world.TXT',
    });
    expect(repository.createContext).toEqual({ createdById: 'user-1' });
    const opened = await storage.open('42');
    expect(opened?.contentType).toBe('text/plain');
    expect(await readStream(opened!.stream)).toBe('hello');
  });

  it('keeps the object and exposes metadata when persistence fails', async () => {
    const disk = createDisk();
    const failure = new Error('database unavailable');
    const storage = new DriveFileStorageFactory({ use: () => disk }).create({
      disk: 'private',
      prefix: 'documents',
      metadataRepository: {
        create: vi.fn().mockRejectedValue(failure),
        findById: vi.fn(),
      } satisfies FileMetadataRepository<unknown, void>,
    });

    const promise = storage.write({
      id: 7,
      filename: 'report.pdf',
      content: new TextEncoder().encode('pdf'),
      metadataContext: undefined,
    });

    await expect(promise).rejects.toBeInstanceOf(FileMetadataPersistenceError);
    const error = await promise.catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      metadata: {
        id: 7,
        disk: 'private',
        key: 'documents/7-report.pdf',
        extname: '.pdf',
      },
      cause: failure,
    });
    expect(disk.objects.has('documents/7-report.pdf')).toBe(true);
  });
});

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
