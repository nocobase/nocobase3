import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export type FileMetadataId = string | number;

export interface FileMetadata<TEntity = unknown> {
  readonly id: FileMetadataId;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly extname: string;
  readonly size: number;
  readonly mimeType: string;
  readonly url?: string;
  readonly entity: TEntity;
}

export interface NewFileMetadata {
  readonly id?: FileMetadataId;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly extname: string;
  readonly size: number;
  readonly mimeType: string;
  readonly url?: string;
}

export interface FileMetadataRepository<
  TEntity = unknown,
  TCreateContext = void,
> {
  create(
    metadata: NewFileMetadata,
    context: TCreateContext,
  ): Promise<FileMetadata<TEntity>>;
  findById(id: FileMetadataId): Promise<FileMetadata<TEntity> | null>;
}

export type FileStorageContent =
  | Uint8Array
  | ArrayBuffer
  | Blob
  | NodeJS.ReadableStream
  | ReadableStream<Uint8Array>;

export interface WriteFileInput<TCreateContext> {
  readonly id?: FileMetadataId;
  readonly objectId?: string;
  readonly filename: string;
  readonly content: FileStorageContent;
  readonly size?: number;
  readonly mimeType?: string;
  readonly metadataContext: TCreateContext;
}

export interface OpenedFile<TEntity = unknown> {
  readonly metadata: FileMetadata<TEntity>;
  readonly stream: NodeJS.ReadableStream;
  readonly contentType: string;
}

export interface FileStorage<TEntity = unknown, TCreateContext = void> {
  readonly disk: string;
  write(input: WriteFileInput<TCreateContext>): Promise<FileMetadata<TEntity>>;
  open(id: FileMetadataId): Promise<OpenedFile<TEntity> | null>;
  openMetadata(metadata: FileMetadata<TEntity>): Promise<OpenedFile<TEntity>>;
}

export interface CreateFileStorageOptions<TEntity, TCreateContext> {
  readonly disk: string;
  readonly prefix: string;
  readonly metadataRepository: FileMetadataRepository<TEntity, TCreateContext>;
}

export interface FileStorageFactory {
  create<TEntity, TCreateContext>(
    options: CreateFileStorageOptions<TEntity, TCreateContext>,
  ): FileStorage<TEntity, TCreateContext>;
}

export interface FileStorageDriveDisk {
  put(
    key: string,
    content: Uint8Array,
    options?: { contentType?: string },
  ): Promise<void>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  getUrl(key: string): Promise<string>;
}

export interface FileStorageDriveManager {
  use(name?: string): FileStorageDriveDisk;
}

export class FileMetadataPersistenceError extends Error {
  public readonly metadata: NewFileMetadata;

  public constructor(metadata: NewFileMetadata, options?: ErrorOptions) {
    super(
      'The file object was stored, but its metadata could not be persisted.',
      options,
    );
    this.name = 'FileMetadataPersistenceError';
    this.metadata = metadata;
  }
}

interface DriveFileStorageOptions<
  TEntity,
  TCreateContext,
> extends CreateFileStorageOptions<TEntity, TCreateContext> {
  readonly driveDisk: FileStorageDriveDisk;
}

export class DriveFileStorage<TEntity, TCreateContext> implements FileStorage<
  TEntity,
  TCreateContext
> {
  public readonly disk: string;
  private readonly prefix: string;
  private readonly driveDisk: FileStorageDriveDisk;
  private readonly metadataRepository: FileMetadataRepository<
    TEntity,
    TCreateContext
  >;

  public constructor(
    options: DriveFileStorageOptions<TEntity, TCreateContext>,
  ) {
    this.disk = requireDisk(options.disk);
    this.prefix = normalizePrefix(options.prefix);
    this.driveDisk = options.driveDisk;
    this.metadataRepository = options.metadataRepository;
  }

  public async write(
    input: WriteFileInput<TCreateContext>,
  ): Promise<FileMetadata<TEntity>> {
    const filename = normalizeFilename(input.filename);
    const extname = path.extname(filename).toLowerCase();
    const content = await readFileStorageContent(input.content);
    const objectId = normalizeObjectId(
      input.objectId ?? (input.id == null ? randomUUID() : String(input.id)),
    );
    const key = [this.prefix, `${objectId}-${filename}`]
      .filter(Boolean)
      .join('/');
    const mimeType = input.mimeType?.trim() || 'application/octet-stream';

    await this.driveDisk.put(key, content, { contentType: mimeType });

    let url: string | undefined;
    try {
      url = await this.driveDisk.getUrl(key);
    } catch {
      url = undefined;
    }

    const metadata: NewFileMetadata = {
      id: input.id,
      disk: this.disk,
      key,
      filename,
      extname,
      size: input.size ?? content.byteLength,
      mimeType,
      url,
    };

    try {
      return await this.metadataRepository.create(
        metadata,
        input.metadataContext,
      );
    } catch (cause) {
      throw new FileMetadataPersistenceError(metadata, { cause });
    }
  }

  public async open(id: FileMetadataId): Promise<OpenedFile<TEntity> | null> {
    const metadata = await this.metadataRepository.findById(id);
    return metadata ? this.openMetadata(metadata) : null;
  }

  public async openMetadata(
    metadata: FileMetadata<TEntity>,
  ): Promise<OpenedFile<TEntity>> {
    if (metadata.disk !== this.disk) {
      throw new Error(
        `File metadata disk "${metadata.disk}" does not match storage disk "${this.disk}".`,
      );
    }
    return {
      metadata,
      stream: await this.driveDisk.getStream(metadata.key),
      contentType: metadata.mimeType || 'application/octet-stream',
    };
  }
}

export class DriveFileStorageFactory implements FileStorageFactory {
  public constructor(private readonly drive: FileStorageDriveManager) {}

  public create<TEntity, TCreateContext>(
    options: CreateFileStorageOptions<TEntity, TCreateContext>,
  ): FileStorage<TEntity, TCreateContext> {
    const disk = requireDisk(options.disk);
    return new DriveFileStorage({
      ...options,
      disk,
      driveDisk: this.drive.use(disk),
    });
  }
}

export const fileStorageFactoryToken: ServiceToken<FileStorageFactory> =
  createServiceToken<FileStorageFactory>(
    '@nocobase/ai-employee/file-storage-factory',
  );

export interface FileMetadataRecord {
  readonly id?: FileMetadataId;
  readonly disk?: string;
  readonly path?: string;
  readonly filename?: string;
  readonly extname?: string;
  readonly size?: number;
  readonly mimetype?: string;
  readonly url?: string;
}

export function toFileMetadata<TEntity extends FileMetadataRecord>(
  entity: TEntity,
): FileMetadata<TEntity> {
  if (entity.id == null) throw new Error('File metadata has no id.');
  if (!entity.disk) {
    throw new Error(`File "${String(entity.id)}" has no storage disk.`);
  }
  if (!entity.path) {
    throw new Error(`File "${String(entity.id)}" has no storage path.`);
  }
  return {
    id: entity.id,
    disk: entity.disk,
    key: entity.path,
    filename: entity.filename ?? 'file',
    extname:
      entity.extname ?? path.extname(entity.filename ?? '').toLowerCase(),
    size: entity.size ?? 0,
    mimeType: entity.mimetype ?? 'application/octet-stream',
    url: entity.url,
    entity,
  };
}

export function requireDisk(disk: string): string {
  const normalized = disk.trim();
  if (!normalized) throw new Error('A file storage disk is required.');
  return normalized;
}

export function normalizeFilename(filename: string): string {
  const basename = filename.split(/[/\\]/).pop()?.trim() || 'file';
  return (
    basename
      .replace(/[^\w. -]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128) || 'file'
  );
}

async function readFileStorageContent(
  content: FileStorageContent,
): Promise<Uint8Array> {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof Blob !== 'undefined' && content instanceof Blob) {
    return new Uint8Array(await content.arrayBuffer());
  }

  const stream = isWebReadableStream(content)
    ? Readable.from(content as AsyncIterable<Uint8Array>)
    : (content as NodeJS.ReadableStream);
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<unknown>) {
    if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
    else if (chunk instanceof Uint8Array) chunks.push(chunk);
    else chunks.push(Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function isWebReadableStream(
  content: FileStorageContent,
): content is ReadableStream<Uint8Array> {
  return (
    typeof ReadableStream !== 'undefined' && content instanceof ReadableStream
  );
}

function normalizePrefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, '');
}

function normalizeObjectId(objectId: string): string {
  return (
    objectId
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/\\/g, '/') || randomUUID()
  );
}
